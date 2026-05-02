---
phase: 03-sales-rep-queue
status: validated
validated_at: 2026-05-02
production_url: https://paratus-group-dashboards.vercel.app
phase_tag: phase-3-complete
plans:
  - 03-01-SUMMARY.md
  - 03-02-SUMMARY.md
  - 03-04-SUMMARY.md
provides:
  - queue-rpcs (mark_lead_contacted, complete_call, schedule_callback, record_no_answer)
  - agent-stats-rpc (agent_stats_in_range)
  - agent-today-stats-view (v2 — to_call_count / follow_ups_count / done_today / converted_today / lost_today)
  - dal-queue (5 reads + 4 writes)
  - schemas-queue (callOutcomeEnum narrowed to 4; recordNoAnswerInput; agentStatsInRangeInput; dateRangeKeyEnum)
  - queue-page-server-fetch (parallel reads of 4 lists + 2 stats sources scoped by URL ?range)
  - queue-realtime-hook (usePrivateBroadcast generic + useAgentBroadcast typed wrapper)
  - queue-view-state-machine (4 lists, freshIds, busyLeadId, mid_call routing on broadcast)
  - card-action-area (inline state-aware actions: idle / mid_call / lost-chips / callback-quickpick)
  - date-range-picker (URL-stateful, today/week/month/custom)
  - queue-route-handlers (/api/queue/contact, /api/queue/complete, /api/queue/callback, /api/queue/no-answer)
  - e2e-login-bridge (/api/e2e-login for Playwright cookie injection)
  - phase-3-test-suite (vitest 17 / playwright 3)
acceptance:
  agent_receives_lead_under_5s: "private agent:<uid> broadcast received within 5 s of an assigned ingest (proven by realtime test in 02-06; consumed by queue UI from 03-02 onward)"
  no_dead_buttons_on_terminal_leads: "card action area renders nothing for status IN ('converted','lost'); mark_lead_contacted RAISEs invalid_status as a server-side backstop"
  done_today_single_counted: "one terminal call cycle increments done_today by 1, never 2 (regression test in apps/web/tests/queue.rpcs.test.ts)"
  qualified_rejected_at_two_layers: "Zod callOutcomeEnum + complete_call RPC both reject 'qualified' — proven by integration test"
  modal_free_surface: "git grep CallOutcomeModal returns 0 hits in packages/ + apps/"
  range_aware_stats: "?range=week persists across refresh, browser back, and Playwright; tile counts re-fetch from agent_stats_in_range RPC"
---

# Phase 3 — Sales Rep Queue: Closure

**Validated:** 2026-05-02 against Supabase project `tgswsdfaszvztbpczfve` and `https://paratus-group-dashboards.vercel.app`.

The agent surface is live. From the moment a webhook lead lands, an agent sees the card slide in over a private realtime broadcast (under 5 s p95), clicks Call, captures the outcome inline (Converted / Lost / Callback / No-answer) without ever opening a modal, and watches the stat tiles re-fetch through `router.refresh()`. The four queue tabs (To Call / Follow-ups / Converted / Lost) cover the full lifecycle. Date range is URL-stateful — Today / Week / Month / Custom — so the Converted and Lost tiles pivot on demand. Two production bugs from the plan-03-03 modal phase were fixed at the database layer in plan 03-04 (the done_today double-count and the dead-button on terminal leads), with defence-in-depth backstops in `mark_lead_contacted` for the latter. Phase 3 ships modal-free, console-clean, with 17 vitest assertions and 3 Playwright tests green against the live database.

## Plan rollup

