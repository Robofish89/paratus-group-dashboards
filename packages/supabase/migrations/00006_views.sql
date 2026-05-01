-- ───────────────────────────────────────────────────────────────────────────
-- Paratus Group Dashboards — Dashboard Views (migration 00006, plan 02-02 task 2)
--
-- The five views every Phase 3+ dashboard reads from. Dashboards never query
-- raw tables — they query views. Cheaper, faster, easier to RLS, easier to
-- swap underlying schema without touching surface code.
--
-- Views inherit RLS from their underlying tables. With security_invoker=true
-- (Postgres 15+), RLS is evaluated against the *querying* user, not the view
-- owner. Without this flag, every querier sees everything the view's owner
-- can see — i.e. RLS bypass. security_invoker is mandatory, not optional.
--
-- NUMBERING NOTE: plan 02-02 referenced 00005_views.sql; ships as 00006 to
-- account for the Phase 1 migration shift (see 00005_leads_schema.sql header).
-- ───────────────────────────────────────────────────────────────────────────

-- 1. lead_pipeline_by_country — counts per status per country per day.
--    The funnel chart on country admin + HQ overview reads this.
DROP VIEW IF EXISTS public.lead_pipeline_by_country;
CREATE VIEW public.lead_pipeline_by_country AS
SELECT
  country_code,
  date_trunc('day', created_at)::date AS day,
  status,
  count(*) AS lead_count
FROM public.leads
GROUP BY country_code, date_trunc('day', created_at)::date, status;

ALTER VIEW public.lead_pipeline_by_country SET (security_invoker = true);

COMMENT ON VIEW public.lead_pipeline_by_country IS
  'Lead counts per status per country per day. Inherits RLS from leads via security_invoker. Country admins see only their country; agents see only their assigned leads (so they''ll only see funnel slices that include their own).';

-- 2. speed_to_lead_daily — median + p95 first-response by country and day.
--    SLA dashboard primary metric.
DROP VIEW IF EXISTS public.speed_to_lead_daily;
CREATE VIEW public.speed_to_lead_daily AS
SELECT
  country_code,
  date_trunc('day', submitted_at)::date AS day,
  percentile_cont(0.5) WITHIN GROUP (
    ORDER BY EXTRACT(EPOCH FROM (first_contacted_at - submitted_at))
  ) AS median_seconds,
  percentile_cont(0.95) WITHIN GROUP (
    ORDER BY EXTRACT(EPOCH FROM (first_contacted_at - submitted_at))
  ) AS p95_seconds,
  count(*) FILTER (WHERE first_contacted_at IS NOT NULL) AS contacted_count,
  count(*) AS total_count
FROM public.leads
WHERE first_contacted_at IS NOT NULL
   OR submitted_at < now() - interval '24 hours'
GROUP BY country_code, date_trunc('day', submitted_at)::date;

ALTER VIEW public.speed_to_lead_daily SET (security_invoker = true);

COMMENT ON VIEW public.speed_to_lead_daily IS
  'Median + p95 (first_contacted_at - submitted_at) per country per day. Filter excludes leads still inside the 24h SLA window with no contact yet — they would skew the metric. Inherits RLS via security_invoker.';

-- 3. agent_performance — per-agent metrics: leads handled, avg response,
--    qualification rate, conversion rate. Agent leaderboard reads this.
DROP VIEW IF EXISTS public.agent_performance;
CREATE VIEW public.agent_performance AS
SELECT
  ur.user_id AS agent_id,
  ur.country_code,
  ur.display_name,
  count(l.id) AS leads_handled,
  avg(EXTRACT(EPOCH FROM (l.first_contacted_at - l.submitted_at))) AS avg_response_seconds,
  count(l.id) FILTER (WHERE l.status IN ('qualified', 'converted'))::numeric
    / NULLIF(count(l.id), 0) AS qualification_rate,
  count(l.id) FILTER (WHERE l.status = 'converted')::numeric
    / NULLIF(count(l.id), 0) AS conversion_rate
FROM public.user_roles ur
LEFT JOIN public.leads l ON l.assigned_to = ur.user_id
WHERE ur.role = 'agent'
GROUP BY ur.user_id, ur.country_code, ur.display_name;

ALTER VIEW public.agent_performance SET (security_invoker = true);

COMMENT ON VIEW public.agent_performance IS
  'Per-agent KPIs: total leads, avg response time, qualification + conversion rates. Country admin agent table + HQ leaderboard read this. Inherits RLS via security_invoker (countries see their own agents only).';

-- 4. lead_source_mix — counts per form per country per day.
--    Source attribution chart on country admin + HQ.
DROP VIEW IF EXISTS public.lead_source_mix;
CREATE VIEW public.lead_source_mix AS
SELECT
  country_code,
  form_slug,
  date_trunc('day', created_at)::date AS day,
  count(*) AS lead_count
FROM public.leads
GROUP BY country_code, form_slug, date_trunc('day', created_at)::date;

ALTER VIEW public.lead_source_mix SET (security_invoker = true);

COMMENT ON VIEW public.lead_source_mix IS
  'Lead counts per form_slug per country per day. Powers the source attribution chart. Inherits RLS via security_invoker.';

-- 5. country_leaderboard — country-level rollup for HQ overview.
--    Only active countries; coming-soon countries shouldn't pollute KPIs.
DROP VIEW IF EXISTS public.country_leaderboard;
CREATE VIEW public.country_leaderboard AS
SELECT
  c.code AS country_code,
  c.name AS country_name,
  c.status,
  count(l.id) AS total_leads_30d,
  count(l.id) FILTER (WHERE l.status = 'converted') AS conversions_30d,
  count(l.id) FILTER (WHERE l.status = 'converted')::numeric
    / NULLIF(count(l.id), 0) AS conversion_rate_30d
FROM public.countries c
LEFT JOIN public.leads l
  ON l.country_code = c.code
 AND l.created_at >= now() - interval '30 days'
WHERE c.status = 'active'
GROUP BY c.code, c.name, c.status;

ALTER VIEW public.country_leaderboard SET (security_invoker = true);

COMMENT ON VIEW public.country_leaderboard IS
  'Country-level conversion + volume for the HQ overview. WHERE c.status = ''active'' excludes coming-soon countries until activated. Inherits RLS via security_invoker so country admins see their own row only; HQ sees all 12 active.';

-- 6. Grants — every authenticated user can SELECT, RLS handles the rest.
GRANT SELECT ON public.lead_pipeline_by_country TO authenticated;
GRANT SELECT ON public.speed_to_lead_daily       TO authenticated;
GRANT SELECT ON public.agent_performance         TO authenticated;
GRANT SELECT ON public.lead_source_mix           TO authenticated;
GRANT SELECT ON public.country_leaderboard       TO authenticated;
