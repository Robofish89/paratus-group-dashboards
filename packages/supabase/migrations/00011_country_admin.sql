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


-- ─── 5. country_stats_in_range ─────────────────────────────────────────────
-- Range-aware status counts for the country admin's KPI tiles (week / month /
-- custom). Single-row return shape — same precedent as agent_stats_in_range
-- in 00010, except this is per-country (not per-agent) so an HQ admin can
-- query any country and a country admin only their own.
CREATE OR REPLACE FUNCTION public.country_stats_in_range(
  p_country text,
  p_from    timestamptz,
  p_to      timestamptz
)
RETURNS TABLE (
  converted_count bigint,
  lost_count      bigint,
  contacted_count bigint,
  new_count       bigint
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_jwt_role    text := (SELECT auth.jwt() ->> 'user_role');
  v_jwt_country text := (SELECT auth.jwt() ->> 'country_code');
BEGIN
  -- Role + country guard. country_admin pinned to their own country;
  -- hq_admin allowed any country.
  IF v_jwt_role = 'country_admin' THEN
    IF v_jwt_country IS DISTINCT FROM p_country THEN
      RAISE EXCEPTION 'forbidden_country' USING ERRCODE = '42501';
    END IF;
  ELSIF v_jwt_role <> 'hq_admin' THEN
    RAISE EXCEPTION 'forbidden_country' USING ERRCODE = '42501';
  END IF;

  IF p_to <= p_from THEN
    RAISE EXCEPTION 'invalid_range' USING ERRCODE = '22023';
  END IF;

  RETURN QUERY
  SELECT
    count(*) FILTER (
      WHERE status = 'converted'
        AND updated_at >= p_from AND updated_at < p_to
    )::bigint,
    count(*) FILTER (
      WHERE status = 'lost'
        AND updated_at >= p_from AND updated_at < p_to
    )::bigint,
    count(*) FILTER (
      WHERE first_contacted_at >= p_from AND first_contacted_at < p_to
    )::bigint,
    count(*) FILTER (
      WHERE created_at >= p_from AND created_at < p_to
    )::bigint
  FROM public.leads
  WHERE country_code = p_country;
END;
$$;

REVOKE ALL ON FUNCTION public.country_stats_in_range(text, timestamptz, timestamptz) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.country_stats_in_range(text, timestamptz, timestamptz) TO authenticated;

COMMENT ON FUNCTION public.country_stats_in_range(text, timestamptz, timestamptz) IS
  'Range-aware status counts for the country admin KPI tiles. country_admin must match p_country; hq_admin allowed any country. Raises forbidden_country / invalid_range.';


-- ─── 6. agent_performance_in_range ─────────────────────────────────────────
-- One row per agent in the country, with assignment + outcome + response
-- counts for the requested window. LEFT JOIN from user_roles so empty/zero-
-- work agents still appear (same precedent as agent_today_stats).
CREATE OR REPLACE FUNCTION public.agent_performance_in_range(
  p_country text,
  p_from    timestamptz,
  p_to      timestamptz
)
RETURNS TABLE (
  agent_id             uuid,
  full_name            text,
  leads_assigned       bigint,
  leads_contacted      bigint,
  leads_converted      bigint,
  leads_lost           bigint,
  avg_response_seconds numeric(10,2)
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_jwt_role    text := (SELECT auth.jwt() ->> 'user_role');
  v_jwt_country text := (SELECT auth.jwt() ->> 'country_code');
BEGIN
  IF v_jwt_role = 'country_admin' THEN
    IF v_jwt_country IS DISTINCT FROM p_country THEN
      RAISE EXCEPTION 'forbidden_country' USING ERRCODE = '42501';
    END IF;
  ELSIF v_jwt_role <> 'hq_admin' THEN
    RAISE EXCEPTION 'forbidden_country' USING ERRCODE = '42501';
  END IF;

  IF p_to <= p_from THEN
    RAISE EXCEPTION 'invalid_range' USING ERRCODE = '22023';
  END IF;

  RETURN QUERY
  SELECT
    ur.user_id AS agent_id,
    ur.display_name AS full_name,
    -- Range-windowed: leads created in [p_from, p_to) and currently assigned
    -- to this agent. Without the window, the count would balloon to the
    -- agent's lifetime assignment total even when the caller asked for a
    -- specific reporting window.
    count(l.id) FILTER (
      WHERE l.created_at >= p_from
        AND l.created_at <  p_to
    )::bigint AS leads_assigned,
    count(l.id) FILTER (
      WHERE l.first_contacted_at IS NOT NULL
        AND l.first_contacted_at >= p_from
        AND l.first_contacted_at <  p_to
    )::bigint AS leads_contacted,
    count(l.id) FILTER (
      WHERE l.status = 'converted'
        AND l.converted_at >= p_from
        AND l.converted_at <  p_to
    )::bigint AS leads_converted,
    count(l.id) FILTER (
      WHERE l.status = 'lost'
        AND l.lost_at >= p_from
        AND l.lost_at <  p_to
    )::bigint AS leads_lost,
    ROUND(
      avg(EXTRACT(EPOCH FROM (l.first_contacted_at - l.created_at))) FILTER (
        WHERE l.first_contacted_at IS NOT NULL
          AND l.created_at >= p_from
          AND l.created_at <  p_to
      )::numeric,
      2
    )::numeric(10,2) AS avg_response_seconds
  FROM public.user_roles ur
  LEFT JOIN public.leads l
    ON l.assigned_to = ur.user_id
  WHERE ur.role = 'agent'
    AND ur.country_code::text = p_country
  GROUP BY ur.user_id, ur.display_name;
END;
$$;

REVOKE ALL ON FUNCTION public.agent_performance_in_range(text, timestamptz, timestamptz) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.agent_performance_in_range(text, timestamptz, timestamptz) TO authenticated;

COMMENT ON FUNCTION public.agent_performance_in_range(text, timestamptz, timestamptz) IS
  'Per-agent performance for the country admin Sales Rep table. LEFT JOIN from user_roles so zero-work agents still appear. country_admin pinned to own country; hq_admin allowed any. Raises forbidden_country / invalid_range.';


-- ─── 7. speed_to_lead_series ───────────────────────────────────────────────
-- One row per calendar day in country tz inside [p_from, p_to). Median
-- (P50) and P75 of seconds-to-first-contact for that day's leads.
--
-- Decision (per RESEARCH.md open question 1): the sparkline reads
-- `median_seconds` because it resists outliers (one stale lead getting its
-- first call would explode an avg). The KPI tile labelled "Avg Response
-- Time" still reads `avg_response_seconds` from country_speed_to_lead_today
-- because that's the literal label on the mockup. Asymmetry is intentional.
CREATE OR REPLACE FUNCTION public.speed_to_lead_series(
  p_country text,
  p_from    timestamptz,
  p_to      timestamptz
)
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
  v_jwt_role    text := (SELECT auth.jwt() ->> 'user_role');
  v_jwt_country text := (SELECT auth.jwt() ->> 'country_code');
  v_tz          text;
BEGIN
  IF v_jwt_role = 'country_admin' THEN
    IF v_jwt_country IS DISTINCT FROM p_country THEN
      RAISE EXCEPTION 'forbidden_country' USING ERRCODE = '42501';
    END IF;
  ELSIF v_jwt_role <> 'hq_admin' THEN
    RAISE EXCEPTION 'forbidden_country' USING ERRCODE = '42501';
  END IF;

  IF p_to <= p_from THEN
    RAISE EXCEPTION 'invalid_range' USING ERRCODE = '22023';
  END IF;

  SELECT timezone INTO v_tz FROM public.countries WHERE code = p_country;
  IF v_tz IS NULL THEN
    RAISE EXCEPTION 'not_found' USING ERRCODE = 'P0002';
  END IF;

  RETURN QUERY
  SELECT
    (l.created_at AT TIME ZONE v_tz)::date AS day,
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
  WHERE l.country_code = p_country
    AND l.first_contacted_at IS NOT NULL
    AND l.created_at >= p_from
    AND l.created_at <  p_to
  GROUP BY (l.created_at AT TIME ZONE v_tz)::date
  ORDER BY (l.created_at AT TIME ZONE v_tz)::date;
END;
$$;

REVOKE ALL ON FUNCTION public.speed_to_lead_series(text, timestamptz, timestamptz) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.speed_to_lead_series(text, timestamptz, timestamptz) TO authenticated;

COMMENT ON FUNCTION public.speed_to_lead_series(text, timestamptz, timestamptz) IS
  'Per-day P50/P75 seconds-to-first-contact for the speed-to-lead sparkline. Day is calendar day in country tz. Operates only over leads where first_contacted_at IS NOT NULL. Raises forbidden_country / invalid_range / not_found (unknown country).';


-- ─── 8. reassign_lead ──────────────────────────────────────────────────────
-- Atomic reassignment with role guard, country-scope guard, and
-- defence-in-depth cross-country target guard. Writes both the leads update
-- and the audit lead_event in one transaction.
CREATE OR REPLACE FUNCTION public.reassign_lead(
  p_lead_id     uuid,
  p_to_agent_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_jwt_role       text := (SELECT auth.jwt() ->> 'user_role');
  v_jwt_country    text := (SELECT auth.jwt() ->> 'country_code');
  v_caller         uuid := (SELECT auth.uid());
  v_lead_country   text;
  v_target_country text;
BEGIN
  -- Role guard.
  IF v_jwt_role NOT IN ('country_admin', 'hq_admin') THEN
    RAISE EXCEPTION 'forbidden_role' USING ERRCODE = '42501';
  END IF;

  SELECT country_code INTO v_lead_country
  FROM public.leads WHERE id = p_lead_id;
  IF v_lead_country IS NULL THEN
    RAISE EXCEPTION 'not_found' USING ERRCODE = 'P0002';
  END IF;

  SELECT country_code::text INTO v_target_country
  FROM public.user_roles WHERE user_id = p_to_agent_id;
  IF v_target_country IS NULL THEN
    RAISE EXCEPTION 'not_found' USING ERRCODE = 'P0002';
  END IF;

  -- Country admin pinned to their JWT country.
  IF v_jwt_role = 'country_admin' AND v_jwt_country IS DISTINCT FROM v_lead_country THEN
    RAISE EXCEPTION 'forbidden_country' USING ERRCODE = '42501';
  END IF;

  -- Defence-in-depth cross-country target guard. Stops an HQ admin (who has
  -- no country-scope check above) from re-pointing a lead at an agent in a
  -- different country, which would create an "assigned to a user who can't
  -- read it" zombie.
  IF v_target_country IS DISTINCT FROM v_lead_country THEN
    RAISE EXCEPTION 'cross_country_assignment' USING ERRCODE = '42501';
  END IF;

  UPDATE public.leads
    SET assigned_to = p_to_agent_id,
        updated_at  = now()
    WHERE id = p_lead_id;

  -- country_code is denormalised on lead_events; the BEFORE INSERT trigger
  -- (00005) backstops it but we set it explicitly here for clarity.
  INSERT INTO public.lead_events (lead_id, actor_id, type, payload, country_code)
  VALUES (
    p_lead_id,
    v_caller,
    'reassigned',
    jsonb_build_object('to_agent_id', p_to_agent_id),
    v_lead_country
  );
END;
$$;

REVOKE ALL ON FUNCTION public.reassign_lead(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reassign_lead(uuid, uuid) TO authenticated;

COMMENT ON FUNCTION public.reassign_lead(uuid, uuid) IS
  'Atomic lead reassignment for country/HQ admins. Verifies user_role, JWT country (country_admin only), and the target agent''s country matches the lead''s country (defence-in-depth — stops HQ admin from creating a cross-country zombie). Writes the leads update + a lead_events(type=reassigned) audit row in one transaction. Raises forbidden_role / forbidden_country / cross_country_assignment / not_found.';