| Plan | Subsystem | Summary |
|---|---|---|
| [03-01](03-01-SUMMARY.md) | Queue RPCs + DAL + integration tests | `00009_queue_rpcs.sql` ships three SECURITY DEFINER RPCs (`mark_lead_contacted`, `complete_call`, `schedule_callback`) with inside-RPC `auth.uid() = leads.assigned_to` + country guards; `agent_today_stats` view with `security_invoker = true`; DAL exposes 4 reads + 3 writes from a server-only module; 4 vitest assertions from a real agent JWT prove the surface end-to-end. |
| [03-02](03-02-SUMMARY.md) | Queue UI page + agent realtime broadcast | `packages/supabase/src/realtime.ts` rewritten from `postgres_changes` to a private-broadcast hook (`usePrivateBroadcast<T>` generic + `useAgentBroadcast` typed wrapper); `/[country]/queue` swapped from a Phase 1 placeholder to a Server Component that fetches initial state in parallel and hands it to a client `<QueueView />` subscribed to the private `agent:<uid>` topic; SLA dot, stats strip, tab toggle, service filter, 4-second fresh flash on new arrivals — pixel-matched against `docs/design-reference/sales-rep-dashboard.html`. |
| 03-03 (deprecated) | Outcome modal + 3 API routes + Playwright bridge | Wired the Phase-3-02 stub Call Now button to the existing `CallOutcomeModal`, shipped `/api/queue/contact|complete|callback` route handlers, and added `/api/e2e-login` so Playwright could test cookie-authenticated flows. The modal UX was deprecated by plan 03-04 (replaced with inline card actions); the three queue routes and the e2e-login bridge survived and are still in production. |
| [03-04](03-04-SUMMARY.md) | UX redesign — 4 tabs, 4 tiles, range picker, no-answer flow | `00010_queue_ux_redesign.sql` adds `leads.call_attempts` + `leads.last_outcome`, rewrites `mark_lead_contacted` + `complete_call` (drops `'qualified'`, sets `last_outcome`, RAISEs `invalid_status` on terminal leads), adds `record_no_answer` + `agent_stats_in_range` RPCs, recreates `agent_today_stats` with five new columns (fixes the double-count bug). UI replaces the modal with inline state-aware card actions; 4 tabs (To Call / Follow-ups / Converted / Lost); 4 tiles + URL-stateful date picker; `CallOutcomeModal` deleted entirely. Vocabulary collapsed: Won → Converted (UI label only), Callbacks → Follow-ups, Qualified killed. 17 vitest assertions; 3 Playwright tests. |

## Verifiable outcome — proven

> **Roadmap:** "Agent receives lead → calls → captures outcome → exits queue → stats update — all without refresh, mobile works, modal-free."

| Criterion | Evidence | Status |
|---|---|---|
| Agent receives a fresh lead in realtime | `apps/web/e2e/sales-rep-golden-path.spec.ts` Test 1 — fresh card appears with `data-fresh="true"` after a signed webhook POST | green |
| Agent calls and captures Converted inline | Test 1 (cont.) — clicks Call, asserts inline pills render, clicks Converted, card disappears, Converted tile increments | green |
| No-answer 3× moves the lead to Follow-ups (no auto-Lost) | Test 2 — three Call → No-answer cycles; `data-attempts` increments 1 → 2 → 3; card moves to Follow-ups tab with a "Try again" button | green |
| Vocabulary matches the brief | Test 3 — tab list reads exactly "To Call · Follow-ups · Converted · Lost" | green |
| done_today is single-counted | `apps/web/tests/queue.rpcs.test.ts` — mark_lead_contacted + complete_call({won}) yields `done_today === 1`, not 2 | green |
| `'qualified'` rejected at two layers | `apps/web/tests/queue.rpcs.test.ts` — `complete_call({outcome:'qualified'})` returns `invalid_outcome` | green |
| Range-aware stats | `agent_stats_in_range` RPC returns `{converted_count, lost_count, done_count}` for an arbitrary window — proven by integration test | green |
| Modal-free surface | `git grep -n 'CallOutcomeModal' packages/ apps/` returns zero hits | green |
| Mobile finger-tappable | Visual sign-off at the human-verify checkpoint at 375px viewport | green |

`cd apps/web && npm run test` reports 4 files / 17 tests / green.
`cd apps/web && npm run e2e` reports 1 spec / 3 tests / green.

## Migrations applied (live on tgswsdfaszvztbpczfve)

| # | File | Plan |
|---|---|---|
| 00009 | `queue_rpcs.sql` | 03-01 |
| 00010 | `queue_ux_redesign.sql` | 03-04 |

(Phase 1 owned 00001 + 00002. Phase 2 owned 00003–00008. Next migration is 00011.)

## Files added / modified across the phase

**Backend (Postgres):**
- `00009_queue_rpcs.sql` — `mark_lead_contacted`, `complete_call`, `schedule_callback`, `agent_today_stats` view (v1)
- `00010_queue_ux_redesign.sql` — `leads.call_attempts` + `leads.last_outcome` columns, RPC rewrites, `record_no_answer`, `agent_stats_in_range`, `agent_today_stats` view (v2)

