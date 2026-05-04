-- ───────────────────────────────────────────────────────────────────────────
-- 00013_hq_overview: views + RPC + broadcast trigger for the HQ Overview dashboard (Phase 5)
--
-- Database layer for the HQ Overview dashboard. Adds three `security_invoker`
-- views (group rollup KPIs + country leaderboard + leads-by-service rollup),
-- one `SECURITY DEFINER` RPC (group-wide speed-to-lead 7-day series, hq_admin
-- only), one broadcast trigger (group:all topic for HQ live updates), and one
-- RLS policy on `realtime.messages` gating the group:all topic.
--
-- Mirrors the patterns locked in:
--   * 00006_views.sql               — security_invoker + LEFT JOIN from countries
--   * 00008_realtime_broadcast.sql  — broadcast_changes + topic-gated RLS policy
--   * 00011_country_admin.sql       — SECURITY DEFINER + JWT user_role guard,
--                                     REVOKE from PUBLIC/anon, EXECUTE granted to
--                                     authenticated only.
--
-- JWT CLAIMS NOTE: HQ admin's JWT custom claim has NO `country_code` (RBAC v2
-- — see 00003). Any view body that reads `(SELECT auth.jwt() ->> 'country_code')`
-- returns NULL for HQ → no rows match. The views below MUST NOT read the
-- claim — they aggregate via FK joins to `countries` and rely on the
-- `*_hq_admin_all` RLS policies (00005) for the leads/lead_events/callbacks
-- bypass. Phase 5 RESEARCH.md pitfall 1.
--
-- TIME ZONE NOTE: per-country "today" boundaries use the country's IANA tz
-- (mirrors 00011). The group-wide speed-to-lead RPC uses UTC day boundaries
-- because the group view spans tz — per-country tz makes no sense in a
-- single-axis trend.
--
-- NULL POLICY: speed-to-lead aggregations operate over leads where
-- `first_contacted_at IS NOT NULL` (mirrors 00011 NULL POLICY).
-- ───────────────────────────────────────────────────────────────────────────


-- ─── 1. group_today_stats ──────────────────────────────────────────────────
-- Single-row group-wide rollup powering the 5-tile KPI strip on the HQ
-- Overview. Sums `country_today_stats` (00011) across active countries for
-- today's counts, computes an all-time conversion rate from `leads`, and
-- averages today's seconds-to-first-contact across active countries.
--
-- Cartesian-product safety: `country_today_stats` is one row per active
-- country (LEFT JOIN from countries in 00011), so joining `c` (countries) ⋈
-- `t` (country_today_stats) yields exactly one row per country. The further
-- LEFT JOIN to `leads l` then multiplies that by N leads per country. The
-- aggregate columns are coded with that in mind:
--   * sum(t.total_leads / t.new_today / ...) reads the per-country aggregate
--     once per joined lead row → would double-count without DISTINCT. We
--     therefore take per-country values from `t` ONCE via a CTE that strips
--     the `l` join out.
--   * count(l.id) FILTER … and avg(EXTRACT…) read the joined leads directly.
--
-- Implementation: split into two CTEs and cross-product them — `country_aggs`
-- holds the t-sums (no leads join), `leads_aggs` holds the l-derived metrics.
-- Yields one row.
DROP VIEW IF EXISTS public.group_today_stats;
CREATE VIEW public.group_today_stats AS
WITH country_aggs AS (
  SELECT
    count(c.code) FILTER (WHERE c.status = 'active') AS active_country_count,
    coalesce(sum(t.total_leads),     0)::bigint AS total_leads_group,
    coalesce(sum(t.new_today),       0)::bigint AS new_today_group,
    coalesce(sum(t.contacted_today), 0)::bigint AS contacted_today_group,
    coalesce(sum(t.converted_today), 0)::bigint AS converted_today_group,
    coalesce(sum(t.lost_today),      0)::bigint AS lost_today_group
  FROM public.countries c
  LEFT JOIN public.country_today_stats t ON t.country_code = c.code
  WHERE c.status = 'active'
),
leads_aggs AS (
  -- Per Phase 5 RESEARCH.md open question 3: conversion rate is all-time
  -- (matches mockup math — sum-of-bars equals total-leads tile). Window-less
  -- on purpose; v2 may add a delta later.
  SELECT
    (count(l.id) FILTER (WHERE l.status = 'converted')::numeric
      / NULLIF(count(l.id), 0))::numeric(5,4) AS conversion_rate_alltime,
    -- Today-boundary per country in country tz; only leads created inside
    -- today's window contribute. NULL policy: skip leads with first_contacted_at IS NULL.
    avg(EXTRACT(EPOCH FROM (l.first_contacted_at - l.submitted_at)))
      FILTER (
        WHERE l.first_contacted_at IS NOT NULL
          AND l.created_at >= (date_trunc('day', now() AT TIME ZONE c.timezone) AT TIME ZONE c.timezone)
          AND l.created_at <  (date_trunc('day', now() AT TIME ZONE c.timezone) AT TIME ZONE c.timezone) + interval '1 day'
      )::numeric(10,2) AS avg_speed_to_lead_seconds_today
  FROM public.countries c
  LEFT JOIN public.leads l ON l.country_code = c.code
  WHERE c.status = 'active'
)
SELECT
  ca.active_country_count,
  ca.total_leads_group,
  ca.new_today_group,
  ca.contacted_today_group,
  ca.converted_today_group,
  ca.lost_today_group,
  la.conversion_rate_alltime,
  la.avg_speed_to_lead_seconds_today
