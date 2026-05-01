-- ───────────────────────────────────────────────────────────────────────────
-- Paratus Group Dashboards — Sales-Rep Queue RPCs (migration 00009, plan 03-01)
--
-- Three SECURITY DEFINER RPCs that drive the agent call queue, plus one view
-- the queue header strip reads for at-a-glance counters. Every state change
-- the agent UI makes goes through one of these RPCs — never multi-step writes
-- assembled in the browser. Pattern continues from migration 00007:
--   * SECURITY DEFINER + SET search_path = public  (lock against shadowing)
--   * Inside-function `auth.uid() = leads.assigned_to` guard
--   * Inside-function `auth.jwt() ->> 'country_code' = leads.country_code`
--     guard (defence in depth — RLS already pins country_code on leads, but
--     a SECURITY DEFINER bypasses RLS so we re-check here)
--   * Failure → RAISE EXCEPTION USING ERRCODE so PostgREST returns a clean
--     error envelope to the client
--   * EXECUTE granted to `authenticated` (NOT service_role) — these are
--     called from the agent's authenticated browser session, not from the
--     HMAC-authed webhook
--
-- The three RPCs:
--   1. mark_lead_contacted(p_lead_id) — first-touch; flips status='contacted',
--      stamps first_contacted_at, logs a 'call'/'connected' event.
--   2. complete_call(p_lead_id, p_outcome, p_notes, p_lost_reason) — outcome
--      capture from the call modal. Branches on outcome to set status +
--      timestamps; always writes a 'call' event.
--   3. schedule_callback(p_lead_id, p_scheduled_for, p_notes) — books a
--      future callback row + logs 'callback_scheduled' event. Rejects past
--      timestamps.
--
-- Plus the per-agent counter view:
--   * agent_today_stats — to_call_count / completed_today / converted_today /
--     callbacks_pending. security_invoker=true so RLS gates each row.
-- ───────────────────────────────────────────────────────────────────────────

-- ─── 1. mark_lead_contacted ────────────────────────────────────────────────
-- First-touch RPC. Idempotent on first_contacted_at (COALESCE preserves
-- original timestamp on retries) and on the status flip (only 'new' or
-- 'contacted' progress; later statuses raise 'invalid_status'). Always writes
-- a fresh 'call'/'connected' event so retries are audit-visible.
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
  -- Fetch and lock the lead row so concurrent calls don't race on the
  -- COALESCE timestamp + status guard.
  SELECT assigned_to, country_code, status, first_contacted_at
    INTO v_assigned_to, v_country_code, v_status, v_first_contacted
    FROM public.leads
    WHERE id = p_lead_id
    FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'lead not found' USING ERRCODE = 'P0002';
  END IF;

  -- Caller must be the assigned agent AND in the same country.
  IF v_assigned_to IS DISTINCT FROM v_caller
     OR v_country_code IS DISTINCT FROM v_jwt_country THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  -- Don't reverse a terminal status — the lead has already moved past first
  -- contact. The UI shouldn't expose this button for those leads, but defend
  -- in depth.
  IF v_status IN ('qualified', 'converted', 'lost') THEN
    RAISE EXCEPTION 'invalid_status' USING ERRCODE = '22023';
  END IF;

  UPDATE public.leads
    SET status = 'contacted',
        first_contacted_at = COALESCE(first_contacted_at, now())
    WHERE id = p_lead_id
    RETURNING first_contacted_at INTO v_first_contacted;

  -- Audit event. country_code denormalisation is set by the BEFORE INSERT
  -- trigger from migration 00005.
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
  'First-touch RPC for the agent queue. Verifies auth.uid()=assigned_to AND auth.jwt().country_code=leads.country_code, sets status=contacted, stamps first_contacted_at (COALESCE-preserved on retries), logs a call/connected event. Raises forbidden / invalid_status / lead not found.';


-- ─── 2. complete_call ──────────────────────────────────────────────────────
-- Outcome capture from the call modal. Branches on outcome:
--   qualified → status='qualified', qualified_at=now()
--   won       → status='converted', converted_at=now()
--   lost      → status='lost', lost_at=now(), lost_reason=p_lost_reason
--   no_answer → status unchanged (still 'contacted'); event-only
--   callback  → status unchanged; event-only (the actual callback row is
--               written by schedule_callback in a separate RPC call)
-- Always inserts a 'call' lead_events row with outcome + note.
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
    RAISE EXCEPTION 'lead not found' USING ERRCODE = 'P0002';
  END IF;

  IF v_assigned_to IS DISTINCT FROM v_caller
     OR v_country_code IS DISTINCT FROM v_jwt_country THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  IF p_outcome NOT IN ('qualified', 'won', 'lost', 'no_answer', 'callback') THEN
    RAISE EXCEPTION 'invalid_outcome' USING ERRCODE = '22023';
  END IF;

  -- Branch on outcome for status + lifecycle timestamps.
  IF p_outcome = 'qualified' THEN
    UPDATE public.leads
      SET status = 'qualified', qualified_at = now()
      WHERE id = p_lead_id;
    v_new_status := 'qualified';
  ELSIF p_outcome = 'won' THEN
    UPDATE public.leads
      SET status = 'converted', converted_at = now()
      WHERE id = p_lead_id;
    v_new_status := 'converted';
  ELSIF p_outcome = 'lost' THEN
    UPDATE public.leads
      SET status = 'lost', lost_at = now(), lost_reason = p_lost_reason
      WHERE id = p_lead_id;
    v_new_status := 'lost';
  ELSE
    -- 'no_answer' or 'callback' — no status mutation, just the event below.
    SELECT status INTO v_new_status FROM public.leads WHERE id = p_lead_id;
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
  'Outcome capture for the agent call modal. Verifies auth.uid()=assigned_to + country_code match, branches on outcome (qualified/won/lost/no_answer/callback) to update status + lifecycle timestamps, always logs a call event with outcome + note. Raises forbidden / invalid_outcome / lead not found.';


