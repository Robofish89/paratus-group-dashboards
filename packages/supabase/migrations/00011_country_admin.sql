-- ───────────────────────────────────────────────────────────────────────────
-- 00011_country_admin: views + RPCs for the Country Admin Dashboard (Phase 4)
--
-- Database layer for the Country Admin Dashboard. Adds four `security_invoker`
-- views (today-scoped tiles + leads-by-service + status pipeline funnel +
-- speed-to-lead gauge) and four `SECURITY DEFINER` RPCs (range-aware stats +
-- agent performance + speed-to-lead 7-day series + cross-country-safe
-- reassignment). Mirrors the patterns locked in:
--   * 00006_views.sql       — security_invoker + LEFT JOIN from anchor table
--   * 00009_queue_rpcs.sql  — SECURITY DEFINER + JWT user_role + country_code
--                             guards inside the function, REVOKE from public/anon,
--                             EXECUTE granted to authenticated only.
--   * 00010_queue_ux_redesign.sql — agent_today_stats shape + range-aware RPCs.
--
-- JWT CLAIMS NOTE: Phase 1's custom_access_token_hook injects `user_role` and
-- `country_code` (NOT `role`/`country`). Every guard below reads
-- `auth.jwt() ->> 'user_role'` and `auth.jwt() ->> 'country_code'`. The role
-- enum value for sales reps is `agent` (not `sales_rep`) — see migration 00001.
--
-- TIME ZONE NOTE: "today" is calendar-day in the country's IANA timezone
-- (countries.timezone, seeded by migration 00004). The boundary is computed
-- as `date_trunc('day', now() AT TIME ZONE c.timezone) AT TIME ZONE c.timezone`
-- which yields a UTC timestamptz at the start of the country's local day.
--
-- NULL POLICY: speed-to-lead aggregations operate over leads where
-- `first_contacted_at IS NOT NULL`. Including NULL would silently drop fresh
-- (uncalled) leads from AVG/percentile and make the metric look artificially
-- fast — see Phase 4 RESEARCH.md pitfall 3.
-- ───────────────────────────────────────────────────────────────────────────


