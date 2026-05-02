---
last_updated: 2026-05-02
current_phase: 03-sales-rep-queue
current_plan: 04
plan_status: shipped
next_plan: 04-country-admin-dashboard (research → plan → execute)
---

# Project State

Tracks where the GSD pipeline is in the roadmap. Updated at the end of every plan.

## Phase progress

| Phase | Status | Last touched |
|-------|--------|--------------|
| 01-foundation | shipped (validated 2026-04-28, tag `phase-1-complete`) | 2026-04-28 |
| 02-data-model-ingestion | shipped (validated 2026-05-01, tag `phase-2-complete` staged — push pending) | 2026-05-01 |
| 03-sales-rep-queue | shipped (validated 2026-05-02, tag `phase-3-complete` staged — push pending) | 2026-05-02 |
| 04-country-admin-dashboard | pending | – |
| 05-hq-overview | pending | – |
| 06-production-hardening | pending | – |
| 07-rollout | pending | – |

## Phase 02 plan tracker

| Plan | Subsystem | Status | Summary |
|------|-----------|--------|---------|
| 02-01 | rbac-v2 + reference data | shipped | `02-01-SUMMARY.md` |
| 02-02 | leads schema (`leads`, `lead_events`, `callbacks` + RLS + 5 views) | shipped | `02-02-SUMMARY.md` |
| 02-03 | assignment + ingest RPCs + realtime broadcast triggers | shipped | `02-03-SUMMARY.md` |
| 02-04 | webhook ingest endpoint (HMAC + Zod over `ingest_lead`) | shipped | `02-04-SUMMARY.md` |
| 02-05 | CSV importer route handler | shipped | `02-05-SUMMARY.md` |
| 02-06 | realtime + cross-tenant RLS validation tests | shipped | `02-06-SUMMARY.md` |

Phase rollup: `02-data-model-ingestion/PHASE-SUMMARY.md`.

## Phase 03 plan tracker

| Plan | Subsystem | Status | Summary |
|------|-----------|--------|---------|
| 03-01 | queue RPCs + DAL + Zod + tests | shipped | `03-01-SUMMARY.md` |
| 03-02 | queue UI (Server Components + realtime) | shipped | `03-02-SUMMARY.md` |
| 03-03 | callback modal + 3 API routes + Playwright bridge | shipped (modal deprecated by 03-04; routes + e2e bridge survive) | (no SUMMARY — superseded by 03-04 redesign before close-out; commits `15f9339`, `7d5df00`, `d846379`) |
| 03-04 | UX redesign — 4 tabs, 4 tiles, range picker, no-answer flow, double-counter fix, dead-button fix | shipped | `03-04-SUMMARY.md` |

Phase rollup: `03-sales-rep-queue/PHASE-SUMMARY.md`.

## Key decisions still in force

