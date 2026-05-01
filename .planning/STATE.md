---
last_updated: 2026-05-01
current_phase: 02-data-model-ingestion
current_plan: 02-04
plan_status: shipped
next_plan: 02-05-csv-importer
---

# Project State

Tracks where the GSD pipeline is in the roadmap. Updated at the end of every plan.

## Phase progress

| Phase | Status | Last touched |
|-------|--------|--------------|
| 01-foundation | shipped (validated 2026-04-28, tag `phase-1-complete`) | 2026-04-28 |
| 02-data-model-ingestion | in progress (4/6 plans shipped) | 2026-05-01 |
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
| 02-05 | CSV importer route handler | pending (parallel agent in flight) | – |
| 02-06 | realtime + cross-tenant RLS validation tests | pending | – |

## Key decisions still in force

- Single Next.js app (`apps/web`) with role-grouped routes — locked since phase 1.
- Single Supabase project, multi-tenant via RLS on `country_code` JWT claim — locked.
- AMA-mirrored design system in `packages/ui` — locked.
- `country_code` is enum on `user_roles` (auth-side strictness) but `text` on `countries.code` (FK target for leads/callbacks) — accepted asymmetry, see plan 02-01 SUMMARY.
- Migration filenames are sequential `0000N_*.sql`; new plan numbers do NOT correspond to migration numbers (auth-admin grant in phase 1 took `00002`). Plan 02-03 referred to `00006` + `00007` but actually shipped as `00007` + `00008`. Next migration (if any) is `00009`.
- `lead_events.country_code` denormalised from `leads` (deviation from PRD) — symmetric RLS, indexable. Maintained by BEFORE INSERT trigger.
- All RLS policies use `(SELECT auth.jwt()/auth.uid())` wrap for InitPlan caching. All views set `security_invoker = true`.
- Dedupe bucket uses `date_bin('5 minutes', submitted_at, '2000-01-01Z'::timestamptz)` (the IMMUTABLE timestamptz overload), not `date_trunc + extract` — required because the expression sits inside a unique index.
- Realtime uses Broadcast-from-Database (not `postgres_changes`); private channels are auth-checked via 3 RLS policies on `realtime.messages`.
- `ingest_lead(jsonb)` is the single atomic entry point for lead creation; webhook (02-04) and CSV importer (02-05) both wrap it. Service-role only (`REVOKE ALL FROM public/anon/authenticated; GRANT EXECUTE TO service_role`).
- Webhook ingest is HMAC-authenticated, not session-authenticated. `/api/leads/ingest` was added to `apps/web/middleware.ts` `PUBLIC_PATHS` so it bypasses the Supabase cookie gate. `runtime='nodejs'` is required because Edge has no `crypto.timingSafeEqual`.
- `PARATUS_INGEST_SECRET` provisioned in Vercel for prod/preview/dev. Production + Preview are flagged Sensitive; Development is plain (Vercel rejects `--sensitive` on the development target). Same value across all three; rotate together via the runbook in `.planning/phases/02-data-model-ingestion/02-USER-SETUP.md`.

## Recent commits (most recent first)

- `0254343` — feat(02-04): /api/leads/ingest webhook + HMAC verification
- `65adf79` — feat(02-04): zod ingest schema + service-role client + leads/events DAL
- `61ae3c4` — feat(02-03): realtime broadcast triggers + private-channel auth
- `34d8593` — feat(02-03): assign_lead + ingest_lead RPCs + idempotency index
- `ca90a9a` — feat(02-02): regenerate Database type — leads + views
- `83f90b6` — feat(02-02): dashboard views — 5 views w/ security_invoker
- `e90a52c` — feat(02-02): leads schema + RLS — leads, lead_events, callbacks
- `dd04650` — feat(02-01): regenerate Database type from Supabase schema
- `d0f491d` — feat(02-01): seed reference data — countries (15) + forms (10)
- `7d21771` — feat(02-01): rbac v2 — last_assigned_at + display_name on user_roles

## Live infrastructure

- Production URL: https://paratus-group-dashboards.vercel.app
- Supabase project ref: `tgswsdfaszvztbpczfve` (region: West EU / Ireland)
- Vercel team: `paratusgroup` / project `paratus-group-dashboards`
- GitHub: https://github.com/Robofish89/paratus-group-dashboards (private)

## Working tree status at last update

Clean except for pre-existing modifications to `.planning/handoff-*` and `.planning/phases/01-foundation/01-03-SUMMARY.md` which were already uncommitted at session start (not part of plan 02-01 or 02-02).

## Next move

Plan 02-04 (webhook ingest at `/api/leads/ingest`) shipped — HMAC + Zod + service-role DAL wired, smoke-tested 201/200/401/400, `PARATUS_INGEST_SECRET` set in Vercel.

Plan 02-05 (CSV importer route handler) is running concurrently with 02-04 — country admins will upload CSVs of historical leads via `multipart/form-data`, parsed with `papaparse` in chunks of 500, each row calling `ingest_lead()`. Both plans share the `@repo/supabase/dal` and `@repo/supabase/schemas` barrels.

Plan 02-06 closes Phase 2 with the cross-tenant RLS test (3 seed leads MZ/BW/ZA already in place) and a realtime fan-out test against the now-live ingest endpoint.