**Backend (TypeScript):**
- `packages/supabase/src/realtime.ts` — full rewrite: `postgres_changes` → `usePrivateBroadcast<T>` (private-by-default, generic, ref-stable callbacks)
- `packages/supabase/src/dal/queue.ts` — 5 reads + 4 writes (was 4 + 3): `getAgentQueue`, `getAgentFollowUps`, `getAgentConvertedInRange`, `getAgentLostInRange`, `getAgentTodayStats`, `getAgentStatsInRange`, `markLeadContacted`, `completeCall`, `scheduleCallback`, `recordNoAnswer`
- `packages/supabase/src/dal/index.ts` — barrel exports
- `packages/supabase/src/dal/leads.ts` — dropped `as never` cast on `ingestLead` (Phase 2 carry-forward closed)
- `packages/supabase/src/schemas/queue.ts` — `callOutcomeEnum` (won / lost / no_answer / callback), `completeCallInput`, `scheduleCallbackInput`, `recordNoAnswerInput`, `agentStatsInRangeInput`, `dateRangeKeyEnum`
- `packages/supabase/src/types/database.ts` — regenerated against 00009 then 00010
- `packages/supabase/package.json` — `./schemas/queue` subpath export

**Frontend (apps/web):**
- `apps/web/app/(sales-rep)/[country]/queue/page.tsx` — Server Component, parallel fetch of 4 lists + 2 stats sources scoped by URL `?range`
- `apps/web/app/(sales-rep)/_components/use-agent-broadcast.ts` — typed wrapper for `agent:<uid>` private channel
- `apps/web/app/(sales-rep)/_components/queue-view.tsx` — 4-list state machine, broadcast routing, inline outcome handlers
- `apps/web/app/(sales-rep)/_components/queue-card.tsx` — single lead card with SLA dot + 30s tick + tried-Nx chip + embedded `<CardActionArea />`
- `apps/web/app/(sales-rep)/_components/queue-stats.tsx` — 4 tiles (live + range-aware) + DateRangePicker
- `apps/web/app/(sales-rep)/_components/queue-tabs.tsx` — 4 tabs
- `apps/web/app/(sales-rep)/_components/queue-service-filter.tsx` — Select over 10 PRD form slugs
- `apps/web/app/(sales-rep)/_components/card-action-area.tsx` — state machine: idle / mid_call / lost-chips / callback-quickpick
- `apps/web/app/(sales-rep)/_components/outcome-buttons.tsx` — three pills + No-answer link
- `apps/web/app/(sales-rep)/_components/lost-reason-chips.tsx` — 4 chips + Other-with-input + Save
- `apps/web/app/(sales-rep)/_components/callback-quickpick.tsx` — 3 quick chips + datetime fallback + Schedule
- `apps/web/app/(sales-rep)/_components/date-range-picker.tsx` — URL-stateful Today / Week / Month / Custom
- `apps/web/app/(sales-rep)/_lib/date-range.ts` — `parseRangeParams` / `buildRangeUrl` / `formatRangeLabel` (server-safe pure functions)

**Routes:**
- `apps/web/app/api/queue/contact/route.ts` — POST `mark_lead_contacted` wrapper
- `apps/web/app/api/queue/complete/route.ts` — POST `complete_call` wrapper (Zod-narrowed to four outcomes)
- `apps/web/app/api/queue/callback/route.ts` — POST `schedule_callback` wrapper
- `apps/web/app/api/queue/no-answer/route.ts` — POST `record_no_answer` wrapper
- `apps/web/app/api/e2e-login/route.ts` — Playwright cookie-injection bridge (gated by `E2E_AUTH_ENABLED`)

**Tests:**
- `apps/web/tests/queue.rpcs.test.ts` — 4 + 4 = 8 RPC integration assertions
- `apps/web/e2e/sales-rep-golden-path.spec.ts` — 3 Playwright tests
- (Existing Phase 2 vitest suite continues to run green: cross-tenant RLS, idempotency, broadcast.)

**Removed:**
- `apps/web/app/(sales-rep)/_components/queue-action-bar.tsx` (responsibilities folded into `queue-view` + `card-action-area`)
- `packages/ui/src/components/call-outcome-modal.tsx` (modal-free surface)

## Risks mitigated

