---
phase: 03-sales-rep-queue
plan: 04
status: shipped
shipped_at: 2026-05-02
subsystem: ui/agent-queue
tags: [nextjs, react, supabase, postgres, rpc, rls, zod, vitest, playwright, ux-redesign]

# Dependency graph
requires:
  - phase: 02-data-model-ingestion
    provides: leads / lead_events / callbacks tables; agent SELECT/UPDATE RLS; private agent broadcast channel
  - phase: 03-sales-rep-queue
    plan: 01
    provides: mark_lead_contacted / complete_call / schedule_callback RPCs (rewritten by this plan); agent_today_stats view (rewritten by this plan); DAL queue surface (extended by this plan)
  - phase: 03-sales-rep-queue
    plan: 02
    provides: queue page server fetch + realtime client wrapper; QueueView state machine; usePrivateBroadcast hook
  - phase: 03-sales-rep-queue
    plan: 03
    provides: /api/queue/contact + /api/queue/complete + /api/queue/callback route handlers; /api/e2e-login auth bridge for Playwright
provides:
  - migration-00010-queue-ux-redesign
  - leads-call-attempts-column
  - leads-last-outcome-column
  - record-no-answer-rpc
  - agent-stats-in-range-rpc
  - agent-today-stats-view-v2
  - card-action-area-component
  - outcome-buttons-component
  - lost-reason-chips-component
  - callback-quickpick-component
  - date-range-picker-component
  - queue-no-answer-route
  - 4-tab-queue-surface
  - 4-tile-stats-with-range
  - phase-3-playwright-e2e-rewrite
affects:
  - 04-country-admin-dashboard
  - 05-hq-overview
  - 06-production-hardening

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Inline state-aware card actions (no modal): CardActionArea drives an idle / mid_call / lost-chips / callback-quickpick state machine; resets on lead-id change"
    - "URL-stateful date range: ?range=today|week|month|custom (+ ?from / ?to) parsed in a shared _lib/date-range helper used by both server page and client picker"
    - "Two-source stats — live tiles (To Call / Follow-ups) come from agent_today_stats; range-aware tiles (Converted / Lost) come from agent_stats_in_range RPC. Same shape on the wire; different lifetimes"
    - "Soft-no-answer: status never auto-flips. call_attempts >= 3 + last_outcome='no_answer' is the predicate that moves the lead to Follow-ups; agent retains it forever"
    - "Defence-in-depth on terminal leads: UI hides the action area, but mark_lead_contacted ALSO RAISEs invalid_status server-side — backstop for the plan-03-03 dead-button bug"

key-files:
  created:
    - packages/supabase/migrations/00010_queue_ux_redesign.sql
    - apps/web/app/(sales-rep)/_components/card-action-area.tsx
    - apps/web/app/(sales-rep)/_components/outcome-buttons.tsx
    - apps/web/app/(sales-rep)/_components/lost-reason-chips.tsx
    - apps/web/app/(sales-rep)/_components/callback-quickpick.tsx
    - apps/web/app/(sales-rep)/_components/date-range-picker.tsx
    - apps/web/app/(sales-rep)/_lib/date-range.ts
    - apps/web/app/api/queue/no-answer/route.ts
  modified:
    - packages/supabase/src/types/database.ts (regenerated against 00010)
    - packages/supabase/src/dal/queue.ts (5 reads + 4 writes; was 4 + 3)
    - packages/supabase/src/dal/index.ts
    - packages/supabase/src/schemas/queue.ts (callOutcomeEnum narrowed; recordNoAnswerInput + agentStatsInRangeInput added)
    - apps/web/app/(sales-rep)/_components/queue-view.tsx (4-tab routing + inline outcome handlers)
    - apps/web/app/(sales-rep)/_components/queue-stats.tsx (4 tiles + DateRangePicker)
    - apps/web/app/(sales-rep)/_components/queue-tabs.tsx (4 tabs: To Call / Follow-ups / Converted / Lost)
    - apps/web/app/(sales-rep)/_components/queue-card.tsx (CardActionArea inline; tried-Nx chip)
    - apps/web/app/(sales-rep)/[country]/queue/page.tsx (range-aware parallel fetch)
    - apps/web/app/api/queue/complete/route.ts (narrowed enum doc comment)
    - apps/web/tests/queue.rpcs.test.ts (4 new assertions)
    - apps/web/e2e/sales-rep-golden-path.spec.ts (3-test rewrite)
  deleted:
    - apps/web/app/(sales-rep)/_components/queue-action-bar.tsx
    - packages/ui/src/components/call-outcome-modal.tsx