-- ─── 1. country_today_stats ────────────────────────────────────────────────
-- One row per active country. Today's KPI tile counts plus the matching
-- "yesterday" counts so the UI can render a vs-yesterday delta without a
-- second query. LEFT JOINed from `countries` so every active country gets a
-- row even when zero leads exist (UI doesn't need to handle missing rows —
-- mirrors agent_today_stats's LEFT-JOIN-from-user_roles shape from 00010).
DROP VIEW IF EXISTS public.country_today_stats;
CREATE VIEW public.country_today_stats AS
WITH bounds AS (
  SELECT
    c.code AS country_code,
    -- Start of today in the country's local time zone, returned as a UTC tstz.
    (date_trunc('day', now() AT TIME ZONE c.timezone) AT TIME ZONE c.timezone) AS today_start,
    (date_trunc('day', now() AT TIME ZONE c.timezone) AT TIME ZONE c.timezone) + interval '1 day' AS tomorrow_start,
    (date_trunc('day', now() AT TIME ZONE c.timezone) AT TIME ZONE c.timezone) - interval '1 day' AS yesterday_start
  FROM public.countries c
  WHERE c.status = 'active'
)
SELECT
  b.country_code,
  count(l.id) FILTER (
    WHERE l.country_code = b.country_code
  ) AS total_leads,
  -- Today (calendar day, country tz)
  count(l.id) FILTER (
    WHERE l.country_code = b.country_code
      AND l.status = 'new'
      AND l.created_at >= b.today_start
      AND l.created_at <  b.tomorrow_start
  ) AS new_today,
  count(l.id) FILTER (
    WHERE l.country_code = b.country_code
      AND l.status = 'contacted'
      AND l.first_contacted_at >= b.today_start
      AND l.first_contacted_at <  b.tomorrow_start
  ) AS contacted_today,
  count(l.id) FILTER (
    WHERE l.country_code = b.country_code
      AND l.status = 'converted'
      AND l.updated_at >= b.today_start
      AND l.updated_at <  b.tomorrow_start
  ) AS converted_today,
  count(l.id) FILTER (
    WHERE l.country_code = b.country_code
      AND l.status = 'lost'
      AND l.updated_at >= b.today_start
      AND l.updated_at <  b.tomorrow_start
  ) AS lost_today,
  -- Yesterday (calendar day, country tz)
  count(l.id) FILTER (
    WHERE l.country_code = b.country_code
      AND l.status = 'new'
      AND l.created_at >= b.yesterday_start
      AND l.created_at <  b.today_start
  ) AS new_yesterday,
  count(l.id) FILTER (
    WHERE l.country_code = b.country_code
      AND l.status = 'contacted'
      AND l.first_contacted_at >= b.yesterday_start
      AND l.first_contacted_at <  b.today_start
  ) AS contacted_yesterday,
  count(l.id) FILTER (
    WHERE l.country_code = b.country_code
      AND l.status = 'converted'
      AND l.updated_at >= b.yesterday_start
      AND l.updated_at <  b.today_start
  ) AS converted_yesterday,
  count(l.id) FILTER (
    WHERE l.country_code = b.country_code
      AND l.status = 'lost'
      AND l.updated_at >= b.yesterday_start
      AND l.updated_at <  b.today_start
  ) AS lost_yesterday
FROM bounds b
LEFT JOIN public.leads l ON l.country_code = b.country_code
GROUP BY b.country_code;

ALTER VIEW public.country_today_stats SET (security_invoker = true);
GRANT SELECT ON public.country_today_stats TO authenticated;

COMMENT ON VIEW public.country_today_stats IS
  'KPI tile counts (total + new/contacted/converted/lost, today + yesterday) per active country in country-local time zone. LEFT JOIN from countries so every active country appears even with zero leads. RLS via security_invoker=true — country admins see only their country, hq_admin sees all.';


-- ─── 2. leads_by_service_today ─────────────────────────────────────────────
-- Per-form per-country counts for today's leads. UI sorts and renders the
-- top N services in the Leads-by-Service horizontal bar chart.
DROP VIEW IF EXISTS public.leads_by_service_today;
CREATE VIEW public.leads_by_service_today AS
WITH bounds AS (
  SELECT
    c.code AS country_code,
    (date_trunc('day', now() AT TIME ZONE c.timezone) AT TIME ZONE c.timezone) AS today_start,
    (date_trunc('day', now() AT TIME ZONE c.timezone) AT TIME ZONE c.timezone) + interval '1 day' AS tomorrow_start
  FROM public.countries c
  WHERE c.status = 'active'
)
SELECT
  l.country_code,
  l.form_slug,
  count(l.id) AS leads_count
FROM public.leads l
JOIN bounds b ON b.country_code = l.country_code
WHERE l.created_at >= b.today_start
  AND l.created_at <  b.tomorrow_start
GROUP BY l.country_code, l.form_slug;

ALTER VIEW public.leads_by_service_today SET (security_invoker = true);
GRANT SELECT ON public.leads_by_service_today TO authenticated;

COMMENT ON VIEW public.leads_by_service_today IS
  'One row per (country_code, form_slug) for leads created today (country-local tz). Drives the Leads-by-Service horizontal bar chart. RLS via security_invoker=true.';


-- ─── 3. status_pipeline_today ──────────────────────────────────────────────
-- Funnel counts per status for today's leads, per country. The full
-- lead_status enum is preserved (including `qualified`) so analytics
-- back-compat holds even though Phase 3 plan 03-04 stopped emitting it from
-- complete_call. UI renders five funnel segments.
DROP VIEW IF EXISTS public.status_pipeline_today;
CREATE VIEW public.status_pipeline_today AS
WITH bounds AS (
  SELECT
    c.code AS country_code,
    (date_trunc('day', now() AT TIME ZONE c.timezone) AT TIME ZONE c.timezone) AS today_start,
    (date_trunc('day', now() AT TIME ZONE c.timezone) AT TIME ZONE c.timezone) + interval '1 day' AS tomorrow_start
  FROM public.countries c
  WHERE c.status = 'active'
)
SELECT
  l.country_code,
  l.status,
  count(l.id) AS count
FROM public.leads l
JOIN bounds b ON b.country_code = l.country_code
WHERE l.created_at >= b.today_start
  AND l.created_at <  b.tomorrow_start
GROUP BY l.country_code, l.status;

ALTER VIEW public.status_pipeline_today SET (security_invoker = true);
GRANT SELECT ON public.status_pipeline_today TO authenticated;

COMMENT ON VIEW public.status_pipeline_today IS
  'Per-country per-status counts for leads created today (country-local tz). Includes all five lead_status enum values for analytics back-compat — `qualified` is preserved even though Phase 3 plan 03-04 stopped emitting it. RLS via security_invoker=true.';


-- ─── 4. country_speed_to_lead_today ────────────────────────────────────────
-- Today-only, single-row-per-country variant for the gauge tile. Migration
-- 00006 already ships speed_to_lead_daily (per-day P50/P95) for the
-- multi-day chart; this view is the today-only gauge counterpart. Different
-- shape, both kept.
--
-- NULL policy: aggregations operate over leads where
-- `first_contacted_at IS NOT NULL` (see header NULL POLICY note).
DROP VIEW IF EXISTS public.country_speed_to_lead_today;
CREATE VIEW public.country_speed_to_lead_today AS
WITH bounds AS (
  SELECT
    c.code AS country_code,
    (date_trunc('day', now() AT TIME ZONE c.timezone) AT TIME ZONE c.timezone) AS today_start,
    (date_trunc('day', now() AT TIME ZONE c.timezone) AT TIME ZONE c.timezone) + interval '1 day' AS tomorrow_start
  FROM public.countries c
  WHERE c.status = 'active'
)
SELECT
  b.country_code,
  count(l.id) FILTER (
    WHERE l.country_code = b.country_code
      AND l.first_contacted_at IS NOT NULL
      AND l.created_at >= b.today_start
      AND l.created_at <  b.tomorrow_start
  ) AS total_contacted,
  count(l.id) FILTER (
    WHERE l.country_code = b.country_code
      AND l.first_contacted_at IS NOT NULL
      AND (l.first_contacted_at - l.created_at) <= interval '5 minutes'
      AND l.created_at >= b.today_start
      AND l.created_at <  b.tomorrow_start
  ) AS on_target_count,
  -- Cast to numeric(5,2) so UI gets a stable two-decimal percent. NULLIF
  -- shields against divide-by-zero when no contacted leads exist today.
  ROUND(
    (count(l.id) FILTER (
      WHERE l.country_code = b.country_code
        AND l.first_contacted_at IS NOT NULL
        AND (l.first_contacted_at - l.created_at) <= interval '5 minutes'
        AND l.created_at >= b.today_start
        AND l.created_at <  b.tomorrow_start
    ))::numeric * 100.0
    / NULLIF(count(l.id) FILTER (
      WHERE l.country_code = b.country_code
        AND l.first_contacted_at IS NOT NULL
        AND l.created_at >= b.today_start
        AND l.created_at <  b.tomorrow_start
    ), 0),
    2
  )::numeric(5,2) AS on_target_pct,
  ROUND(
    avg(EXTRACT(EPOCH FROM (l.first_contacted_at - l.created_at))) FILTER (
      WHERE l.country_code = b.country_code
        AND l.first_contacted_at IS NOT NULL
        AND l.created_at >= b.today_start
        AND l.created_at <  b.tomorrow_start
    )::numeric,
    2
  )::numeric(10,2) AS avg_response_seconds
FROM bounds b
LEFT JOIN public.leads l ON l.country_code = b.country_code
GROUP BY b.country_code;

ALTER VIEW public.country_speed_to_lead_today SET (security_invoker = true);
GRANT SELECT ON public.country_speed_to_lead_today TO authenticated;

COMMENT ON VIEW public.country_speed_to_lead_today IS
  'Today-only speed-to-lead gauge (one row per active country): total_contacted, on_target_count (within 5 min), on_target_pct, avg_response_seconds. Operates only over leads where first_contacted_at IS NOT NULL (NULL policy — see migration header). Coexists with speed_to_lead_daily (00006) which serves the multi-day chart. RLS via security_invoker=true.';
