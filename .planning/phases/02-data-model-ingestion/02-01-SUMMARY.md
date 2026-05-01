---
phase: 02-data-model-ingestion
plan: 01
status: shipped
shipped_at: 2026-05-01
subsystem: database/auth
requires: []
provides:
  - rbac-v2
  - countries-reference
  - forms-reference
  - country-status-enum
  - generated-database-type
affects:
  - 02-02-leads-schema
  - 02-03-ingest-webhook
  - 02-04-round-robin-assignment
  - 02-05-csv-importer
  - 02-06-realtime-broadcast
key-files:
  - packages/supabase/migrations/00003_rbac_v2.sql
  - packages/supabase/migrations/00004_reference_data.sql
  - packages/supabase/src/types/database.ts
  - packages/supabase/src/types/index.ts
key-decisions:
  - countries.code is text PK (not the country_code enum) — leads/callbacks FK as text without enum-recreation pain
  - user_roles.country_code stays as enum — Phase 1 contract; CHECK constraint already enforces hq_admin=NULL invariant
  - generated Database type lives at packages/supabase/src/types/database.ts; hand-written types.ts kept for AppRole/CountryCode constants used by middleware
  - migration filenames are 00003 + 00004 (plan referenced 00002 + 00003 but 00002 was already taken by the auth-admin grant)
---

# Plan 02-01 — RBAC v2 + Reference Data: Closure

Phase 2 spine landed: `user_roles` carries the round-robin tie-breaker + display name; `countries` and `forms` reference tables exist with full seed; `Database` TypeScript type regenerated and re-exported through the existing `@repo/supabase/types` barrel.

## What was actually shipped

| Task | What | Commit |
|------|------|--------|
| 1 | Migration `00003_rbac_v2.sql` — `user_roles.last_assigned_at`, `user_roles.display_name`, table + column comments | `7d21771` |
| 2 | Migration `00004_reference_data.sql` — `country_status` enum, `countries` + `forms` tables, RLS policies, 15-country + 10-form seed | `d0f491d` |
| 3 | Generated `Database` type from Supabase schema; re-exported via types barrel; type-check + lint clean | `dd04650` |

Both migrations were applied to the live Paratus Group Supabase project (`tgswsdfaszvztbpczfve`) via the Management API SQL endpoint and verified.

## Verification (live Supabase)

- `user_roles` columns now include `last_assigned_at` (timestamptz, NULL) and `display_name` (text, NULL).
- Three test users still in correct state: hq → (`hq_admin`, NULL), country-admin → (`country_admin`, MZ), agent → (`agent`, MZ).
- `countries` count = 15; active count = 12; coming-soon count = 3 (LS, MW, ZW).
- `forms` count = 10 (general-contact, carrier-services, satellite, data-centers, broadband, oneweb, starlink, essential-access, connect2care, starlink-for-schools).
- RLS enabled on both reference tables; policies bound to `authenticated` role with `USING (true)` for SELECT only.
- Anon SELECT against `/rest/v1/countries` returns `[]` (RLS denies anon as designed; service_role seeded fine).
- `npm run type-check` and `npm run lint` both green from repo root.

## Issues encountered

**The plan was written against an outdated assumption about Phase 1's state.** Plan task 1 prescribed `ALTER TYPE app_role ADD VALUE 'hq_admin'`, `ADD COLUMN country_code`, and migrating test users — but Phase 1's `00001_rbac_schema.sql` had already shipped all of that:
- `app_role` enum was already `('hq_admin', 'country_admin', 'agent')` from day one (no legacy `admin`/`viewer` to migrate away from)
- `country_code` already existed on `user_roles` as a custom enum with a CHECK constraint forcing `NULL` for hq_admin and `NOT NULL` otherwise
- `custom_access_token_hook` already injects `country_code` into the JWT
- All three test users already at the correct role + country

So task 1 reduced to the two columns Phase 2's later plans actually need: `last_assigned_at` (round-robin fairness, used by `assign_lead()` in plan 02-04) and `display_name` (UI label fallback). Migration is fully idempotent — every statement is `ADD COLUMN IF NOT EXISTS` or guarded by an existence check.

**Migration filename drift.** Plan said `00002_rbac_v2.sql` and `00003_reference_data.sql`. But `00002_allow_auth_admin_read_user_roles.sql` was already shipped in Phase 1 (the JWT-hook fix). Used `00003` and `00004` instead and noted it in the migration headers.

**`countries.code` is `text`, but `user_roles.country_code` is the enum.** Slight type asymmetry. Deliberate: PRD says `leads.country_code text REFERENCES countries(code)`, and adding/removing an enum value requires recreating the type — too rigid for a slowly-growing list of markets. The user_roles enum stays because (a) it's already shipped, (b) the CHECK constraint that enforces "hq_admin has no country" lives on the enum side, and (c) auth-side strictness is more valuable than schema uniformity. Phase 2-02 leads schema will use `text REFERENCES countries(code)`.

**`Database` type generation method.** The plan referenced `mcp__supabase-paratusgroup__generate_typescript_types` but the Supabase MCP wasn't loaded in this session's deferred-tools list. Used the equivalent Management API endpoint (`/v1/projects/{ref}/types/typescript`) instead — same generator, same output. The header comment on `database.ts` documents the regeneration command for next time.

## Next-phase readiness

The next plan (02-02 leads schema) can now do all of:

- `leads.country_code text REFERENCES countries(code)` — FK target exists.
- `leads.form_slug text REFERENCES forms(slug)` — FK target exists.
- `leads.assigned_to uuid REFERENCES user_roles(user_id)` — already valid.
- Round-robin `assign_lead()` function (plan 02-04) can `ORDER BY user_roles.last_assigned_at ASC NULLS FIRST` for fair tie-break.
- Country-scoped views can join `countries` to filter on `status = 'active'`.

JWT contract is unchanged — middleware + `requireRole` / `requireCountry` still work as Phase 1 validated them. No app-side migrations needed.

## Files changed

- Created `packages/supabase/migrations/00003_rbac_v2.sql`
- Created `packages/supabase/migrations/00004_reference_data.sql`
- Created `packages/supabase/src/types/database.ts`
- Updated `packages/supabase/src/types/index.ts` (added `Database` / `Tables` / etc. re-exports)
- Updated `.gitignore` (added `supabase/.temp/` for the CLI scratch dir)

---

*Plan 02-01 closed 2026-05-01. Three commits on `main`. Ready for plan 02-02.*
