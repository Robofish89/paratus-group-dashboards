---
last_updated: 2026-05-01
current_phase: 03-sales-rep-queue
current_plan: null
plan_status: pending
next_plan: 03-sales-rep-queue (research → plan → execute)
---

# Project State

Tracks where the GSD pipeline is in the roadmap. Updated at the end of every plan.

## Phase progress

| Phase | Status | Last touched |
|-------|--------|--------------|
| 01-foundation | shipped (validated 2026-04-28, tag `phase-1-complete`) | 2026-04-28 |
| 02-data-model-ingestion | shipped (validated 2026-05-01, tag `phase-2-complete` staged — push pending) | 2026-05-01 |
| 03-sales-rep-queue | pending | – |
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

## Key decisions still in force

- Single Next.js app (`apps/web`) with role-grouped routes — locked since phase 1.
- Single Supabase project, multi-tenant via RLS on `country_code` JWT claim — locked.
- AMA-mirrored design system in `packages/ui` — locked.
- `country_code` is enum on `user_roles` (auth-side strictness) but `text` on `countries.code` (FK target for leads/callbacks) — accepted asymmetry, see plan 02-01 SUMMARY.
- Migration filenames are sequential `0000N_*.sql`; new plan numbers do NOT correspond to migration numbers (auth-admin grant in phase 1 took `00002`). Plan 02-03 referred to `00006` + `00007` but actually shipped as `00007` + `00008`. Next migration (if any) is `00009`.
- `lead_events.country_code` denormalised from `leads` (deviation from PRD) — symmetric RLS, indexable. Maintained by BEFORE INSERT trigger.
- All Phase 2 RLS policies use `(SELECT auth.jwt()/auth.uid())` wrap for InitPlan caching. All views set `security_invoker = true`. (Phase 1's `user_roles` policies are unwrapped — small table, low cost; cleanup in Phase 6.)
- Dedupe bucket uses `date_bin('5 minutes', submitted_at, '2000-01-01Z'::timestamptz)` (the IMMUTABLE timestamptz overload), not `date_trunc + extract` — required because the expression sits inside a unique index.
- Realtime uses Broadcast-from-Database (not `postgres_changes`); private channels are auth-checked via 3 RLS policies on `realtime.messages`.
- `ingest_lead(jsonb)` is the single atomic entry point for lead creation; webhook (02-04) and CSV importer (02-05) both wrap it. Service-role only (`REVOKE ALL FROM public/anon/authenticated; GRANT EXECUTE TO service_role`).
- Webhook ingest is HMAC-authenticated, not session-authenticated. Middleware bypasses cookie auth for any `/api/leads/*` path; each route does its own auth (HMAC for the webhook, cookie session for the importer). The redundant per-path `PUBLIC_PATHS` entry that plan 02-04 added was removed in plan 02-06 — single source of truth is now the prefix block.
- `runtime='nodejs'` on the webhook because Edge has no `crypto.timingSafeEqual`.
- `PARATUS_INGEST_SECRET` provisioned in Vercel for prod/preview/dev. Production + Preview are flagged Sensitive; Development is plain (Vercel rejects `--sensitive` on the development target). Same value across all three; rotate together via the runbook in `.planning/phases/02-data-model-ingestion/02-USER-SETUP.md`.
- Path 3 CSV importer (`/api/leads/import-csv`) reuses Phase 1's `createAdminClient` (`@repo/supabase/admin`) instead of plan 02-04's new `createServiceRoleClient` in `server.ts` — same key, same options. Both names exist in the codebase; convergence to one is a small Phase 6 cleanup.
- Integration tests authenticate test users via the magiclink-cookie technique (`admin.generateLink` → `anon.verifyOtp`) — no test passwords in env. Service-role client is setup-only; assertions run from anon-key clients carrying real user JWTs so RLS is the thing under test.
- Realtime tests listen on `event:'*'` not `'INSERT'`. The agent broadcast trigger emits `TG_OP`, and the webhook path triggers an `UPDATE` (assign_lead changes assigned_to from NULL → agent_id) rather than the `INSERT` (which has assigned_to=NULL).

## Recent commits (most recent first)

- `b683ba2` — test(02-06): webhook idempotency + realtime broadcast tests
- `49d0a63` — test(02-06): vitest + cross-tenant RLS integration test
- `b1bb7a3` — docs(02-05): close plan — SUMMARY + STATE update
- `7c2817a` — docs(02-04): complete webhook ingest plan
- `205762d` — feat(02-05): /api/leads/import-csv multipart importer
- `0254343` — feat(02-04): /api/leads/ingest webhook + HMAC verification
- `65adf79` — feat(02-04): zod ingest schema + service-role client + leads/events DAL
- `05b85fe` — feat(02-05): csv row Zod schema + papaparse dep
- `61ae3c4` — feat(02-03): realtime broadcast triggers + private-channel auth
- `34d8593` — feat(02-03): assign_lead + ingest_lead RPCs + idempotency index

## Live infrastructure

- Production URL: https://paratus-group-dashboards.vercel.app
- Webhook URL: https://paratus-group-dashboards.vercel.app/api/leads/ingest
- CSV importer URL: https://paratus-group-dashboards.vercel.app/api/leads/import-csv
- Supabase project ref: `tgswsdfaszvztbpczfve` (region: West EU / Ireland)
- Vercel team: `paratusgroup` / project `paratus-group-dashboards`
- GitHub: https://github.com/Robofish89/paratus-group-dashboards (private)

## Working tree status at last update

Clean except for pre-existing modifications to `.planning/handoff-*` and `.planning/phases/01-foundation/01-03-SUMMARY.md` which were already uncommitted at session start (not part of plan 02-* work).

## Next move

Phase 2 closed. The realtime broadcast, assignment RPC, agent-scoped RLS, webhook idempotency, and CSV importer are all proven by green integration tests. Two HTTP ingest paths live in production.

Phase 3 (Sales Rep Queue) is next: build the agent UI on top of the realtime + RLS spine. Queue list, call action, outcome capture modal, callback scheduling, mobile responsive layout. Visual contract: `docs/design-reference/sales-rep-*`. Carry-over cleanup items (converge admin/service-role client names, wrap Phase-1 RLS policies, regen Database type) are tracked for Phase 6.

The `phase-2-complete` tag is staged locally; push pending explicit user approval at the plan 02-06 checkpoint.
