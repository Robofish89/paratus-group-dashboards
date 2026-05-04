-- ───────────────────────────────────────────────────────────────────────────
-- 00014_sla_alerts: SLA breach detection + dedupe column for the cron-driven
--                    alert path (Phase 6 plan 06-01).
--
-- Adds the column + view + RPC the per-minute cron route needs to detect
-- leads that have been unanswered for >5 minutes and email country admins
-- (and HQ admins on a country drill-in) without double-sending.
--
-- IDEMPOTENCY BOUNDARY:
--   The dedupe contract lives at the `sla_breach_alerted_at IS NULL` filter
--   on `v_sla_breaches`. The column is NULL until the first email succeeds,
--   then set to `now()` via `mark_sla_alerted(...)` and never re-cleared. A
--   second cron tick in the same minute therefore returns 0 rows. A retry
--   path (cron flapping, route timing out, partial Resend failure) re-reads
--   the same NULL column and tries again. No external store needed.
--
-- RLS POSTURE:
--   No RLS change to `leads`. Reads use the existing leads policies; writes
--   go through the `mark_sla_alerted` SECURITY DEFINER RPC which is granted
--   only to `service_role`. The view is `security_invoker = true` and granted
--   only to `service_role` because the cron route is the sole consumer.
--
-- INDEX RATIONALE:
--   Partial index `leads_sla_pending_idx` over `submitted_at` for unanswered,
--   un-alerted, new/assigned leads. Makes the per-minute breach scan O(open
--   breaches) rather than O(total leads). Required so the cron stays cheap
--   as production volume grows.
-- ───────────────────────────────────────────────────────────────────────────


-- ─── 1. Dedupe column ──────────────────────────────────────────────────────
ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS sla_breach_alerted_at timestamptz;

COMMENT ON COLUMN public.leads.sla_breach_alerted_at IS
  'Timestamp of the first SLA-breach email sent for this lead. NULL until the cron route in apps/web/app/api/cron/sla-check successfully delivers to every recipient. Once set, the lead drops out of `v_sla_breaches` (idempotency boundary). Never re-cleared in code.';


-- ─── 2. Partial index for the breach scan ──────────────────────────────────
-- Indexes only the rows the breach view actually scans. Postgres planner
-- prefers it for the sub-second per-minute hot path because the predicate
-- matches the view's WHERE clause exactly.
CREATE INDEX IF NOT EXISTS leads_sla_pending_idx
  ON public.leads (submitted_at)
  WHERE first_contacted_at IS NULL
    AND sla_breach_alerted_at IS NULL
    AND status = 'new';


-- ─── 3. v_sla_breaches view ────────────────────────────────────────────────
-- One row per lead currently in breach. Mirrors the cron's contract:
--   * `submitted_at < now() - interval '5 minutes'`  → breach threshold
--   * `first_contacted_at IS NULL`                   → unanswered
--   * `sla_breach_alerted_at IS NULL`                → not yet emailed
--   * `status IN ('new','assigned')`                 → still actionable
--
-- NOTE on `status` enum values: migration 00005 defines lead_status as
-- ('new','contacted','qualified','converted','lost'). The plan template
-- referenced `'new'|'assigned'` but `assigned` isn't in the enum — Phase 2
-- assignment never moves the row out of `new`, only flips `assigned_to` from
-- NULL to the agent UUID. So the actionable-but-uncontacted set is exactly
-- `status = 'new' AND first_contacted_at IS NULL`.
DROP VIEW IF EXISTS public.v_sla_breaches;
CREATE VIEW public.v_sla_breaches
  WITH (security_invoker = true) AS
SELECT
  l.id,
  l.country_code,
  l.assigned_to,
  l.email,
  l.phone,
  l.name AS full_name,
  l.submitted_at,
  EXTRACT(EPOCH FROM (now() - l.submitted_at))::int AS age_seconds
FROM public.leads l
WHERE l.first_contacted_at IS NULL
  AND l.sla_breach_alerted_at IS NULL
  AND l.status = 'new'::public.lead_status
  AND l.submitted_at < now() - interval '5 minutes';

REVOKE ALL ON public.v_sla_breaches FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.v_sla_breaches TO service_role;

COMMENT ON VIEW public.v_sla_breaches IS
  'Open SLA breaches for the cron-driven alert path. One row per lead unanswered for >5 minutes whose dedupe column is still NULL. Reads gated to service_role (cron is the only consumer); security_invoker=true preserves the leads RLS posture.';


-- ─── 4. mark_sla_alerted RPC ───────────────────────────────────────────────
-- SECURITY DEFINER write. Sets the dedupe column on the lead. The cron route
-- only calls this after EVERY recipient for a given breach has been emailed
-- successfully — partial failure leaves the column NULL so the next minute
-- retries.
CREATE OR REPLACE FUNCTION public.mark_sla_alerted(p_lead_id uuid)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  UPDATE public.leads
     SET sla_breach_alerted_at = now()
   WHERE id = p_lead_id;
$$;

REVOKE ALL ON FUNCTION public.mark_sla_alerted(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.mark_sla_alerted(uuid) TO service_role;

COMMENT ON FUNCTION public.mark_sla_alerted(uuid) IS
  'Closes the dedupe boundary for a single lead by setting sla_breach_alerted_at = now(). Service-role only; called by the SLA cron after every recipient email has been delivered. Idempotent: a second call simply re-stamps the same column.';
