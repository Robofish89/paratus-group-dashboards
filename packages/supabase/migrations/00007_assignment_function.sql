-- ───────────────────────────────────────────────────────────────────────────
-- Paratus Group Dashboards — Assignment + Ingest RPC (migration 00007, plan 02-03 task 1)
--
-- Database-side intelligence for the lead pipeline:
--   1. leads_dedupe_idx — partial unique index on (form_slug, contact, 5-min bucket)
--      so retries inside the dedupe window collide on ON CONFLICT.
--   2. assign_lead(p_lead_id, p_country) — concurrency-safe round-robin using
--      FOR UPDATE … SKIP LOCKED on the agent pool (RESEARCH Pattern 2,
--      Pitfall 4). Falls back to country_admin if no active agent exists.
--   3. ingest_lead(payload) — atomic wrapper called by /api/leads/ingest.
--      Validates references, inserts (with idempotency catch), logs the
--      'created' event, and calls assign_lead. Returns {lead_id, agent_id,
--      duplicate}.
--
-- NUMBERING NOTE: plan 02-03 referenced 00006_assignment_function.sql, but
-- Phase 1 already shipped 00002_allow_auth_admin_read_user_roles.sql, plan
-- 02-01 used 00003+00004, plan 02-02 used 00005+00006. So this migration
-- ships as 00007 and the realtime broadcast migration as 00008. The +1 shift
-- vs. the plan is documented in 02-03-SUMMARY.md.
--
-- IMMUTABILITY NOTE (the bucketing function): the plan's draft used
-- `date_trunc('minute', submitted_at) - (extract(minute FROM submitted_at) % 5) * interval '1 minute'`.
-- That works as a value but Postgres rejects it inside a unique index because
-- `date_trunc(text, timestamptz)` is STABLE (depends on session timezone).
-- The fix is `date_bin('5 minutes', submitted_at, '2000-01-01Z'::timestamptz)`
-- — the timestamptz overload of `date_bin` is IMMUTABLE and produces the same
-- 5-minute bucketing semantics, but rooted at a fixed UTC origin so the value
-- is deterministic. This bucketing expression is repeated verbatim in the
-- ON CONFLICT clause and the duplicate-lookup so Postgres can infer the index.
--
-- ON CONFLICT INFERENCE: the dedupe index is on EXPRESSIONS, not raw columns,
-- so we cannot use ON CONFLICT ON CONSTRAINT (that only works for true table
-- constraints). Postgres infers the index from the expression list — we
-- repeat the exact expressions from the index definition in the ON CONFLICT
-- clause.
-- ───────────────────────────────────────────────────────────────────────────

-- 1. Idempotency: unique index on (form_slug, contact, 5-min bucket) using
--    the IMMUTABLE `date_bin` overload. Retries inside the 5-min window land
--    on the same key and collide.
CREATE UNIQUE INDEX IF NOT EXISTS leads_dedupe_idx ON public.leads (
  form_slug,
  COALESCE(lower(email), phone, ''),
  date_bin('5 minutes'::interval, submitted_at, '2000-01-01Z'::timestamptz)
);