key-decisions:
  - "Sales-pipeline jargon collapsed at the UI layer — Won and Qualified merged into a single 'Converted' label. DB enum lead_events.outcome retains 'won' for analytics back-compat; status enum value is 'converted'. UI never says 'won'."
  - "complete_call RPC drops 'qualified' from its IF-validation. Status enum still contains 'qualified' (no destructive change), but no code path emits it; defence-in-depth — Zod rejects at the route, RPC RAISEs invalid_outcome if anything slips through."
  - "No auto-Lost on no-answers. After 3 unanswered attempts the lead moves to the Follow-ups tab via predicate (call_attempts >= 3 AND last_outcome='no_answer'); status stays 'contacted'. Agent retains the lead forever — they decide when to mark it Lost."
  - "Two-source stats split: live tiles read agent_today_stats (server-fetched on every render + router.refresh); range-aware tiles read agent_stats_in_range RPC scoped by the URL's ?range. Both arrive in the same Server Component fetch, no client-side fetch waterfall."
  - "Date range URL-stateful (?range=today|week|month|custom + ?from/?to) so refresh / share / back-button all behave. Helper parseRangeParams lifted to apps/web/app/(sales-rep)/_lib/date-range.ts so server page and client picker share a single source of truth."
  - "Defence-in-depth on the terminal-lead dead button — UI renders no action area for status IN ('converted','lost'), and mark_lead_contacted RAISEs invalid_status server-side. The plan-03-03 dead-button bug is now fixed in two layers."
  - "Counter double-count fix at the view layer: done_today is now count(leads where status IN ('converted','lost') AND updated_at >= start_of_day) — one row per terminal call cycle, never sums lead_events. The 'connected' event no longer leaks into the counter."
  - "CallOutcomeModal deleted entirely. No modal in the agent surface anywhere. Inline state-aware buttons on each card cover all five outcomes (Call → Converted / Lost / Callback / No-answer)."
  - "queue-action-bar.tsx removed — its responsibilities folded into queue-view (handlers) and card-action-area (per-card UI). One fewer indirection."

# Metrics
duration: ~110 min (2 sessions across day)
completed: 2026-05-02
tasks: 8
files_changed: 17 (8 created, 7 modified, 2 deleted)
---

# Phase 3 Plan 04 — Queue UX Redesign Summary

**4-tab agent surface (To Call / Follow-ups / Converted / Lost) with inline state-aware card actions, a URL-stateful date-range selector driving the Converted/Lost tiles, a soft-no-answer flow that moves stalled leads to Follow-ups without flipping status, and database-layer fixes for both the done_today double-count and the dead-button-on-terminal-leads bugs from plan 03-03.**

## Performance

- **Duration:** ~110 min (split across two sessions)
- **Started:** 2026-05-01T17:30Z
- **Completed:** 2026-05-02
- **Tasks:** 8
- **Files modified:** 17 (8 created, 7 modified, 2 deleted)

## Accomplishments

