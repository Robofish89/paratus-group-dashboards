-- ───────────────────────────────────────────────────────────────────────────
-- Paratus Group Dashboards — Sales-Rep Queue UX redesign (migration 00010, plan 03-04)
--
-- This migration tightens the queue model to support the simplified Phase 3
-- agent surface:
--   * Two new columns on `leads` (`call_attempts`, `last_outcome`) that drive
--     the Follow-ups tab predicate without recomputing it from lead_events.
--   * `mark_lead_contacted` / `complete_call` rewritten to maintain the new
--     columns and to drop the obsolete `'qualified'` outcome (sales-pipeline
--     jargon collapsed into a single Converted outcome at the UI layer; the
--     DB enum value `'won'` is preserved for back-compat).
--   * New `record_no_answer(p_lead_id)` RPC: increments `call_attempts`,
--     stamps `last_outcome='no_answer'`, writes the audit event. Status is
--     NEVER mutated — the Follow-ups tab predicate (call_attempts >= 3 AND
--     last_outcome='no_answer') routes stalled leads without forcing a state
--     change.
--   * `agent_today_stats` view recreated with the new column shape:
--       - to_call_count   — live, leads in your "Call now" pool
--       - follow_ups_count — live, future callbacks + stalled no-answers
--       - done_today      — single-counted (status flip → 1 row, not 2)
--       - converted_today — green emphasis tile
--       - lost_today      — slate tile
--     The legacy `completed_today` and `callbacks_pending` columns are gone;
--     downstream DAL + UI code is updated in lockstep with this migration.
--   * New `agent_stats_in_range(p_from, p_to)` RPC powering the date-range
--     selector. Returns `{converted_count, lost_count, done_count}` for the
--     authenticated agent over an arbitrary window.
--
-- All RPCs follow the same security stance as 00009: SECURITY DEFINER with
-- `SET search_path = public`, inside-function `auth.uid() = leads.assigned_to
-- AND auth.jwt()->>country_code = leads.country_code` guards, EXECUTE
-- granted to `authenticated` only (REVOKE FROM PUBLIC, anon).
-- ───────────────────────────────────────────────────────────────────────────

-- ─── 1. New columns on leads ───────────────────────────────────────────────
ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS call_attempts integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_outcome  text;

COMMENT ON COLUMN public.leads.call_attempts IS
  'Count of recorded call events (incremented by record_no_answer + complete_call). Drives the Follow-ups tab predicate (>= 3 with last_outcome=no_answer = stalled).';
COMMENT ON COLUMN public.leads.last_outcome IS
  'Cached most-recent call outcome: connected | won | lost | no_answer | callback. Tab predicates read this to avoid scanning lead_events on every render.';


-- ─── 2. mark_lead_contacted — also stamps last_outcome='connected' ─────────
CREATE OR REPLACE FUNCTION public.mark_lead_contacted(p_lead_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_assigned_to     uuid;
  v_country_code    text;
  v_status          public.lead_status;
  v_jwt_country     text := (auth.jwt() ->> 'country_code');
  v_caller          uuid := auth.uid();
  v_first_contacted timestamptz;
BEGIN
  SELECT assigned_to, country_code, status, first_contacted_at
    INTO v_assigned_to, v_country_code, v_status, v_first_contacted
    FROM public.leads
    WHERE id = p_lead_id
    FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'lead_not_found' USING ERRCODE = 'P0002';
  END IF;

  IF v_assigned_to IS DISTINCT FROM v_caller
     OR v_country_code IS DISTINCT FROM v_jwt_country THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  -- Don't reverse a terminal status; defence in depth (UI hides this button
  -- for terminal leads, but the dead-button bug from plan 03-03 proved that
  -- relying on the UI alone is not enough).
  IF v_status IN ('qualified', 'converted', 'lost') THEN
    RAISE EXCEPTION 'invalid_status' USING ERRCODE = '22023';
  END IF;

  UPDATE public.leads
    SET status = 'contacted',
        first_contacted_at = COALESCE(first_contacted_at, now()),
        last_outcome = 'connected'
    WHERE id = p_lead_id
    RETURNING first_contacted_at INTO v_first_contacted;

  INSERT INTO public.lead_events (lead_id, actor_id, type, outcome)
    VALUES (p_lead_id, v_caller, 'call', 'connected');

  RETURN jsonb_build_object(
    'lead_id', p_lead_id,
    'first_contacted_at', v_first_contacted
  );
END;
$$;

