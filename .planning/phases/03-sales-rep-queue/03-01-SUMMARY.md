---
phase: 03-sales-rep-queue
plan: 01
status: shipped
shipped_at: 2026-05-01
subsystem: database/queue-rpcs
tags: [supabase, postgres, rls, security-definer, rpc, zod, dal, vitest]

# Dependency graph
requires:
  - phase: 02-data-model-ingestion
    provides: leads, lead_events, callbacks tables; country-scoped RLS; agent SELECT/UPDATE policies
provides:
  - mark-lead-contacted-rpc
  - complete-call-rpc
  - schedule-callback-rpc
  - agent-today-stats-view
  - dal-queue
  - schemas-queue
  - regenerated-database-types
affects:
  - 03-02-queue-ui
  - 03-03-callback-modal-and-mobile

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Inside-RPC auth.uid() = leads.assigned_to + auth.jwt()->>country_code = leads.country_code guard for SECURITY DEFINER (defence in depth — agent RLS bypassed by definer rights)"
    - "EXECUTE granted to authenticated (not service_role) — agent calls these directly from cookie-authed Server Actions"
    - "View RLS via security_invoker=true so per-agent counters fall out of leads/lead_events/callbacks policies for free"

key-files:
  created:
    - packages/supabase/migrations/00009_queue_rpcs.sql
    - packages/supabase/src/dal/queue.ts
    - packages/supabase/src/schemas/queue.ts
    - apps/web/tests/queue.rpcs.test.ts
  modified:
    - packages/supabase/src/dal/index.ts
    - packages/supabase/src/schemas/index.ts
    - packages/supabase/src/dal/leads.ts (dropped `as never` cast)
    - packages/supabase/src/types/database.ts (regenerated)
    - packages/supabase/package.json (added ./schemas/queue subpath export)

key-decisions:
  - "Three RPCs are EXECUTE-granted to authenticated (not service_role like ingest_lead) because they're called from the agent's authed browser session — different trust boundary than the HMAC-authed webhook"
  - "REVOKE FROM PUBLIC, anon (not just PUBLIC) because Supabase's default ACL grants execute to anon on every new function — explicit revoke matches the security stance"
  - "agent_today_stats view uses LEFT JOIN on user_roles + leads/lead_events/callbacks with FILTER clauses, security_invoker=true; one row per agent including agents with zero work"
  - "complete_call's `no_answer` and `callback` outcomes are event-only — no status mutation. The actual callback row is written by schedule_callback in a separate RPC call (the UI orchestrates this)"
  - "mark_lead_contacted raises 'invalid_status' for terminal states (qualified/converted/lost) to prevent UI bugs from rolling back lifecycle stamps"
  - "ingest_lead `as never` cast retired now that the type is regenerated against migration 00009 — single-pass type regen also picked up agent_today_stats and the three new RPCs"
  - "FOR UPDATE inside mark_lead_contacted/complete_call locks the lead row so concurrent agent clicks (rare but possible) can't race the COALESCE timestamp + status guard"

# Metrics
duration: ~25 min
completed: 2026-05-01
---

# Phase 3 Plan 01 — Queue RPCs + DAL + Tests Summary

**Three SECURITY DEFINER RPCs (mark_lead_contacted / complete_call / schedule_callback), the per-agent counter view, a server-only DAL with 4 reads + 3 writes, and 4 green Vitest assertions proving the RPCs work end-to-end from an anon-key client carrying an agent JWT.**

## Performance

- **Duration:** ~25 min
- **Started:** 2026-05-01T14:55Z
- **Completed:** 2026-05-01T15:20Z
- **Tasks:** 3
- **Files modified:** 9 (4 created, 5 modified)

## Accomplishments