- Single Next.js app (`apps/web`) with role-grouped routes — locked since phase 1.
- Single Supabase project, multi-tenant via RLS on `country_code` JWT claim — locked.
- AMA-mirrored design system in `packages/ui` — locked.
- `country_code` is enum on `user_roles` (auth-side strictness) but `text` on `countries.code` (FK target for leads/callbacks) — accepted asymmetry, see plan 02-01 SUMMARY.
- Migration filenames are sequential `0000N_*.sql`; new plan numbers do NOT correspond to migration numbers. Plan 03-01 took `00009`; plan 03-04 took `00010`. Next migration is `00011`.
- `lead_events.country_code` denormalised from `leads` (deviation from PRD) — symmetric RLS, indexable. Maintained by BEFORE INSERT trigger.
- All Phase 2 + Phase 3 RLS policies use `(SELECT auth.jwt()/auth.uid())` wrap for InitPlan caching. All views set `security_invoker = true`. (Phase 1's `user_roles` policies are unwrapped — small table, low cost; cleanup in Phase 6.)
- Dedupe bucket uses `date_bin('5 minutes', submitted_at, '2000-01-01Z'::timestamptz)` (the IMMUTABLE timestamptz overload), not `date_trunc + extract` — required because the expression sits inside a unique index.
- Realtime uses Broadcast-from-Database (not `postgres_changes`); private channels are auth-checked via 3 RLS policies on `realtime.messages`.
- `ingest_lead(jsonb)` is the single atomic entry point for lead creation; webhook (02-04) and CSV importer (02-05) both wrap it. Service-role only (`REVOKE ALL FROM public/anon/authenticated; GRANT EXECUTE TO service_role`).
- Webhook ingest is HMAC-authenticated, not session-authenticated. Middleware bypasses cookie auth for any `/api/leads/*` path; each route does its own auth (HMAC for the webhook, cookie session for the importer). The redundant per-path `PUBLIC_PATHS` entry that plan 02-04 added was removed in plan 02-06 — single source of truth is now the prefix block.
- `runtime='nodejs'` on the webhook because Edge has no `crypto.timingSafeEqual`.
- `PARATUS_INGEST_SECRET` provisioned in Vercel for prod/preview/dev. Production + Preview are flagged Sensitive; Development is plain (Vercel rejects `--sensitive` on the development target). Same value across all three; rotate together via the runbook in `.planning/phases/02-data-model-ingestion/02-USER-SETUP.md`.
- Path 3 CSV importer (`/api/leads/import-csv`) reuses Phase 1's `createAdminClient` (`@repo/supabase/admin`) instead of plan 02-04's new `createServiceRoleClient` in `server.ts` — same key, same options. Both names exist in the codebase; convergence to one is a small Phase 6 cleanup.
- Integration tests authenticate test users via the magiclink-cookie technique (`admin.generateLink` → `anon.verifyOtp`) — no test passwords in env. Service-role client is setup-only; assertions run from anon-key clients carrying real user JWTs so RLS is the thing under test.
- Realtime tests listen on `event:'*'` not `'INSERT'`. The agent broadcast trigger emits `TG_OP`, and the webhook path triggers an `UPDATE` (assign_lead changes assigned_to from NULL → agent_id) rather than the `INSERT` (which has assigned_to=NULL).
- Phase 3 queue RPCs (`mark_lead_contacted`, `complete_call`, `schedule_callback`, `record_no_answer`, `agent_stats_in_range`) are EXECUTE-granted to `authenticated`, not `service_role` like `ingest_lead`. They run from the agent's authed cookie session, gate `auth.uid() = leads.assigned_to` AND `auth.jwt() ->> country_code = leads.country_code` inside the SECURITY DEFINER function (defence in depth — the definer-rights bypass RLS, so the inside-function check is the only enforcement on writes).
- `agent_today_stats` view: `security_invoker = true`, LEFT JOINed from `user_roles` so every active agent gets a row even with zero work (UI doesn't have to handle missing rows). Plan 03-04 rewrote the column shape to `to_call_count / follow_ups_count / done_today / converted_today / lost_today` (was `to_call_count / completed_today / converted_today / callbacks_pending`).
- Plan 03-01 dropped the `as never` cast on `ingestLead` after regenerating `Database` type against migration 00009 — Phase 2 carry-forward TODO closed.
- Plan 03-02 rewrote `packages/supabase/src/realtime.ts` from a `postgres_changes` subscriber to `usePrivateBroadcast<T>` — a generic private-channel broadcast hook with `config: { private: true }` baked in. Country admin (Phase 4) reuses the same hook with `topic: country:<code>`; agents use the typed `useAgentBroadcast` wrapper at `apps/web/app/(sales-rep)/_components/use-agent-broadcast.ts`.
- Plan 03-02 listens on `event:'*'` (not `INSERT`) because the webhook path always emits `UPDATE` — `assign_lead` flips `assigned_to` from `NULL` to `agent_id` after the initial insert. Filtering to a single op would silently miss the production code path (same call shipped in plan 02-06's broadcast test).
- Plan 03-02 stats are server-authoritative: `getAgentTodayStats()` is fetched on every server render, and the client only optimistically bumps `to_call_count` by 1 on a fresh assignment. Plan 03-04 wires `router.refresh()` after every successful outcome RPC so all five counters re-fetch from the authoritative server view.
- **Plan 03-04 — sales-pipeline jargon collapsed: 5 outcomes → 3 outcomes + soft-no-answer.** UI label "Converted" maps to DB `status='converted'`. The DB enum value `lead_events.outcome='won'` is preserved for analytics back-compat — UI never renders the word "won".
- **Plan 03-04 — `'qualified'` rejected by `complete_call`** (post-00010); status enum still contains it (no destructive change) but no code path emits it. Zod `callOutcomeEnum` and the RPC IF-validation both reject it.
- **Plan 03-04 — no-answer attempts never auto-Lost.** Agent retains the lead forever in Follow-ups; `call_attempts >= 3 AND last_outcome='no_answer'` triggers the tab move only. Status stays `contacted`.
- **Plan 03-04 — date range URL-stateful** via `?range=today|week|month|custom` (+ `?from`/`?to`); server-fetched via `getAgentStatsInRange` RPC. `parseRangeParams` helper at `apps/web/app/(sales-rep)/_lib/date-range.ts` is the single source of truth for both server page and client picker.
- **Plan 03-04 — defence-in-depth on the dead-button bug.** `mark_lead_contacted` RAISEs `invalid_status` when called against a `converted` or `lost` lead; UI hides the button. Two layers must fail to reproduce plan 03-03's dead-button crash.
- **Plan 03-04 — done_today single-counted at the view layer.** Recreated `agent_today_stats.done_today` reads `count(leads where status IN ('converted','lost') and updated_at >= start_of_day)` — no longer sums `lead_events`. Fixes the prior bug where the `'connected'` event leaked into the counter.
- **Plan 03-04 — modal-free surface.** `CallOutcomeModal` deleted from `@repo/ui`. Inline state-aware card actions (`<CardActionArea />`) cover all five outcomes (Call → Converted / Lost / Callback / No-answer). `git grep -n 'CallOutcomeModal' packages/ apps/` returns zero hits.

## Recent commits (most recent first)

- `37d6c5e` — chore(03-04): remove deprecated outcome modal
- `f92374d` — test(03-04): e2e for inline outcomes + follow-ups
- `f7d4828` — feat(03-04): no-answer route + complete route narrowed outcomes
- `dbd9773` — feat(03-04): 4-tab queue with date range
- `be51915` — feat(03-04): card action atoms
- `e78a0e4` — test(03-04): no-answer RPC + done_today filter + qualified rejection
- `b067f83` — feat(03-04): DAL surface for new queue model
- `fc3d77d` — feat(03-04): migration 00010 — queue UX redesign schema
- `d846379` — test(03-03): playwright golden-path E2E + e2e-login auth bridge
- `7d5df00` — feat(03-03): wire Call Now → contact → outcome modal → complete/callback
- `15f9339` — feat(03-03): replace CallOutcomeModal with five-outcome variant
- `c91a519` — docs(03-02): close plan — SUMMARY + STATE update

(Phase-3 close-out commit `docs(03-04): close phase 3 — SUMMARY + PHASE-SUMMARY + STATE update` lands in the same write as this STATE update; refresh the table after the commit if reading on disk.)

## Live infrastructure

- Production URL: https://paratus-group-dashboards.vercel.app
- Webhook URL: https://paratus-group-dashboards.vercel.app/api/leads/ingest
- CSV importer URL: https://paratus-group-dashboards.vercel.app/api/leads/import-csv
- Queue routes: `/api/queue/contact`, `/api/queue/complete`, `/api/queue/callback`, `/api/queue/no-answer` (internal — agent cookie session only)
- E2E bridge: `/api/e2e-login` (gated by `E2E_AUTH_ENABLED`; absent in production)
- Supabase project ref: `tgswsdfaszvztbpczfve` (region: West EU / Ireland) — migrations 00001–00010 applied
- Vercel team: `paratusgroup` / project `paratus-group-dashboards`
- GitHub: https://github.com/Robofish89/paratus-group-dashboards (private)

## Working tree status at last update

Clean except for pre-existing modifications to `.planning/handoff-2026-04-27-jwt-bug.md`, `.planning/handoff-2026-04-27-vercel-deploy.md`, `.planning/handoff-2026-04-28.md`, and `.planning/phases/01-foundation/01-03-SUMMARY.md` (uncommitted at session start, not part of plan 02-* / 03-* work), plus the untracked `.claude/` directory (local Claude Code config).

## Next move

Phase 3 closed. Agent surface is live, modal-free, and validated end-to-end against the production project. Both production bugs from the plan-03-03 modal phase fixed at the database layer in 03-04: `done_today` no longer double-counts; terminal leads no longer expose a dead Call button (UI hides + RPC RAISEs `invalid_status` as backstop). Vocabulary aligned to the agent's mental model — Converted / Follow-ups / Lost. 17 vitest + 3 Playwright tests green.

Carry-overs explicitly tracked into Phase 6:
- Next.js 16 `middleware` → `proxy` rename (deprecation warning at every build).
- Hermetic vitest setup (today the route-driven tests need `npm run dev` running on port 3012).
- `createServiceRoleClient` and `createAdminClient` convergence.
- Phase 1 `user_roles` policies wrapping for InitPlan caching symmetry.

The `phase-3-complete` tag is staged locally; push pending explicit user approval (same posture as `phase-2-complete`).

**Phase 4 — Country Admin Dashboard** is next: KPIs, pipeline funnel, speed-to-lead chart, agent leaderboard, lead list with reassignment. Reuse template ready: `usePrivateBroadcast<T>` with `topic: country:<code>`, `<DateRangePicker />` and `_lib/date-range.ts` drop in unchanged, two-source stats split (live tile from view + range tile from RPC) is the proven pattern. Research → plan → execute, starting with `gsd:research-phase`.