- **Migration 00010 applied to live project `tgswsdfaszvztbpczfve`** — two new columns on `leads` (`call_attempts`, `last_outcome`), `mark_lead_contacted` + `complete_call` rewritten, `record_no_answer` + `agent_stats_in_range` added, `agent_today_stats` view recreated with the five new counters (`to_call_count`, `follow_ups_count`, `done_today`, `converted_today`, `lost_today`).
- **DAL surface broadened** to 5 reads + 4 writes: added `getAgentFollowUps`, `getAgentConvertedInRange`, `getAgentLostInRange`, `getAgentStatsInRange`, `recordNoAnswer`; dropped `getAgentCompletedToday` (replaced by range-aware Converted/Lost reads). Zod surface narrowed: `callOutcomeEnum` no longer accepts `'qualified'`; `recordNoAnswerInput` + `agentStatsInRangeInput` added.
- **Five new client components** — `CardActionArea` (state machine: idle / mid_call / lost-chips / callback-quickpick), `OutcomeButtons` (three pills + No-answer link), `LostReasonChips` (4 chips + Other-with-input), `CallbackQuickpick` (3 quick chips + datetime fallback), `DateRangePicker` (URL-stateful, Today / Week / Month / Custom).
- **Queue surface refactored** — page is now 4 tabs + 4 tiles. Cards expose inline state-aware actions; no modal anywhere. Queue page fetches four lists + two stats sources in parallel (`getAgentQueue` / `getAgentFollowUps` / `getAgentConvertedInRange` / `getAgentLostInRange` + `getAgentTodayStats` + `getAgentStatsInRange`).
- **`/api/queue/no-answer` route** — POST endpoint wrapping `record_no_answer`, same auth posture as the other queue routes (cookie session + role gate + Zod validation).
- **Vitest 17/17 green** — 4 new RPC assertions extending the 13 from plans 03-01 / 03-02 / 03-03 (record_no_answer increment, qualified rejection, single-counted done_today, agent_stats_in_range counts).
- **Playwright spec rewritten** — 3 tests covering the new flow: Converted golden path, no-answer 3× → Follow-ups, tab labels match the new vocabulary.
- **Two production bugs fixed at the database layer** — `done_today` counter no longer double-counts the `'connected'` event from `mark_lead_contacted`; dead "Call Now" button on completed cards no longer renders, and is also backstopped by `mark_lead_contacted`'s `invalid_status` RAISE if anything slips through.
- **Deprecated `CallOutcomeModal` deleted** — modal-free surface end-to-end. No lingering imports anywhere in `packages/` or `apps/`.

## Task Commits

1. **Task 1: Migration 00010 — schema columns + RPCs + view rewrite** — `fc3d77d` (feat)
2. **Task 2: DAL + Zod surface for new queue model + Database type regen** — `b067f83` (feat)
3. **Task 3: Vitest — record_no_answer + done_today filter + qualified rejection** — `e78a0e4` (test)
4. **Task 4: UI atom components for card actions + date range** — `be51915` (feat)
5. **Task 5: 4-tab queue refactor (queue-view / queue-stats / queue-tabs / queue-card / queue-page)** — `dbd9773` (feat)
6. **Task 6: API routes — /api/queue/no-answer + complete narrowed outcomes** — `f7d4828` (feat)
7. **Task 7: Playwright spec rewrite — inline outcomes + follow-ups** — `f92374d` (test)
8. **Task 8: Delete deprecated CallOutcomeModal + tidy unused imports** — `37d6c5e` (chore)

(Commits `15f9339`, `7d5df00`, `d846379` from plan 03-03 are not part of this plan — they shipped before the redesign brief landed.)

## Files Created/Modified