FROM country_aggs ca
CROSS JOIN leads_aggs la;

ALTER VIEW public.group_today_stats SET (security_invoker = true);
GRANT SELECT ON public.group_today_stats TO authenticated;

COMMENT ON VIEW public.group_today_stats IS
  'Single-row group-wide rollup for the HQ Overview KPI strip. Sums today counts from country_today_stats across active countries; conversion_rate_alltime is window-less (matches mockup math); avg_speed_to_lead_seconds_today is today-only across active countries (NULL policy: first_contacted_at IS NOT NULL). RLS via security_invoker + hq_admin bypass on leads. Country admins see country-scoped sums (RLS hides other-country rows); HQ sees the full group rollup.';


-- ─── 2. country_performance_today ──────────────────────────────────────────
-- Per-country leaderboard, mockup-shape. NOT an extension of country_leaderboard
-- (00006) — that view is 30d-windowed and kept for trend context. This view
-- is today-shaped per the HQ mockup. One row per active country.
--
-- avg_response_seconds is all-time (matches mockup; today-only would be too
-- volatile across small-volume countries — Phase 5 plan 05-01 task 1 spec).
DROP VIEW IF EXISTS public.country_performance_today;
CREATE VIEW public.country_performance_today AS
SELECT
  c.code AS country_code,
  c.name AS country_name,
  count(l.id) AS total_leads,
  count(l.id) FILTER (
    WHERE l.created_at >= (date_trunc('day', now() AT TIME ZONE c.timezone) AT TIME ZONE c.timezone)
      AND l.created_at <  (date_trunc('day', now() AT TIME ZONE c.timezone) AT TIME ZONE c.timezone) + interval '1 day'
  ) AS new_today,
  (count(l.id) FILTER (WHERE l.first_contacted_at IS NOT NULL)::numeric
    / NULLIF(count(l.id), 0))::numeric(5,4) AS contacted_pct,
  (count(l.id) FILTER (WHERE l.status = 'converted')::numeric
    / NULLIF(count(l.id), 0))::numeric(5,4) AS converted_pct,
  (avg(EXTRACT(EPOCH FROM (l.first_contacted_at - l.submitted_at)))
    FILTER (WHERE l.first_contacted_at IS NOT NULL))::numeric(10,2) AS avg_response_seconds
FROM public.countries c
LEFT JOIN public.leads l ON l.country_code = c.code
WHERE c.status = 'active'
GROUP BY c.code, c.name
ORDER BY count(l.id) DESC;

ALTER VIEW public.country_performance_today SET (security_invoker = true);
GRANT SELECT ON public.country_performance_today TO authenticated;

COMMENT ON VIEW public.country_performance_today IS
  'Per-country leaderboard (mockup-shape) for the HQ Overview Country Performance table. One row per active country: total_leads (all-time), new_today (country tz), contacted_pct + converted_pct + avg_response_seconds (all-time). RLS via security_invoker — HQ sees all 12 active rows; country admins see their own row populated and others zero-filled (RLS hides other-country leads).';


-- ─── 3. leads_by_service_group ─────────────────────────────────────────────
-- All-time count per form_slug across active countries. Powers the HQ
-- "Leads by Service (Group)" horizontal-bar list. One row per form_slug.
--
-- Per Phase 5 RESEARCH.md open question 1: ALL-TIME is the deliberate choice
-- (mockup bars sum to "Total Leads (Group)" 8,432). DIVERGES FROM
-- leads_by_service_today (00011) which is today-only per country. The HQ
-- view is the high-altitude rollup; the country view is the daily slice.
DROP VIEW IF EXISTS public.leads_by_service_group;
CREATE VIEW public.leads_by_service_group AS
SELECT
  l.form_slug,
  count(l.id)::bigint AS leads_count
FROM public.leads l
JOIN public.countries c ON c.code = l.country_code
WHERE c.status = 'active'
GROUP BY l.form_slug
ORDER BY count(l.id) DESC;

ALTER VIEW public.leads_by_service_group SET (security_invoker = true);
GRANT SELECT ON public.leads_by_service_group TO authenticated;

COMMENT ON VIEW public.leads_by_service_group IS
  'All-time count per form_slug across active countries (HQ "Leads by Service" rollup). Diverges from leads_by_service_today (00011, today-only per country) — HQ is high-altitude all-time; country view is daily slice. Decision per Phase 5 RESEARCH.md OQ1 (mockup bars sum to total-leads tile). RLS via security_invoker.';


