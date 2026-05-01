---
phase: 02-data-model-ingestion
plan: 02
status: shipped
shipped_at: 2026-05-01
subsystem: database
requires:
  - 02-01
provides:
  - leads-schema
  - rls-policies
  - dashboard-views
affects:
  - 02-03-ingest-webhook
  - 02-04-round-robin-assignment
  - 02-05-csv-importer
  - 02-06-realtime-broadcast
key-files:
  - packages/supabase/migrations/00005_leads_schema.sql
  - packages/supabase/migrations/00006_views.sql
  - packages/supabase/src/types/database.ts
key-decisions:
  - lead_events.country_code denormalised from leads (deviation from PRD/data-model.md) — symmetric RLS + indexable tenant scoping
  - INSERT trigger maintains lead_events.country_code from parent lead — callers never set it directly
  - Every auth.jwt() / auth.uid() wrapped in (SELECT …) for InitPlan caching (>99% perf gain)
  - Views set security_invoker = true so RLS evaluates against the querying user, not the view owner (mandatory)
  - country_leaderboard filters c.status = 'active' so coming-soon countries don't pollute group KPIs until activated
  - Migration files shipped as 00005 + 00006 (plan referred to them as 00004 + 00005; numbering shifted because Phase 1 already used 00002)
---

# Plan 02-02 — Leads schema + RLS + views: Closure

The Phase 2 spine is now load-bearing. Every Phase 3+ surface (sales-rep queue, country-admin dashboard, HQ overview) reads from the views in 00006; every Phase 2 plan from 02-03 onwards writes through the tables in 00005.

## What was actually shipped

| Task | What | Commit |
|------|------|--------|
| 1 | Migration `00005_leads_schema.sql` — `leads`, `lead_events`, `callbacks` tables; 10 indexes; 11 country-scoped RLS policies (every `auth.jwt()/auth.uid()` wrapped in `(SELECT …)`); `set_lead_event_country_code` BEFORE INSERT trigger; `leads.updated_at` trigger | `e90a52c` |
| 2 | Migration `00006_views.sql` — 5 dashboard views (`lead_pipeline_by_country`, `speed_to_lead_daily`, `agent_performance`, `lead_source_mix`, `country_leaderboard`); all set `security_invoker = true`; `GRANT SELECT` to `authenticated` | `83f90b6` |
| 3 | Regenerated `Database` TypeScript type; `npm run type-check` + `npm run lint` clean | `ca90a9a` |

Both migrations applied to the live Paratus Group Supabase project (`tgswsdfaszvztbpczfve`) via the Management API SQL endpoint.

## Migration-numbering shift (documented)

Plan 02-02 referenced `00004_leads_schema.sql` and `00005_views.sql`. Actually shipped as **`00005_leads_schema.sql`** and **`00006_views.sql`**.

**Why:** Phase 1 had already shipped `00002_allow_auth_admin_read_user_roles.sql` (the auth-admin grant fix that unblocked the JWT hook). Plan 02-01 then used 00003 + 00004 for RBAC v2 + reference data. Plan 02-02 inherits the +2 offset.

The migration file headers and the `database.ts` header comment both call out the shift, listing the actual migration filenames. No app code referenced filenames; only file-system order matters. Plan 02-03 and later should expect the next migrations to be `00007_*`, `00008_*`, etc.

Current state of `packages/supabase/migrations/`:
- `00001_rbac_schema.sql` (Phase 1)
- `00002_allow_auth_admin_read_user_roles.sql` (Phase 1)
- `00003_rbac_v2.sql` (plan 02-01)
- `00004_reference_data.sql` (plan 02-01)
- `00005_leads_schema.sql` (plan 02-02 — was "00004" in plan)
- `00006_views.sql` (plan 02-02 — was "00005" in plan)

## Verification (live Supabase)

