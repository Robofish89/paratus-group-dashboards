-- ───────────────────────────────────────────────────────────────────────────
-- Paratus Group Dashboards — Broadcast trigger function lockdown
-- (migration 00017, plan 06-03 task 2)
--
-- Three SECURITY DEFINER functions ship with implicit EXECUTE to PUBLIC,
-- which Postgres grants automatically on CREATE FUNCTION:
--   • public.broadcast_lead_to_agent()    (00008)
--   • public.broadcast_lead_to_country()  (00008)
--   • public.broadcast_lead_to_group()    (00013)
--
-- They are AFTER ROW triggers on public.leads. Trigger context invokes
-- the function as the table owner, NOT as the calling session, so trigger
-- firing does not depend on the session having EXECUTE. Granting EXECUTE
-- to anon/authenticated/PUBLIC therefore creates a needless attack surface:
-- a hostile authenticated session could call them directly via SELECT
-- broadcast_lead_to_*() and emit forged broadcasts onto the realtime topics
-- (the functions read NEW from session-locals — calling them outside a
-- trigger short-circuits cleanly, but the spurious advertisement on the
-- channel is itself the leak).
--
-- Phase 2 plan 02-03 introduced the agent + country triggers and forgot
-- the REVOKE. Phase 5 plan 05-01 added broadcast_lead_to_group() and
-- inherited the gap (the migration 00013 author noted it as a Phase 6
-- carry-over — see STATE.md). This migration closes both at once, no
-- corresponding GRANT back: trigger context does not need it.
--
-- ───────────────────────────────────────────────────────────────────────────

REVOKE EXECUTE ON FUNCTION public.broadcast_lead_to_agent()   FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.broadcast_lead_to_country() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.broadcast_lead_to_group()   FROM PUBLIC, anon, authenticated;