- **Migration 00009 applied to live project `tgswsdfaszvztbpczfve`** — three RPCs callable from authed clients, view returning per-agent counters, all RLS gates intact.
- **DAL surface**: 4 read functions (`getAgentQueue`, `getAgentCompletedToday`, `getAgentTodayStats`, `getAgentCallbacksDue`) + 3 write functions (`markLeadContacted`, `completeCall`, `scheduleCallback`) exported from `@repo/supabase/dal`. Every path runs against the server cookie client so RLS is honored on reads and the inside-RPC `auth.uid()` guard is honored on writes.
- **Zod schemas** (`callOutcomeEnum`, `completeCallInput`, `scheduleCallbackInput`) exported from `@repo/supabase/schemas` + new `./schemas/queue` subpath export.
- **Database type regenerated** — picks up `ingest_lead`, the three new RPCs, and `agent_today_stats`. Phase 2 carry-forward TODO (drop `as never` cast on `ingestLead`) closed in the same pass.
- **4 new green Vitest assertions** running from a real agent JWT — full suite is now 4 files / 13 tests / green.

## Task Commits

1. **Task 1: Migration 00009 — three queue RPCs + agent_today_stats view** — `31c235a` (feat)
2. **Task 2: Zod schemas + DAL + type regen** — `9ccdf0c` (feat)
3. **Task 3: Vitest integration — three queue RPCs from agent client** — `0ea73cc` (test)

## Files Created/Modified

- `packages/supabase/migrations/00009_queue_rpcs.sql` — three SECURITY DEFINER RPCs + view + grants
- `packages/supabase/src/schemas/queue.ts` — Zod schemas (`callOutcomeEnum`, `completeCallInput` with refined `lost_reason` requirement, `scheduleCallbackInput`)
- `packages/supabase/src/dal/queue.ts` — 4 reads + 3 writes, server-only
- `packages/supabase/src/dal/index.ts` — re-exports queue DAL
- `packages/supabase/src/schemas/index.ts` — re-exports queue schemas
- `packages/supabase/src/dal/leads.ts` — dropped `as never` cast on `ingest_lead`; comment updated to reflect the regen
- `packages/supabase/src/types/database.ts` — fully regenerated against the live project
- `packages/supabase/package.json` — added `./schemas/queue` subpath export
- `apps/web/tests/queue.rpcs.test.ts` — 4 integration tests from agent JWT

## Verification (live Supabase)

- `select proname from pg_proc where proname in ('mark_lead_contacted','complete_call','schedule_callback')` → 3 rows
- `select viewname from pg_views where viewname='agent_today_stats'` → 1 row
- Function ACL → `postgres=X|authenticated=X|service_role=X` (no PUBLIC, no anon)
- Type regen confirmed — grep shows `ingest_lead`, `mark_lead_contacted`, `complete_call`, `schedule_callback`, and `agent_today_stats` all present in `database.ts`
- `npm run type-check` from repo root → green (1.5s)
- `npm run lint` from repo root → green (2.0s)
- `npm run build` from repo root → green (7.4s)
- `cd apps/web && npm run test` → 4 files / 13 tests / green (18s) [requires `npm run dev` running on port 3012 for the two routes-driven tests; the four new RPC tests work without it]
- Test data cleanup verified: `select count(*) from leads where email like 'queue-test-%'` → 0 after suite finishes

## Decisions Made

See `key-decisions` in frontmatter. Headlines:
- EXECUTE on the three RPCs is granted to `authenticated` (not service_role) — these are the agent's own writes, not platform writes.
- View uses `security_invoker = true` so RLS falls out of the underlying tables.
- `complete_call`'s `no_answer` and `callback` outcomes are event-only (no status mutation); the callback row gets written by `schedule_callback` in a separate RPC call.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Tightened RPC grants to revoke from anon, not just PUBLIC**

- **Found during:** Task 1 (verification of EXECUTE grants)
- **Issue:** Plan said `REVOKE ALL ON FUNCTION ... FROM PUBLIC`. After applying that, the function ACLs still showed `anon=X/postgres` because Supabase's default `pg_meta` setup grants execute to `anon` on every newly created function — `PUBLIC` doesn't include `anon` in this configuration. anon would still have been blocked by the inside-RPC `auth.uid()` guard (anon has no uid), but defence-in-depth says don't rely on that.
- **Fix:** Updated the migration to `REVOKE ALL ... FROM PUBLIC, anon` and ran the explicit revoke against the live project.
- **Files modified:** `packages/supabase/migrations/00009_queue_rpcs.sql`
- **Verification:** Function ACL on all three RPCs now shows `postgres=X|authenticated=X|service_role=X` only.
- **Committed in:** `31c235a` (Task 1 commit — tightened before commit landed)