- `pg_tables`: `leads`, `lead_events`, `callbacks` all exist with `rowsecurity=t`.
- `pg_indexes`: 10 indexes total across the three tables (9 from the plan + 1 added: `lead_events_country_idx` to support the denormalised-column policy).
- `pg_policies`: 11 policies installed — 4 on `leads`, 4 on `lead_events`, 3 on `callbacks` (HQ-all + country-admin + agent-own; leads gets a separate UPDATE policy for agents; lead_events gets a separate INSERT policy for agents).
- `pg_class.reloptions`: all 5 views carry `security_invoker=true`.
- Smoke leads inserted: 1 MZ (`aa636b6c-…`), 1 BW (`08b3fad8-…`), 1 ZA (`e05f1bbf-…`). Plan 02-06's cross-tenant RLS test will use these.
- `lead_events_set_country_code` trigger smoke-tested: NULL passed in → derived as `MZ` from parent lead. Trigger row remains in `lead_events` (1 row, type=`created`).
- `country_leaderboard` returns 12 rows (active countries only — coming-soon LS/MW/ZW excluded).
- `lead_pipeline_by_country` returns 3 rows (one per seed lead, all `status='new'`).
- `speed_to_lead_daily` returns 0 rows — correct: none of the seeds have `first_contacted_at` set, and none are older than 24h.
- `npm run type-check` + `npm run lint` green from repo root.
- Generated `Database` type now includes the 3 new tables, 5 new views, and 2 new enums (`lead_status`, `event_type`).

## Deviations from PRD / plan

**`lead_events.country_code` denormalisation** (deviation from `PRD/data-model.md` §lead_events). The PRD doesn't list a `country_code` column on `lead_events`, but plan 02-02 task 1 step 7 explicitly required it: makes the RLS policy symmetric with `leads` (no JOIN-in-USING for the country admin path), and makes the policy indexable (`lead_events_country_idx (country_code, created_at DESC)`). Maintained by `set_lead_event_country_code` BEFORE INSERT trigger so callers never set it manually — the trigger overwrites whatever was passed (including NULL) with the parent lead's country_code, raising `foreign_key_violation` if the parent doesn't exist.

**Indexes: 10 actually shipped vs. 9 in plan.** Same nine the plan asked for, plus `lead_events_country_idx` for the denormalised column above. Without it the lead_events country-admin policy would fall back to seq-scan once the table grows.

**Agent policies split into SELECT + UPDATE on leads, SELECT + INSERT on lead_events.** Plan said "agents only see/update their own"; I split them into two policies because the `WITH CHECK` semantics differ slightly between SELECT (no WITH CHECK exists) and UPDATE (must have one). Same effect, more readable.

**`leads.updated_at` column added** (not explicit in PRD's `leads` column list). Needed to fire the existing `handle_updated_at` trigger (re-used from migration 00001). Type is `TIMESTAMPTZ NOT NULL DEFAULT now()`. Cheap, useful for audit, no downside.

## Issues encountered

**Cloudflare WAF blocked first Management API POST.** The Supabase Management API sits behind Cloudflare; the default `urllib` user agent triggered a 403 (error code 1010). Fix: set a sensible `User-Agent` header on every Management API call. Documented in `/tmp/apply_migration.py` for the rest of Phase 2.

**No app-code consequences from any of these.** Phase 1 wiring (middleware, requireRole, requireCountry) is unchanged. Generated types are additive — every existing file still compiles.

## Next-phase readiness

Plan 02-03 (`/api/leads/ingest` webhook) can now do all of:
- INSERT into `leads` with full country_code + form_slug FKs satisfied by reference data.
- The `assign_lead()` function in plan 02-04 has the correct `assigned_to` target (`user_roles.user_id`) and `last_assigned_at` tie-breaker column on `user_roles`.
- The realtime broadcast trigger in plan 02-06 will fire on `INSERT OR UPDATE OF assigned_to ON public.leads`.
- Cross-tenant test in plan 02-06 has its three seed leads (MZ, BW, ZA) ready — sign in as `country-admin@MZ`, `SELECT * FROM leads WHERE country_code='BW'` should return 0 rows.

## Files changed

- Created `packages/supabase/migrations/00005_leads_schema.sql`
- Created `packages/supabase/migrations/00006_views.sql`
- Updated `packages/supabase/src/types/database.ts` (regenerated; +383 lines)

---

*Plan 02-02 closed 2026-05-01. Three commits on `main`. Ready for plan 02-03 (webhook ingest endpoint).*