-- ─── 3. schedule_callback ──────────────────────────────────────────────────
-- Books a future callback. Rejects past timestamps. Writes both the callbacks
-- row and a 'callback_scheduled' lead_events row in a single transaction.
CREATE OR REPLACE FUNCTION public.schedule_callback(
  p_lead_id       uuid,
  p_scheduled_for timestamptz,
  p_notes         text DEFAULT NULL
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
  v_callback_id  uuid;
BEGIN
  SELECT assigned_to, country_code
    INTO v_assigned_to, v_country_code
    FROM public.leads
    WHERE id = p_lead_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'lead not found' USING ERRCODE = 'P0002';
  END IF;

  IF v_assigned_to IS DISTINCT FROM v_caller
     OR v_country_code IS DISTINCT FROM v_jwt_country THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  IF p_scheduled_for <= now() THEN
    RAISE EXCEPTION 'invalid_schedule' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.callbacks (
    lead_id, assigned_to, country_code, scheduled_for, status
  ) VALUES (
    p_lead_id, v_caller, v_country_code, p_scheduled_for, 'pending'
  )
  RETURNING id INTO v_callback_id;

  INSERT INTO public.lead_events (lead_id, actor_id, type, note, payload)
    VALUES (
      p_lead_id,
      v_caller,
      'callback_scheduled',
      p_notes,
      jsonb_build_object(
        'callback_id', v_callback_id,
        'scheduled_for', p_scheduled_for
      )
    );

  RETURN jsonb_build_object(
    'callback_id', v_callback_id,
    'lead_id', p_lead_id,
    'scheduled_for', p_scheduled_for
  );
END;
$$;

REVOKE ALL ON FUNCTION public.schedule_callback(uuid, timestamptz, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.schedule_callback(uuid, timestamptz, text) TO authenticated;

COMMENT ON FUNCTION public.schedule_callback(uuid, timestamptz, text) IS
  'Books a future callback for the agent. Verifies auth.uid()=assigned_to + country_code match, rejects past timestamps, INSERTs callbacks row + callback_scheduled lead_event in one transaction. Returns the new callback_id.';


-- ─── 4. agent_today_stats view ─────────────────────────────────────────────
-- Per-agent counters for the queue header strip. Inherits RLS via
-- security_invoker=true — agents see only their own row because leads,
-- lead_events, and callbacks all gate to assigned_to=auth.uid() under the
-- agent policy. HQ admins see every row; country admins see all agents in
-- their country.
DROP VIEW IF EXISTS public.agent_today_stats;
CREATE VIEW public.agent_today_stats AS
SELECT
  ur.user_id AS agent_id,
  ur.country_code,
  count(l.id) FILTER (
    WHERE l.assigned_to = ur.user_id
      AND l.status IN ('new', 'contacted')
  ) AS to_call_count,
  count(le.id) FILTER (
    WHERE le.actor_id = ur.user_id
      AND le.type = 'call'
      AND le.created_at >= date_trunc('day', now())
  ) AS completed_today,
  count(l.id) FILTER (
    WHERE l.assigned_to = ur.user_id
      AND l.status = 'converted'
      AND l.converted_at >= date_trunc('day', now())
  ) AS converted_today,
  count(cb.id) FILTER (
    WHERE cb.assigned_to = ur.user_id
      AND cb.status = 'pending'
  ) AS callbacks_pending
FROM public.user_roles ur
LEFT JOIN public.leads        l  ON l.assigned_to  = ur.user_id
LEFT JOIN public.lead_events  le ON le.actor_id    = ur.user_id
LEFT JOIN public.callbacks    cb ON cb.assigned_to = ur.user_id
WHERE ur.role = 'agent'
GROUP BY ur.user_id, ur.country_code;

ALTER VIEW public.agent_today_stats SET (security_invoker = true);

GRANT SELECT ON public.agent_today_stats TO authenticated;

COMMENT ON VIEW public.agent_today_stats IS
  'Per-agent counters for the queue header strip: to_call_count, completed_today, converted_today, callbacks_pending. Inherits RLS via security_invoker=true — agents see only their own row.';