**2. [Rule 2 - Missing Critical] Added FOR UPDATE row lock on the lead inside `mark_lead_contacted` and `complete_call`**

- **Found during:** Task 1 (writing the RPC bodies)
- **Issue:** Plan didn't specify a row lock. Without one, two simultaneous agent clicks on the same lead could race: both read `first_contacted_at = NULL`, both compute `COALESCE(NULL, now())`, but the second `UPDATE` overwrites the first's timestamp. Also, the status guard read in `complete_call` could see a stale value.
- **Fix:** Added `FOR UPDATE` to the SELECT that fetches the lead inside both RPCs. `schedule_callback` doesn't need it (its INSERT target is `callbacks`, not `leads`).
- **Files modified:** `packages/supabase/migrations/00009_queue_rpcs.sql`
- **Verification:** Functions still pass type-check + lint, all 4 integration tests green.
- **Committed in:** `31c235a` (Task 1 commit)

**3. [Rule 1 - Bug] Cross-tenant test seeded an unassigned lead instead of one assigned to a different agent**

- **Found during:** Task 3 (writing the cross-tenant test)
- **Issue:** Plan said "agentMz cannot mark_lead_contacted on a lead assigned to a different agent." The current Phase-2 seeded user set has only one MZ agent — there is no "different agent" in MZ to assign to. (Other-country agents would also fail the country_code guard, but that conflates two guards into one assertion.)
- **Fix:** Seeded a lead in MZ with `assigned_to = NULL` instead. The guard inside `mark_lead_contacted` is `IF v_assigned_to IS DISTINCT FROM v_caller … RAISE 'forbidden'` — `NULL IS DISTINCT FROM <uuid>` is `true`, so the guard fires identically. Comment in the test explains why this is the right test for the current user set.
- **Files modified:** `apps/web/tests/queue.rpcs.test.ts`
- **Verification:** Test passes — `error.message` contains `forbidden`.
- **Committed in:** `0ea73cc` (Task 3 commit)

---

**Total deviations:** 3 auto-fixed (1 bug-fix grant, 1 missing critical row lock, 1 bug-fix test seed)
**Impact on plan:** All three are corrections that strengthen the implementation — tighter grants, race-free updates, accurate cross-tenant assertion. No scope creep; no architectural changes.

## Issues Encountered

- **Pre-existing tests need a running dev server** — `tests/ingest.idempotency.test.ts` and `tests/realtime.broadcast.test.ts` POST to the live route at `http://localhost:3012/api/leads/ingest`. Started `npm run dev` in the background for the full-suite run; the 4 new RPC tests don't need it. Worth a Phase-6 cleanup: spin up a Next.js test server inside the vitest setup so `npm run test` is hermetic.

## User Setup Required

None — no new external services or env vars introduced.

## Next Phase Readiness

- Plan 03-02 (queue UI) can import `getAgentQueue`, `getAgentTodayStats`, `getAgentCallbacksDue` from `@repo/supabase/dal` for reads, and call `markLeadContacted` / `completeCall` / `scheduleCallback` from Server Actions wrapping the Zod schemas in `@repo/supabase/schemas`.
- Realtime subscription pattern from Phase 2 (private `agent:<uid>` channel with broadcast trigger) is unchanged — the queue UI subscribes to that topic for live new-lead arrival.
- Cross-tenant guards are doubly enforced now: RLS on the underlying tables + inside-RPC `auth.uid()` checks. The queue UI can rely on either layer; no need for app-side filtering.

---
*Phase: 03-sales-rep-queue*
*Completed: 2026-05-01*