- `packages/supabase/migrations/00010_queue_ux_redesign.sql` — 354 lines: 2 ALTER TABLE columns, 4 functions (`mark_lead_contacted` rewrite, `complete_call` rewrite, new `record_no_answer`, new `agent_stats_in_range`), `agent_today_stats` view rewrite, full grant set.
- `packages/supabase/src/types/database.ts` — regenerated: new view columns, new function signatures, `leads.call_attempts: number`, `leads.last_outcome: string | null`.
- `packages/supabase/src/dal/queue.ts` — 5 reads + 4 writes; old `getAgentCompletedToday` dropped.
- `packages/supabase/src/dal/index.ts` — barrel updated.
- `packages/supabase/src/schemas/queue.ts` — `callOutcomeEnum` narrowed; `recordNoAnswerInput` + `agentStatsInRangeInput` + `dateRangeKeyEnum` added.
- `apps/web/app/(sales-rep)/_components/card-action-area.tsx` — state machine wiring all five outcomes inline.
- `apps/web/app/(sales-rep)/_components/outcome-buttons.tsx` — three pill buttons + No-answer text link.
- `apps/web/app/(sales-rep)/_components/lost-reason-chips.tsx` — four chips + Other-with-input + Save.
- `apps/web/app/(sales-rep)/_components/callback-quickpick.tsx` — Today 5pm / Tomorrow 9am / Next-week-Mon 9am chips + datetime-local fallback.
- `apps/web/app/(sales-rep)/_components/date-range-picker.tsx` — URL-stateful; reads + writes `?range`, `?from`, `?to`.
- `apps/web/app/(sales-rep)/_lib/date-range.ts` — `parseRangeParams(searchParams)` helper, pure functions, server-safe.
- `apps/web/app/(sales-rep)/_components/queue-view.tsx` — 4-list state, broadcast routing helper, inline outcome handlers calling the four queue routes.
- `apps/web/app/(sales-rep)/_components/queue-stats.tsx` — 4 tiles + DateRangePicker; live + range-aware split.
- `apps/web/app/(sales-rep)/_components/queue-tabs.tsx` — 4 tabs.
- `apps/web/app/(sales-rep)/_components/queue-card.tsx` — embeds `<CardActionArea />`; adds `tried Nx` chip beside SLA dot.
- `apps/web/app/(sales-rep)/[country]/queue/page.tsx` — range parsing, 4 + 2 parallel fetches, props handed to `<QueueView />`.
- `apps/web/app/api/queue/no-answer/route.ts` — new POST endpoint.
- `apps/web/app/api/queue/complete/route.ts` — doc comment noting four accepted outcomes (Zod schema in @repo/supabase narrowed in Task 2).
- `apps/web/tests/queue.rpcs.test.ts` — 4 new assertions appended.
- `apps/web/e2e/sales-rep-golden-path.spec.ts` — three-test rewrite.
- `apps/web/app/(sales-rep)/_components/queue-action-bar.tsx` — **deleted** (responsibilities folded into queue-view + card-action-area).
- `packages/ui/src/components/call-outcome-modal.tsx` — **deleted**.
- `packages/ui/src/index.ts` — `CallOutcomeModal` and related type exports removed.

## Verification

- **Migration applied** to live project — `select column_name from information_schema.columns where table_name='leads' and column_name in ('call_attempts','last_outcome')` returns 2 rows; `select proname from pg_proc where proname='record_no_answer'` returns 1 row; new `agent_today_stats` view returns the five new columns when SELECTed by an authenticated agent client.
- `npm run type-check` from repo root → green (FULL TURBO cache hit).
- `npm run lint` from repo root → green (FULL TURBO cache hit).
- `npm run build` from repo root → green; Next.js 16.2.4 reports 15 routes including `/api/queue/no-answer`.
- `cd apps/web && npm run test` → **17/17 green** (4 RPC files / 17 assertions, including the 4 new in `queue.rpcs.test.ts`). Confirmed by orchestrator before this close-out.
- `cd apps/web && npm run e2e` → 3 tests green (Converted golden path, no-answer 3× → Follow-ups, tab labels). Pre-condition: dev server on 3012 with `E2E_AUTH_ENABLED=true`.
- `git grep -n 'CallOutcomeModal' packages/ apps/` → zero hits (modal fully removed; only `.planning/` history references remain).
- Visual sign-off — user approved at the human-verify checkpoint with the surface described as obvious to use, finger-tappable on mobile, and modal-free.

## Decisions Made

See `key-decisions` in frontmatter. Headlines worth re-stating:

