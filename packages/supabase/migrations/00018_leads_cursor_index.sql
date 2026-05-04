-- ───────────────────────────────────────────────────────────────────────────
-- Paratus Group Dashboards — Leads Cursor Index (migration 00018, plan 06-04
-- task 1).
--
-- Phase 4 plan 04-03 shipped offset pagination on the country-admin lead
-- list. Phase 6 plan 06-04 cuts over to keyset (cursor) pagination so the
-- query no longer pays an O(N) "skip" cost as a country grows past v1's
-- ~5k-leads-per-active-country profile.
--
-- The query's ORDER BY tuple is (created_at DESC, id DESC) — `created_at`
-- ranks rows; `id` (UUID) breaks ties so the cursor is deterministic. This
-- index matches the tuple exactly so Postgres can run an index scan with no
-- additional sort + skip-scan to the cursor key with a single tuple compare.
--
-- This index AUGMENTS the existing per-column / multi-column indexes from
-- 00005 — none are dropped. Phase 4's offset queries (still used by other
-- callers if any) continue to work; Phase 6 cursor queries use this one.
-- ───────────────────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS leads_created_at_id_desc_idx
  ON public.leads (created_at DESC, id DESC);

COMMENT ON INDEX public.leads_created_at_id_desc_idx IS
  'Composite index for keyset (cursor) pagination on the country-admin lead list. Matches ORDER BY (created_at DESC, id DESC) so the planner can do an index-only scan with a tuple-compare cursor lookup. Plan 06-04.';
