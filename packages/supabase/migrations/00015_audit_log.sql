-- ───────────────────────────────────────────────────────────────────────────
-- 00015_audit_log: immutable audit trail of every admin/agent write (Phase 6
--                  plan 06-02).
--
-- SECURITY_CHECKLIST.md requires an audit log of admin actions before pilot
-- launch. Phase 4's reassign route + Phase 3's queue outcome routes are the
-- existing write surfaces; both call `record_audit(...)` alongside the primary
-- write so we can always answer "who did what, when, and what changed?".
--
-- DESIGN NOTES
-- ────────────
-- IMMUTABILITY: There are NO INSERT/UPDATE/DELETE policies on this table.
--   * Inserts go exclusively through the SECURITY DEFINER `record_audit(...)`
--     RPC (granted to `authenticated`). The RPC bypasses RLS but preserves
--     `auth.uid()` / `auth.jwt()` from the calling session.
--   * Updates and deletes are impossible from any non-service-role caller —
--     no policy, no path. Service role can still touch the table for
--     emergencies, but every routine read/write is policy-gated.
--
-- VISIBILITY: An array column `visible_to_country_codes text[]` handles the
-- HQ-initiated cross-country reassignment case. For a same-country action
-- the array is `[country_code]`. For an HQ cross-country reassign, the array
-- is `[source_country, target_country]` so BOTH country admins see the row
-- (not just the destination). Phase 6 RESEARCH pitfall — see 06-RESEARCH.md
-- "audit log cross-tenant visibility".
--
-- AGENT VISIBILITY: There is NO policy with `user_role = 'agent'` in the
-- USING clause, so agents see zero rows by RLS construction. This is by
-- design — agents do not need to read the audit log; HQ + country admins do.
--
-- INITPLAN CACHING: Every USING clause wraps `auth.jwt() ->> '...'` in
-- `(SELECT ...)` so Postgres caches the result via initPlan. `TO authenticated`
-- short-circuits anon callers before the policy body runs (Phase 6 RESEARCH
-- pattern 1).
--
-- IP HASHING: The `ip_hash` column stores `sha256(ip || IP_HASH_SALT)` —
-- never raw IP. The salt is per-deploy env (`IP_HASH_SALT`); rotating the
-- salt invalidates correlation across rotations, which is the desired
-- privacy posture. Documented in `.planning/phases/06-production-hardening/
-- 06-USER-SETUP.md`.
-- ───────────────────────────────────────────────────────────────────────────

-- ─── 1. audit_log table ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.audit_log (
  id                       uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id                 uuid        REFERENCES auth.users(id),
  actor_role               text        NOT NULL,                        -- 'agent' | 'country_admin' | 'hq_admin' | 'system'
  country_code             text        NOT NULL,                        -- the country the action targets
  action                   text        NOT NULL,                        -- 'lead.reassign', 'lead.complete', 'lead.callback', 'lead.no_answer', 'lead.contact', ...
  target_type              text        NOT NULL,                        -- 'lead' | 'user_role' | 'callback'
  target_id                text        NOT NULL,
  diff                     jsonb       NOT NULL,                        -- { field: { before, after } } — changed fields only
  visible_to_country_codes text[]      NOT NULL,                        -- [country_code] for same-country, [src, dst] for HQ cross-country
  created_at               timestamptz NOT NULL DEFAULT now(),
  ip_hash                  text                                         -- sha256(IP || salt) — never raw IP
);

COMMENT ON TABLE  public.audit_log IS
  'Immutable audit trail. Inserts only via record_audit() RPC; no UPDATE/DELETE policies. Phase 6 plan 06-02.';
COMMENT ON COLUMN public.audit_log.diff IS
  'Changed-field-only diff: { field: { before, after } }. Avoid storing whole-row snapshots (PII surface, index bloat).';
COMMENT ON COLUMN public.audit_log.visible_to_country_codes IS
  'Array of country codes that should see this row via RLS. [country_code] for same-country, [src, dst] for HQ cross-country reassign.';
COMMENT ON COLUMN public.audit_log.ip_hash IS
  'sha256(ip || IP_HASH_SALT). Never store raw IP. Rotating the salt breaks cross-rotation correlation by design.';

CREATE INDEX IF NOT EXISTS audit_log_country_created_idx
  ON public.audit_log (country_code, created_at DESC);
CREATE INDEX IF NOT EXISTS audit_log_target_idx
  ON public.audit_log (target_type, target_id);
CREATE INDEX IF NOT EXISTS audit_log_visible_gin_idx
  ON public.audit_log USING gin (visible_to_country_codes);

-- ─── 2. Row-Level Security ────────────────────────────────────────────────
ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;

-- HQ admins see everything.
DROP POLICY IF EXISTS "hq sees all audit_log" ON public.audit_log;
CREATE POLICY "hq sees all audit_log"
  ON public.audit_log
  FOR SELECT
  TO authenticated
  USING ((SELECT auth.jwt() ->> 'user_role') = 'hq_admin');

-- Country admins see rows whose visible_to_country_codes contains their JWT
-- country_code. This handles same-country writes (their code) AND HQ
-- cross-country reassign (their code is appended to a 2-element array).
DROP POLICY IF EXISTS "country admin sees scoped audit_log" ON public.audit_log;
CREATE POLICY "country admin sees scoped audit_log"
  ON public.audit_log
  FOR SELECT
  TO authenticated
  USING (
    (SELECT auth.jwt() ->> 'user_role') = 'country_admin'
    AND (SELECT auth.jwt() ->> 'country_code') = ANY (visible_to_country_codes)
  );

-- No INSERT/UPDATE/DELETE policies. Inserts via record_audit() RPC only;
-- updates/deletes blocked end-to-end for authenticated users.
GRANT SELECT ON public.audit_log TO authenticated;

-- ─── 3. record_audit RPC ──────────────────────────────────────────────────
-- SECURITY DEFINER so it can write past RLS, but `auth.uid()` and
-- `auth.jwt()` resolve to the calling session (definer rights bypass RLS but
-- session context survives).
CREATE OR REPLACE FUNCTION public.record_audit(
  p_action                   text,
  p_target_type              text,
  p_target_id                text,
  p_country_code             text,
  p_diff                     jsonb,
  p_visible_to_country_codes text[] DEFAULT NULL,
  p_ip_hash                  text   DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_id uuid;
BEGIN
  INSERT INTO public.audit_log (
    actor_id,
    actor_role,
    country_code,
    action,
    target_type,
    target_id,
    diff,
    visible_to_country_codes,
    ip_hash
  )
  VALUES (
    auth.uid(),
    COALESCE(auth.jwt() ->> 'user_role', 'system'),
    p_country_code,
    p_action,
    p_target_type,
    p_target_id,
    p_diff,
    COALESCE(p_visible_to_country_codes, ARRAY[p_country_code]),
    p_ip_hash
  )
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.record_audit(text, text, text, text, jsonb, text[], text) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.record_audit(text, text, text, text, jsonb, text[], text) TO authenticated;

COMMENT ON FUNCTION public.record_audit(text, text, text, text, jsonb, text[], text) IS
  'Insert an audit_log row from an authenticated session. SECURITY DEFINER bypasses RLS but auth.uid()/auth.jwt() resolve to the caller. Phase 6 plan 06-02.';