- **UI label "Converted"; DB value "won"** — back-compat with any downstream analytics consumer of `lead_events.outcome`. UI never says "won". Future analytics build can keep reading the existing event log without a rename migration.
- **Soft no-answer; never auto-Lost** — explicit user call. The agent owns the decision to mark Lost. Three unanswered calls move the card to Follow-ups but the lead status stays `contacted`. The agent can retry forever from the "Try again" button on the follow-ups card.
- **URL-stateful date range** — refresh, share, browser back, and Playwright tests all behave correctly. `?range=today` is the default; `?range=custom` reveals the from/to inputs.
- **Defence-in-depth on terminal leads** — `mark_lead_contacted` RAISEs `invalid_status` when called against a `converted` or `lost` lead. UI hides the button; the RPC backstops it. Plan 03-03's dead-button bug now requires two layers to fail before producing the same crash.
- **`done_today` counter rewritten** — was `count(lead_events where type='call' and created_at >= today)`, which counted both the `connected` event from `mark_lead_contacted` and the `won`/`lost` event from `complete_call`. Now: `count(leads where status IN ('converted','lost') and updated_at >= start_of_day)` — one row per terminal call cycle.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Lifted `parseRangeParams` from the picker into a shared `_lib/date-range.ts`**

- **Found during:** Task 5 (writing `queue-page.tsx`)
- **Issue:** Plan said the helper would live in `date-range-picker.tsx` and be re-exported. Server Component imports of a `'use client'` module pull React/client-only deps into the server build. Next.js 16 didn't error but the build emitted a warning about server bundle size.
- **Fix:** Moved the pure functions (`parseRangeParams`, `buildRangeUrl`, `formatRangeLabel`) to `apps/web/app/(sales-rep)/_lib/date-range.ts` (no `'use client'`, no React import). The picker component imports from there; the page imports from there. Single source of truth.
- **Files modified:** `apps/web/app/(sales-rep)/_lib/date-range.ts` (new), `apps/web/app/(sales-rep)/_components/date-range-picker.tsx`, `apps/web/app/(sales-rep)/[country]/queue/page.tsx`
- **Verification:** Build clean; warning gone.
- **Committed in:** `dbd9773` (Task 5 commit, in the same write).

**2. [Rule 1 - Bug] Added `tried Nx` chip beside the SLA dot when `0 < call_attempts < 3`**

- **Found during:** Task 5 (queue-card.tsx)
- **Issue:** Plan listed the chip as part of `CardActionArea` but the visual brief in the design reference puts it at the card header beside the SLA dot. Putting it inside the action area meant it disappeared once the agent clicked Call (action area transitions to `mid_call`), losing the count signal exactly when the agent needed it most.
- **Fix:** Hoisted the chip to `queue-card.tsx`; renders next to the SLA dot for `0 < call_attempts < 3`. Reads `lead.call_attempts` directly. The follow-ups predicate (`call_attempts >= 3 AND last_outcome='no_answer'`) now also drives the tab move; the visible chip in the To-Call tab is just a tracker.
- **Files modified:** `apps/web/app/(sales-rep)/_components/queue-card.tsx`
- **Verification:** Visual smoke + Playwright assertion `data-attempts="N"` on the card root.
- **Committed in:** `dbd9773` (Task 5 commit).

---

**Total deviations:** 2 auto-fixed (1 blocking build warning, 1 bug — wrong placement of the attempts chip)
**Impact on plan:** Both are corrections that strengthen the implementation. No scope creep; no architectural change.

## Issues Encountered

- **Carry-over: Next.js 16 `middleware` → `proxy` deprecation warning** — `npm run build` emits `⚠ The "middleware" file convention is deprecated. Please use "proxy" instead.` This is a Next.js 16 deprecation; the file works as-is but should be renamed before Next.js 17. Tracked as a Phase 6 production-hardening item.

## User Setup Required

None — no new env vars, no new external services.

## Next Phase Readiness

- **Phase 4 (Country Admin Dashboard)** can reuse the entire `usePrivateBroadcast` hook with `topic: country:<code>` (already proven in plan 03-02). No new realtime work.
- **Date range pattern** is reusable as-is — the `_lib/date-range.ts` helper + `<DateRangePicker />` component will drop into the country-admin and HQ surfaces with a different RPC backing them.
- **Stats pattern** (live tile + range tile, two-source split) is the template for the country-admin and HQ KPI rows.
- **DB enum back-compat** — analytics consumers can still group by `lead_events.outcome IN ('won','lost','no_answer','callback','connected')`. Adding new outcome shapes in Phase 4+ is additive only; existing values are locked.

---
*Phase: 03-sales-rep-queue*
*Plan: 04*
*Completed: 2026-05-02*
