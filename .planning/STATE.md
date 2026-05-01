---
last_updated: 2026-05-01
current_phase: 02-data-model-ingestion
current_plan: 02-02
plan_status: shipped
next_plan: 02-03-ingest-webhook
---

# Project State

Tracks where the GSD pipeline is in the roadmap. Updated at the end of every plan.

## Phase progress

| Phase | Status | Last touched |
|-------|--------|--------------|
| 01-foundation | shipped (validated 2026-04-28, tag `phase-1-complete`) | 2026-04-28 |
| 02-data-model-ingestion | in progress (2/6 plans shipped) | 2026-05-01 |
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
| 02-03 | webhook ingest endpoint (HMAC + Zod) | pending | – |
| 02-04 | round-robin assignment (`assign_lead()` + SKIP LOCKED) | pending | – |
| 02-05 | CSV importer route handler | pending | – |
| 02-06 | realtime broadcast triggers | pending | – |

## Key decisions still in force

- Single Next.js app (`apps/web`) with role-grouped routes — locked since phase 1.
- Single Supabase project, multi-tenant via RLS on `country_code` JWT claim — locked.
- AMA-mirrored design system in `packages/ui` — locked.
- `country_code` is enum on `user_roles` (auth-side strictness) but `text` on `countries.code` (FK target for leads/callbacks) — accepted asymmetry, see plan 02-01 SUMMARY.
- Migration filenames are sequential `0000N_*.sql`; new plan numbers do NOT correspond to migration numbers (auth-admin grant in phase 1 took `00002`). Plan 02-02 referred to `00004` + `00005` but actually shipped as `00005` + `00006`. Next migration is `00007`.
- `lead_events.country_code` denormalised from `leads` (deviation from PRD) — symmetric RLS, indexable. Maintained by BEFORE INSERT trigger.
- All RLS policies use `(SELECT auth.jwt()/auth.uid())` wrap for InitPlan caching. All views set `security_invoker = true`.

## Recent commits (most recent first)

- `ca90a9a` — feat(02-02): regenerate Database type — leads + views
- `83f90b6` — feat(02-02): dashboard views — 5 views w/ security_invoker
- `e90a52c` — feat(02-02): leads schema + RLS — leads, lead_events, callbacks
- `dd04650` — feat(02-01): regenerate Database type from Supabase schema
- `d0f491d` — feat(02-01): seed reference data — countries (15) + forms (10)
- `7d21771` — feat(02-01): rbac v2 — last_assigned_at + display_name on user_roles
- `d271d4b` — docs(02): create phase 2 plan
- `6bfd5f2` — docs(02): phase 2 research + PRD updates

## Live infrastructure

- Production URL: https://paratus-group-dashboards.vercel.app
- Supabase project ref: `tgswsdfaszvztbpczfve` (region: West EU / Ireland)
- Vercel team: `paratusgroup` / project `paratus-group-dashboards`
- GitHub: https://github.com/Robofish89/paratus-group-dashboards (private)

## Working tree status at last update

Clean except for pre-existing modifications to `.planning/handoff-*` and `.planning/phases/01-foundation/01-03-SUMMARY.md` which were already uncommitted at session start (not part of plan 02-01 or 02-02).

## Next move

Run plan 02-03 (webhook ingest endpoint — `/api/leads/ingest` with HMAC + Zod). Reference plan: `.planning/phases/02-data-model-ingestion/02-03-PLAN.md` (when authored). Build on top of `leads` table + `assign_lead()` (which lands in plan 02-04).