-- 2. assign_lead — concurrency-safe round-robin (RESEARCH Pattern 2).
--    SECURITY DEFINER so it can read user_roles regardless of caller's RLS
--    context (callers reach it through ingest_lead with service_role).
CREATE OR REPLACE FUNCTION public.assign_lead(p_lead_id uuid, p_country text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_agent_id uuid;
BEGIN
  -- Pick least-loaded active agent in country, lock the row, skip any agent
  -- another concurrent transaction is currently assigning to.
  SELECT ur.user_id INTO v_agent_id
  FROM public.user_roles ur
  LEFT JOIN LATERAL (
    SELECT count(*) AS open_count
    FROM public.leads l
    WHERE l.assigned_to = ur.user_id
      AND l.status IN ('new', 'contacted')
  ) load ON true
  WHERE ur.role = 'agent'
    AND ur.country_code::text = p_country
    AND ur.is_active = true
  ORDER BY load.open_count ASC,
           ur.last_assigned_at ASC NULLS FIRST
  LIMIT 1
  FOR UPDATE OF ur SKIP LOCKED;

  -- Fallback: assign to country admin (visibility, not workload).
  IF v_agent_id IS NULL THEN
    SELECT ur.user_id INTO v_agent_id
    FROM public.user_roles ur
    WHERE ur.role = 'country_admin'
      AND ur.country_code::text = p_country
      AND ur.is_active = true
    LIMIT 1;
  END IF;

  -- Even if v_agent_id is still NULL (no admin either), set status='new' and
  -- log the event so the lead is at least visible to HQ.
  UPDATE public.leads
    SET assigned_to = v_agent_id, status = 'new'
    WHERE id = p_lead_id;

  IF v_agent_id IS NOT NULL THEN
    UPDATE public.user_roles
      SET last_assigned_at = now()
      WHERE user_id = v_agent_id;
  END IF;

  INSERT INTO public.lead_events (lead_id, actor_id, type, payload)
    VALUES (
      p_lead_id,
      v_agent_id,
      'assigned',
      jsonb_build_object(
        'reason', CASE WHEN v_agent_id IS NULL THEN 'no_recipient'
                       ELSE 'round_robin' END
      )
    );

  RETURN v_agent_id;
END;
$$;

REVOKE ALL ON FUNCTION public.assign_lead(uuid, text) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.assign_lead(uuid, text) TO service_role;

COMMENT ON FUNCTION public.assign_lead(uuid, text) IS
  'Round-robin assignment with SKIP LOCKED concurrency safety. Picks least-loaded active agent in country, falls back to country admin, sets leads.assigned_to + status=''new'', logs ''assigned'' event, bumps user_roles.last_assigned_at.';

-- 3. ingest_lead — the atomic wrapper for /api/leads/ingest webhook.
--    Validates FKs early (better error than raw FK violation), inserts with
--    idempotency catch, logs 'created' event, calls assign_lead.
CREATE OR REPLACE FUNCTION public.ingest_lead(payload jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_lead_id uuid;
  v_agent_id uuid;
  v_country text := payload->>'country_code';
  v_form text := payload->>'form_slug';
  v_submitted_at timestamptz := (payload->>'submitted_at')::timestamptz;
BEGIN
  -- Reference validation (FK would catch it but error message is clearer here).
  IF NOT EXISTS (SELECT 1 FROM public.countries WHERE code = v_country) THEN
    RETURN jsonb_build_object('error', 'unknown_country', 'country_code', v_country);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.forms WHERE slug = v_form) THEN
    RETURN jsonb_build_object('error', 'unknown_form', 'form_slug', v_form);
  END IF;

  -- Insert with idempotency catch. ON CONFLICT inference must match the
  -- expressions in leads_dedupe_idx exactly.
  INSERT INTO public.leads (
    country_code, form_slug, status,
    name, email, phone, message,
    raw_payload, source_url,
    utm_source, utm_medium, utm_campaign,
    submitted_at
  ) VALUES (
    v_country, v_form, 'new',
    payload->>'name', payload->>'email', payload->>'phone', payload->>'message',
    COALESCE(payload->'raw_payload', payload),
    payload->>'source_url',
    payload->>'utm_source', payload->>'utm_medium', payload->>'utm_campaign',
    v_submitted_at
  )
  ON CONFLICT (
    form_slug,
    COALESCE(lower(email), phone, ''),
    date_bin('5 minutes'::interval, submitted_at, '2000-01-01Z'::timestamptz)
  ) DO NOTHING
  RETURNING id INTO v_lead_id;

  -- Duplicate path: look up existing lead and short-circuit.
  IF v_lead_id IS NULL THEN
    SELECT id INTO v_lead_id
    FROM public.leads
    WHERE form_slug = v_form
      AND COALESCE(lower(email), phone, '')
          = COALESCE(lower(payload->>'email'), payload->>'phone', '')
      AND date_bin('5 minutes'::interval, submitted_at, '2000-01-01Z'::timestamptz)
          = date_bin('5 minutes'::interval, v_submitted_at, '2000-01-01Z'::timestamptz)
    LIMIT 1;

    RETURN jsonb_build_object(
      'lead_id', v_lead_id,
      'duplicate', true
    );
  END IF;

  -- 'created' event — country_code is denormalised onto lead_events by the
  -- BEFORE INSERT trigger from migration 00005, so we don't set it here.
  INSERT INTO public.lead_events (lead_id, type, payload)
    VALUES (v_lead_id, 'created', payload);

  -- Round-robin assignment (assign_lead handles its own event log).
  v_agent_id := public.assign_lead(v_lead_id, v_country);

  RETURN jsonb_build_object(
    'lead_id', v_lead_id,
    'agent_id', v_agent_id,
    'duplicate', false
  );
END;
$$;

REVOKE ALL ON FUNCTION public.ingest_lead(jsonb) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ingest_lead(jsonb) TO service_role;

COMMENT ON FUNCTION public.ingest_lead(jsonb) IS
  'Atomic ingest pipeline: validate FKs → INSERT (with idempotency on form_slug+contact+5min bucket) → log ''created'' event → call assign_lead. Returns {lead_id, agent_id, duplicate}. Service-role only.';
