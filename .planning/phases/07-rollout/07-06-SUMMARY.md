# Plan 07-06 — Supabase Advisor Sweep — SUMMARY

**Status:** shipped 2026-05-06
**Migration:** `00019_advisor_sweep` applied to project `tgswsdfaszvztbpczfve` via MCP `apply_migration`

## What landed

```
packages/supabase/migrations/
└── 00019_advisor_sweep.sql        NEW — promoted from .planning/phases/07-rollout/07-06-DRAFT-MIGRATION.sql
```

### Tier 1 fixes (in migration)

1. **`function_search_path_mutable`** × 3 closed:
   - `public.handle_updated_at` → `SET search_path = ''` (no schema-qualified references in body)
   - `public.custom_access_token_hook` → `SET search_path = 'public', 'pg_temp'` (references `public.user_roles` + enums)
   - `public.set_lead_event_country_code` → `SET search_path = 'public', 'pg_temp'` (references `public.leads`)

2. **`unindexed_foreign_keys`** × 2 closed:
   - `audit_log_actor_id_idx` — partial B-tree `WHERE actor_id IS NOT NULL` (system-driven events have null actor_id; partial keeps the index slim)
   - `callbacks_lead_id_idx` — full B-tree (always populated)

### Verification (post-migration)

| Check | Expected | Observed |
|-------|----------|----------|
| `pg_proc.proconfig` for `handle_updated_at` | `["search_path=\"\""]` | ✓ |
| `pg_proc.proconfig` for `custom_access_token_hook` | `["search_path=public, pg_temp"]` | ✓ |
| `pg_proc.proconfig` for `set_lead_event_country_code` | `["search_path=public, pg_temp"]` | ✓ |
| `pg_indexes` shows `audit_log_actor_id_idx` | present | ✓ |
| `pg_indexes` shows `callbacks_lead_id_idx` | present | ✓ |
| `get_advisors(security)` `function_search_path_mutable` count | 0 | 0 ✓ |
| `supabase_migrations.schema_migrations` row | `00019_advisor_sweep` | ✓ |

### Remaining advisor surface (post-migration)

**Security:**
- `authenticated_security_definer_function_executable` × 11 — **accepted by design** (Phase 2-5 architectural pattern; internal role/country guards exercised in cross-tenant vitest). Documented inline in the migration file.
- `auth_leaked_password_protection` × 1 — **dashboard toggle**, not a migration. Captured as `user_setup` in `07-06-PLAN.md`. Single click in Supabase Dashboard → Auth → Password security.

**Performance (deferred):**
- `multiple_permissive_policies` × 14 — Tier 2 work, deferred to its own plan with cross-tenant test gate (high blast radius if mis-edited).
- `unused_index` × 5 — defer 90 days, re-evaluate at steady-state load.
- `auth_rls_initplan` × 19 — verified stale advisor cache; every flagged policy already uses `(SELECT auth.x())` form. Will clear on next lint pass.

## Decisions made

### Why apply Tier 1 separately from Tier 2

Tier 1 (search_path locks + missing FK indexes) has zero RLS surface — pure plpgsql function settings + B-tree creates. Tier 2 (multiple permissive policies consolidation) collapses 3-4 per-role policies into one OR'd policy per (table, action). A single misplaced parenthesis in that consolidation = a real cross-tenant leak. Shipping them in the same migration would have coupled a low-risk security fix to a high-risk RLS rewrite — separable, so separated.

### `search_path = ''` vs `'public', 'pg_temp'`

The advisor's strongest recommendation is empty search_path. Used for `handle_updated_at` because its body only touches `NEW` (no schema-qualified references). The other two functions reference `public.user_roles` and `public.leads`; making them rely on empty search_path would force schema-qualification on every type / enum reference too — workable but uglier. `'public', 'pg_temp'` is the conventional balance: explicit `public` for app objects, `pg_temp` for the inert defence-in-depth, no implicit search of the caller's path.

### Partial index for `audit_log_actor_id_idx`

Audit rows from system actors (SLA breach cron, eventually any cron-driven write) have `actor_id IS NULL`. A full B-tree would index every NULL row, bloating the index for no lookup gain. `WHERE actor_id IS NOT NULL` keeps the index aligned with how it'll actually be queried (cascading deletes on `auth.users` only walk non-null rows).

## Carry-overs

### Tier 2 — multiple permissive policies (14 instances)

Defer to a future plan. Required:
- Re-run cross-tenant integration test suite (`apps/web/tests/rls.cross-tenant.test.ts` if present, otherwise the manual verification path from plan 02-06) **before** consolidation.
- Apply consolidation migration.
- Re-run cross-tenant suite **after** consolidation.
- Smoke-test all three role golden paths.
- If any cross-tenant test fails post-consolidation, revert immediately.

### Tier 5 — unused indexes (5 instances)

Defer 90 days. Re-pull `get_advisors(performance)` after the production rollout has accumulated ≥30 d of real load; drop only if still flagged.

### `auth_leaked_password_protection` dashboard toggle

Captured as 07-06 `user_setup`. Single toggle in Supabase Dashboard → Authentication → Settings → Password security → Enable "Prevent the use of leaked passwords". No migration; one-click; immediate effect on future password creates/updates.

## Boil-the-Ocean checks

- [x] Migration drafted in `.planning/`, reviewed, promoted, applied, verified
- [x] Advisor surface re-pulled — Tier 1 entries (3 + 2 = 5) all gone
- [x] No regression: function bodies unchanged; only the `SET search_path` parameter added; existing call sites and trigger semantics intact
- [x] Decisions tier (2-5) documented inline so a future auditor sees why each lint was accepted vs. fixed
- [x] Migration recorded in `supabase_migrations.schema_migrations`; `migrations/` dir in lockstep with prod