-- ─── 4. group_speed_to_lead_series ─────────────────────────────────────────
-- Per-day group-wide P50/P75 of seconds-to-first-contact, last p_days days.
-- Mirrors speed_to_lead_series (00011) but: (a) parameter is days int not
-- country+range; (b) day boundary uses UTC (group spans tz so per-country tz
-- makes no sense); (c) role guard accepts hq_admin only — country_admin gets
-- forbidden_role (42501).
--
-- NULL policy: filter to leads with first_contacted_at IS NOT NULL (mirrors
-- 00011 — including uncontacted leads would make the metric look artificially
-- fast).
CREATE OR REPLACE FUNCTION public.group_speed_to_lead_series(p_days int DEFAULT 7)
RETURNS TABLE (
  day            date,
  median_seconds numeric(10,2),
  p75_seconds    numeric(10,2)
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_jwt_role text := (SELECT auth.jwt() ->> 'user_role');
BEGIN
  -- HQ-only. Country admins have no business reading the group series; they
  -- have their own per-country speed_to_lead_series RPC.
  IF v_jwt_role <> 'hq_admin' THEN
    RAISE EXCEPTION 'forbidden_role' USING ERRCODE = '42501';
  END IF;

  IF p_days IS NULL OR p_days <= 0 THEN
    RAISE EXCEPTION 'invalid_range' USING ERRCODE = '22023';
  END IF;

  RETURN QUERY
  SELECT
    date_trunc('day', l.created_at)::date AS day,
    ROUND(
      percentile_cont(0.5) WITHIN GROUP (
        ORDER BY EXTRACT(EPOCH FROM (l.first_contacted_at - l.created_at))
      )::numeric,
      2
    )::numeric(10,2) AS median_seconds,
    ROUND(
      percentile_cont(0.75) WITHIN GROUP (
        ORDER BY EXTRACT(EPOCH FROM (l.first_contacted_at - l.created_at))
      )::numeric,
      2
    )::numeric(10,2) AS p75_seconds
  FROM public.leads l
  WHERE l.first_contacted_at IS NOT NULL
    AND l.created_at >= now() - (p_days || ' days')::interval
  GROUP BY date_trunc('day', l.created_at)::date
  ORDER BY date_trunc('day', l.created_at)::date;
END;
$$;

REVOKE ALL ON FUNCTION public.group_speed_to_lead_series(int) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.group_speed_to_lead_series(int) TO authenticated;

COMMENT ON FUNCTION public.group_speed_to_lead_series(int) IS
  'Per-day group-wide P50/P75 seconds-to-first-contact for the last p_days days (UTC day boundaries — group view spans tz). HQ-admin only; country_admin raises forbidden_role (42501). Operates only over leads where first_contacted_at IS NOT NULL.';


-- ─── 5. broadcast_lead_to_group + leads_broadcast_group trigger ────────────
-- Fans every lead INSERT/UPDATE to a single 'group:all' topic for HQ live
-- updates. Mirrors broadcast_lead_to_country() (00008) but no per-country
-- filter. The HQ page subscribes via usePrivateBroadcast({ topic: 'group:all' })
-- and listens on event:'*' (the webhook path emits UPDATE when assign_lead
-- flips assigned_to, not INSERT — Phase 3/4 lesson).
CREATE OR REPLACE FUNCTION public.broadcast_lead_to_group()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM realtime.broadcast_changes(
    'group:all',         -- topic_name
    TG_OP,               -- event_name
    TG_OP,               -- operation
    TG_TABLE_NAME,       -- table_name
    TG_TABLE_SCHEMA,     -- table_schema
    NEW,                 -- new record
    OLD                  -- old record
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS leads_broadcast_group ON public.leads;
CREATE TRIGGER leads_broadcast_group
  AFTER INSERT OR UPDATE ON public.leads
  FOR EACH ROW EXECUTE FUNCTION public.broadcast_lead_to_group();

COMMENT ON FUNCTION public.broadcast_lead_to_group() IS
  'Pushes every lead INSERT/UPDATE to the group:all private channel for the HQ Overview dashboard. RLS on realtime.messages (hq_group_topic policy) gates subscription to hq_admin only.';


-- ─── 6. hq_group_topic RLS policy on realtime.messages ─────────────────────
-- Gates subscription to the group:all topic — hq_admin only. Country admins
-- and agents are blocked here even if they try to subscribe directly.
-- The existing hq_country_topic policy from 00008 stays — HQ retains the
-- ability to subscribe to a specific country:<code> topic when drilling in.
DROP POLICY IF EXISTS "hq_group_topic" ON realtime.messages;
CREATE POLICY "hq_group_topic" ON realtime.messages
  FOR SELECT TO authenticated
  USING (
    (SELECT auth.jwt() ->> 'user_role') = 'hq_admin'
    AND realtime.topic() = 'group:all'
  );