REVOKE ALL ON FUNCTION public.mark_lead_contacted(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mark_lead_contacted(uuid) TO authenticated;

COMMENT ON FUNCTION public.mark_lead_contacted(uuid) IS
  'First-touch RPC for the agent queue. Verifies auth.uid()=assigned_to AND auth.jwt().country_code=leads.country_code, sets status=contacted + last_outcome=connected, stamps first_contacted_at (COALESCE-preserved on retries), logs a call/connected event. Raises forbidden / invalid_status / lead_not_found.';


-- ─── 3. complete_call — drops 'qualified', maintains call_attempts + last_outcome
CREATE OR REPLACE FUNCTION public.complete_call(
  p_lead_id     uuid,
  p_outcome     text,
  p_notes       text DEFAULT NULL,
  p_lost_reason text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_assigned_to  uuid;
  v_country_code text;
  v_jwt_country  text := (auth.jwt() ->> 'country_code');
  v_caller       uuid := auth.uid();
  v_new_status   public.lead_status;
BEGIN
  SELECT assigned_to, country_code
    INTO v_assigned_to, v_country_code
    FROM public.leads
    WHERE id = p_lead_id
    FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'lead_not_found' USING ERRCODE = 'P0002';
  END IF;

  IF v_assigned_to IS DISTINCT FROM v_caller
     OR v_country_code IS DISTINCT FROM v_jwt_country THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  -- Phase 3 plan 04 narrows the accepted set: 'qualified' was sales-pipeline
  -- jargon collapsed into 'won' at the UI layer (label "Converted"). Keep the
  -- DB enum value 'won' so analytics queries don't break.
  IF p_outcome NOT IN ('won', 'lost', 'no_answer', 'callback') THEN
    RAISE EXCEPTION 'invalid_outcome' USING ERRCODE = '22023';
  END IF;

  IF p_outcome = 'won' THEN
    UPDATE public.leads
      SET status = 'converted',
          converted_at = now(),
          last_outcome = p_outcome,
          call_attempts = call_attempts + 1
      WHERE id = p_lead_id;
    v_new_status := 'converted';
  ELSIF p_outcome = 'lost' THEN
    UPDATE public.leads
      SET status = 'lost',
          lost_at = now(),
          lost_reason = p_lost_reason,
          last_outcome = p_outcome,
          call_attempts = call_attempts + 1
      WHERE id = p_lead_id;
    v_new_status := 'lost';
  ELSE
    -- 'no_answer' or 'callback' — no status mutation, but call_attempts +1
    -- and last_outcome cached for the tab predicate.
    UPDATE public.leads
      SET last_outcome = p_outcome,
          call_attempts = call_attempts + 1
      WHERE id = p_lead_id
      RETURNING status INTO v_new_status;
  END IF;

  INSERT INTO public.lead_events (lead_id, actor_id, type, outcome, note)
    VALUES (p_lead_id, v_caller, 'call', p_outcome, p_notes);

  RETURN jsonb_build_object(
    'lead_id', p_lead_id,
    'status', v_new_status::text,
    'outcome', p_outcome
  );
END;
$$;

REVOKE ALL ON FUNCTION public.complete_call(uuid, text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.complete_call(uuid, text, text, text) TO authenticated;

COMMENT ON FUNCTION public.complete_call(uuid, text, text, text) IS
  'Outcome capture for the agent call surface (Phase 3 plan 04). Accepts won|lost|no_answer|callback only; ''qualified'' is rejected. Always increments call_attempts + caches last_outcome. Status only flips for won → converted and lost → lost. Raises forbidden / invalid_outcome / lead_not_found.';


-- ─── 4. record_no_answer — new RPC ─────────────────────────────────────────
-- The "soft" outcome: agent dialed but nobody picked up. Increments the
-- attempt counter, caches the outcome, writes the audit event. Lead stays in
-- the To-Call pool until call_attempts reaches 3, at which point the
-- Follow-ups tab predicate sweeps it up. No status change.
CREATE OR REPLACE FUNCTION public.record_no_answer(p_lead_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_assigned_to   uuid;
  v_country_code  text;
  v_jwt_country   text := (auth.jwt() ->> 'country_code');
  v_caller        uuid := auth.uid();
  v_call_attempts integer;
BEGIN
  SELECT assigned_to, country_code
    INTO v_assigned_to, v_country_code
    FROM public.leads
    WHERE id = p_lead_id
    FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'lead_not_found' USING ERRCODE = 'P0002';
  END IF;

  IF v_assigned_to IS DISTINCT FROM v_caller
     OR v_country_code IS DISTINCT FROM v_jwt_country THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  UPDATE public.leads
    SET call_attempts = call_attempts + 1,
        last_outcome = 'no_answer'
    WHERE id = p_lead_id
    RETURNING call_attempts INTO v_call_attempts;

  INSERT INTO public.lead_events (lead_id, actor_id, type, outcome)
    VALUES (p_lead_id, v_caller, 'call', 'no_answer');

  RETURN jsonb_build_object(
    'lead_id', p_lead_id,
    'call_attempts', v_call_attempts
  );
END;
$$;

REVOKE ALL ON FUNCTION public.record_no_answer(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.record_no_answer(uuid) TO authenticated;

COMMENT ON FUNCTION public.record_no_answer(uuid) IS
  'Soft no-answer outcome for the agent call surface (Phase 3 plan 04). Increments leads.call_attempts, sets last_outcome=no_answer, logs a call/no_answer event. Never mutates status — agent reaches 3 attempts, the Follow-ups tab predicate routes the lead. Raises forbidden / lead_not_found.';


-- ─── 5. agent_today_stats — recreated with new shape ───────────────────────
-- The legacy view counted every lead_events row of type='call' as
-- "completed_today", which double-counted because mark_lead_contacted writes
-- a 'connected' event AND complete_call writes the outcome event for the
-- same call cycle. The fix: count leads (not events) at terminal status,
-- filtered by the appropriate timestamp.
DROP VIEW IF EXISTS public.agent_today_stats;
CREATE VIEW public.agent_today_stats AS
SELECT
  ur.user_id      AS agent_id,
  ur.country_code AS country_code,
  -- LIVE (no date filter): leads ready for the agent to dial.
  count(l.id) FILTER (
    WHERE l.assigned_to = ur.user_id
      AND l.status IN ('new', 'contacted')
      AND (l.last_outcome IS DISTINCT FROM 'no_answer' OR l.call_attempts < 3)
  ) AS to_call_count,
  -- LIVE: stalled no-answers at the lead level. Pending future callbacks
  -- live in the callbacks table and are added in code (DAL combines both
  -- predicates for the Follow-ups list).
  count(l.id) FILTER (
    WHERE l.assigned_to = ur.user_id
      AND l.status = 'contacted'
      AND l.last_outcome = 'no_answer'
      AND l.call_attempts >= 3
  ) AS follow_ups_count,
  -- TODAY (single-counted): one terminal-status row per finished call cycle.
  count(l.id) FILTER (
    WHERE l.assigned_to = ur.user_id
      AND l.status IN ('converted', 'lost')
      AND l.updated_at >= date_trunc('day', now())
  ) AS done_today,
  -- TODAY (gamification anchor):
  count(l.id) FILTER (
    WHERE l.assigned_to = ur.user_id
      AND l.status = 'converted'
      AND l.converted_at >= date_trunc('day', now())
  ) AS converted_today,
  -- TODAY:
  count(l.id) FILTER (
    WHERE l.assigned_to = ur.user_id
      AND l.status = 'lost'
      AND l.lost_at >= date_trunc('day', now())
  ) AS lost_today
FROM public.user_roles ur
LEFT JOIN public.leads l ON l.assigned_to = ur.user_id
WHERE ur.role = 'agent'
GROUP BY ur.user_id, ur.country_code;

ALTER VIEW public.agent_today_stats SET (security_invoker = true);
GRANT SELECT ON public.agent_today_stats TO authenticated;

COMMENT ON VIEW public.agent_today_stats IS
  'Per-agent counters for the queue header strip (Phase 3 plan 04). to_call_count + follow_ups_count are live; done_today + converted_today + lost_today are gated to today. RLS via security_invoker=true — agents see their own row, country admins see their country, HQ sees every row.';


-- ─── 6. agent_stats_in_range — new RPC for the date-range selector ─────────
-- The Converted/Lost stat tiles support Today / Week / Month / Custom. A
-- view can't take parameters, so this RPC fills the gap. Returns three
-- counts for the authenticated agent's leads in [p_from, p_to).
CREATE OR REPLACE FUNCTION public.agent_stats_in_range(
  p_from timestamptz,
  p_to   timestamptz
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller          uuid := auth.uid();
  v_jwt_country     text := (auth.jwt() ->> 'country_code');
  v_converted_count integer;
  v_lost_count      integer;
  v_done_count      integer;
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  IF p_to <= p_from THEN
    RAISE EXCEPTION 'invalid_range' USING ERRCODE = '22023';
  END IF;

  SELECT
    count(*) FILTER (WHERE status = 'converted' AND converted_at >= p_from AND converted_at < p_to),
    count(*) FILTER (WHERE status = 'lost'      AND lost_at      >= p_from AND lost_at      < p_to),
    count(*) FILTER (WHERE status IN ('converted','lost') AND updated_at >= p_from AND updated_at < p_to)
    INTO v_converted_count, v_lost_count, v_done_count
  FROM public.leads
  WHERE assigned_to = v_caller
    AND country_code = v_jwt_country;

  RETURN jsonb_build_object(
    'converted_count', v_converted_count,
    'lost_count',      v_lost_count,
    'done_count',      v_done_count
  );
END;
$$;

REVOKE ALL ON FUNCTION public.agent_stats_in_range(timestamptz, timestamptz) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.agent_stats_in_range(timestamptz, timestamptz) TO authenticated;

COMMENT ON FUNCTION public.agent_stats_in_range(timestamptz, timestamptz) IS
  'Range-aware Converted/Lost/Done counts for the agent stats tiles (Phase 3 plan 04). Returns jsonb {converted_count, lost_count, done_count}. Gates on auth.uid() + jwt.country_code; raises forbidden / invalid_range.';