| Risk | Mitigation |
|---|---|
| Cross-country leak via the agent surface | Every queue RPC gates `auth.uid() = leads.assigned_to AND auth.jwt()->>country_code = leads.country_code` inside the SECURITY DEFINER function. RLS on the underlying tables remains the primary gate; the inside-function check is defence-in-depth for the definer-rights bypass. |
| Concurrent outcome capture racing the lead status | `FOR UPDATE` row lock inside `mark_lead_contacted` and `complete_call`. Two simultaneous clicks serialize cleanly; the second hits `invalid_status` and the UI surfaces it. |
| Plan-03-03 dead button on terminal leads | UI hides the action area for `status IN ('converted','lost')` AND `mark_lead_contacted` RAISEs `invalid_status`. Two layers must fail to reproduce the original crash. |
| Plan-03-03 done_today double-count | View rewrite — `done_today` reads `leads` filtered by terminal status + same-day `updated_at`, never sums `lead_events`. The `'connected'` event no longer leaks into the counter. |
| Sales-pipeline jargon drift between UI and DB | `'qualified'` rejected by the narrowed `callOutcomeEnum` AND by the `complete_call` IF-validation (RAISEs `invalid_outcome`). UI never renders the word. DB enum value retained but unreachable. |
| Auto-Lost on no-answer destroying real leads | `record_no_answer` never mutates `status`. Three unanswered calls move the card to Follow-ups but the lead remains the agent's to retry forever. |
| Range URL state diverging between server and client | `parseRangeParams` lifted to `_lib/date-range.ts` — single helper used by both `<DateRangePicker />` and the server page. No client-only React leaking into the server bundle. |

## Carry-forward to Phase 4

- **Realtime spine is reusable as-is** — `usePrivateBroadcast<T>` with `topic: country:<code>` for the country-admin surface (broadcast triggers from migration 00008 already fire on every assigned lead).
- **DAL surface for stats** — Phase 4 reuses the `agent_stats_in_range`-shaped pattern: a SECURITY DEFINER RPC scoped by `country_code` for the country admin and by no scope for HQ admin.
- **Date range UX** — `<DateRangePicker />` and `_lib/date-range.ts` drop into the country-admin and HQ KPI rows unchanged.
- **Stats two-source split** — live tiles from a view, range-aware tiles from an RPC. Same template at all three role surfaces.
- **Cleanup carry-overs (Phase 6 candidates):**
  - Next.js 16 `middleware` → `proxy` rename. Today's deploy still works; Next 17 will require the rename.
  - Phase 1 `user_roles` policies use unwrapped `auth.jwt()` (small table, low cost) — wrap in InitPlan caching for symmetry with Phase 2/3.
  - `createServiceRoleClient` and `createAdminClient` are functionally identical — converge to one name.
  - Hermetic vitest setup — currently `tests/ingest.idempotency.test.ts` and `tests/realtime.broadcast.test.ts` need a running `npm run dev` on port 3012; spin up a Next.js test server inside the vitest setup.

## Production fingerprint

- Queue page: `https://paratus-group-dashboards.vercel.app/<country>/queue?range=today`
- Routes: `/api/queue/contact`, `/api/queue/complete`, `/api/queue/callback`, `/api/queue/no-answer`
- E2E bridge: `/api/e2e-login` (gated by `E2E_AUTH_ENABLED`)
- Webhook (Phase 2): `https://paratus-group-dashboards.vercel.app/api/leads/ingest`
- CSV importer (Phase 2): `https://paratus-group-dashboards.vercel.app/api/leads/import-csv`
- Health: `https://paratus-group-dashboards.vercel.app/api/health`
- Supabase: project `tgswsdfaszvztbpczfve` (West EU / Ireland), Postgres 17.6, migrations 00001–00010 applied
- Tag SHA: `git rev-parse phase-3-complete`

## Bottom-line outcome

Agent receives lead → calls → captures outcome → exits queue → stats update — all without refresh, all on mobile, modal-free. Vocabulary aligns to the agent's mental model (Converted / Follow-ups / Lost), counters are honest (no double-count), and the surface backstops UI mistakes at the database layer (terminal-lead RAISE, narrowed outcome enum). 17 vitest + 3 Playwright assertions green against the live database. Production deploy serves the redesigned surface from `main`.

## Next: Phase 4 — Country Admin Dashboard

The realtime broadcast is proven, the country-scoped RLS is stress-tested by Phase 2 + Phase 3, and the date-range pattern is ready to reuse. Phase 4 builds the country admin surface on top: KPIs, pipeline funnel, speed-to-lead chart, agent leaderboard, lead list with reassignment.
