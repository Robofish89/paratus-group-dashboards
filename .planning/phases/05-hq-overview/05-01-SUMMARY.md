---
phase: 05-hq-overview
plan: 01
subsystem: database
tags: [supabase, postgres, rls, security_invoker, realtime-broadcast, hq-rollup, vitest]

# Dependency graph
requires:
  - phase: 02-data-model-ingestion
    provides: leads/lead_events/callbacks tables + *_hq_admin_all RLS bypass
  - phase: 02-data-model-ingestion
    provides: 00006_views.sql country_leaderboard / speed_to_lead_daily / lead_source_mix shape precedent
  - phase: 02-data-model-ingestion
    provides: 00008_realtime_broadcast.sql broadcast_changes pattern + realtime.messages RLS policies
  - phase: 04-country-admin-dashboard
    provides: 00011_country_admin.sql country_today_stats / status_pipeline_today / speed_to_lead_series precedent + JWT user_role + country_code claim convention
provides:
  - Migration 00013_hq_overview.sql applied to tgswsdfaszvztbpczfve
  - View public.group_today_stats (single-row group rollup, security_invoker=true)
  - View public.country_performance_today (per-country leaderboard, security_invoker=true)
  - View public.leads_by_service_group (all-time per form_slug across active countries, security_invoker=true)
  - RPC public.group_speed_to_lead_series(p_days int) (SECURITY DEFINER, hq_admin only, raises forbidden_role 42501)
  - Trigger public.broadcast_lead_to_group + leads_broadcast_group on public.leads
  - RLS policy public.hq_group_topic on realtime.messages (gates 'group:all' subscription to hq_admin)
  - Database types regenerated (packages/supabase/src/types/database.ts)
  - 8 vitest assertions in apps/web/tests/hq.rpcs.test.ts (3 flake-free runs)
affects: [05-02-dal-zod-types, 05-03-ui-shell, 05-hq-overview]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "HQ aggregation via security_invoker + *_hq_admin_all RLS bypass (no JWT-claim reads inside view bodies)"
    - "broadcast-from-database fan-out to single 'group:all' topic for HQ live updates"
    - "Group-only RPC pattern — role guard accepts hq_admin only, country_admin raises forbidden_role"

key-files:
  created:
    - packages/supabase/migrations/00013_hq_overview.sql
    - apps/web/tests/hq.rpcs.test.ts
  modified:
    - packages/supabase/src/types/database.ts

key-decisions:
  - "leads_by_service_group is ALL-TIME (not today-only) — diverges from leads_by_service_today (00011) to match HQ mockup math (bars sum to total-leads tile)"
  - "conversion_rate_alltime in group_today_stats is window-less — matches mockup (no delta v1)"
  - "group_speed_to_lead_series uses UTC day boundaries (not country tz) — group view spans tz, per-country tz makes no sense in a single-axis trend"
  - "group_speed_to_lead_series rejects country_admin with forbidden_role — country admins have their own per-country speed_to_lead_series RPC (00011)"
  - "country_performance_today.avg_response_seconds is all-time (not today-only) — today-only would be too volatile across small-volume countries"
  - "group_today_stats split into two CTEs (country_aggs + leads_aggs) cross-joined — avoids cartesian double-count when summing per-country country_today_stats values alongside per-row leads aggregates"
  - "RLS NOT tightened on group_today_stats / country_performance_today / leads_by_service_group — country admins can technically SELECT these but the route layer (`(hq)/layout.tsx` requireRole(['hq_admin']))` blocks them at the UI"

patterns-established:
  - "Group rollup view: WITH country_aggs AS (sum from per-country views) ⨯ leads_aggs AS (per-row from leads) → CROSS JOIN one-row-each → final SELECT"
  - "HQ-only RPC: SECURITY DEFINER + IF v_jwt_role <> 'hq_admin' THEN forbidden_role (42501)"
  - "group:all broadcast topic + hq_group_topic policy — single fan-out trigger replaces 12 per-country subscriptions"

# Metrics
duration: 17 min
completed: 2026-05-04
---

# Phase 5 Plan 01: HQ Overview Database Layer Summary

**Migration 00013 ships 3 security_invoker views, 1 hq_admin-only RPC, 1 broadcast trigger and 1 RLS policy; 8/8 vitest cases green from cookie-authed anon clients.**

## Performance

- **Duration:** 17 min
- **Started:** 2026-05-04T14:55:13Z
- **Completed:** 2026-05-04T15:12:04Z
- **Tasks:** 2
- **Files modified:** 3 (1 created migration, 1 created test, 1 modified types regen)

## Accomplishments

- **Three new HQ-shaped views** wired into RLS via `security_invoker = true`: `group_today_stats` (single-row KPI rollup), `country_performance_today` (12-row leaderboard, mockup-shape), `leads_by_service_group` (all-time per form_slug). All read leads via the inherited `*_hq_admin_all` policy bypass — zero JWT-claim reads inside view bodies (Phase 5 RESEARCH.md pitfall 1 sidestepped).
- **Group-wide speed-to-lead RPC** (`group_speed_to_lead_series(p_days int DEFAULT 7)`): UTC-day P50/P75 percentiles, hq_admin role-guarded — country_admin gets `forbidden_role / 42501` because they have their own per-country RPC (00011) and have no business reading the group series.
- **HQ realtime topic infrastructure**: `broadcast_lead_to_group` trigger fans every lead INSERT/UPDATE to a single `group:all` topic; `hq_group_topic` RLS policy on `realtime.messages` gates subscription to `user_role = 'hq_admin' AND topic = 'group:all'`. One trigger replaces what would otherwise have been 12 simultaneous per-country subscriptions per HQ tab.
- **Type regen + parity** with the new SQL surface; `npm run type-check` clean across all 4 turbo packages, no regressions to country-admin / sales-rep code paths.
- **Eight vitest cases** asserting RPC role-guards (HQ allow, country deny), RLS-driven view shape (HQ sees 12 rows, country admin sees 12 rows but only own populated — matches `country_today_stats` shape from 04-01), `leads_by_service_group` rollup correctness vs ground-truth `leads ⋈ countries(active)` count, realtime gate (HQ subscribes + receives webhook event in <5s; country_admin subscribes but receives zero events). Three consecutive flake-free runs.

## Task Commits

Each task was committed atomically:

1. **Task 1: Migration 00013 — 3 views + 1 RPC + 1 broadcast trigger + 1 RLS policy** — `d526f0c` (feat)
2. **Task 2: HQ integration tests — RPC guards + RLS shape + realtime** — `e025971` (test)

**Plan metadata:** _to be appended after this SUMMARY commits_ (docs).

## Files Created/Modified

- `packages/supabase/migrations/00013_hq_overview.sql` — 277-line migration with header / 3 views / 1 RPC / 1 trigger function / 1 trigger DDL / 1 RLS policy. Header comment explains JWT claim NULL behaviour for HQ admin (RESEARCH pitfall 1) and the time-zone-vs-UTC asymmetry between per-country views and the group-wide RPC.
- `packages/supabase/src/types/database.ts` — Full overwrite via `mcp__supabase-paratusgroup__generate_typescript_types`. Adds `Views.group_today_stats`, `Views.country_performance_today`, `Views.leads_by_service_group`, `Functions.group_speed_to_lead_series` and updates the 00013 entry in the migration manifest comment block.
- `apps/web/tests/hq.rpcs.test.ts` — 431-line vitest file covering 8 cases. Mirrors `country-admin.rpcs.test.ts` shape (magiclink-cookie auth via `signInAs`, service-role-fenced setup/teardown, RLS-on-the-assertion-path). Realtime cases reuse the queue-promise/next-event helper pattern from `realtime.broadcast.test.ts`.

## Decisions Made

- **`leads_by_service_group` is ALL-TIME (not today-only).** Mockup math has the bars summing to "Total Leads (Group)" 8,432; today-only would break that visual contract. Documented in the SQL COMMENT and in the migration header. Diverges deliberately from `leads_by_service_today` (00011, today-only per country) — HQ is the high-altitude rollup; country view is the daily slice.
- **`conversion_rate_alltime` in `group_today_stats` carries no delta in v1.** Matches mockup label (no window). v2 may add a vs-prior comparator once the period is decided (Phase 5 RESEARCH.md OQ4).
- **`group_speed_to_lead_series` uses UTC day boundaries.** Group view spans 12 IANA tz; per-country tz boundary makes no sense in a single-axis 7-day trend. Per-country `speed_to_lead_series` (00011) keeps country-tz boundaries because it's scoped to one country.
- **`group_speed_to_lead_series` rejects country_admin (`forbidden_role / 42501`).** Country admins have `speed_to_lead_series(country, from, to)` (00011) for their own scope. The HQ RPC isn't a "wider window" of theirs — it's a different surface.
- **`country_performance_today.avg_response_seconds` is ALL-TIME.** Today-only would be too volatile across the smaller-volume countries (Eswatini, Lesotho when activated, etc.). Mockup shows a steady single number per country, not a today-only spike.
- **`group_today_stats` body uses two CTEs cross-joined** (`country_aggs` summing from per-country `country_today_stats`, `leads_aggs` aggregating directly from `leads`). Avoids cartesian double-count: joining `countries ⋈ country_today_stats ⋈ leads` in one shot would multiply the per-country sums by the join cardinality. Splitting keeps each aggregate scope correct, then `CROSS JOIN` glues two single-row results into one.
- **No tightening of RLS on the new views beyond `security_invoker`.** Country admins can technically `SELECT * FROM group_today_stats` and get country-scoped sums (because RLS hides their other-country leads). The route layer (`apps/web/app/(hq)/layout.tsx requireRole(['hq_admin'])`) is where access is denied for non-HQ users. Kept symmetrical with how `country_today_stats` works for HQ — defence happens at the route layer, not duplicated at the SQL layer.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 — Bug] Test 3 (country_performance_today RLS shape) assertion corrected vs plan template**

- **Found during:** Task 2 (test authoring).
- **Issue:** Plan task 2 case 3 spec said "country admin (BW) → `count(*) === 1`, the single row has `country_code === 'BW'`". The actual view body is `FROM public.countries c LEFT JOIN public.leads l ON l.country_code = c.code WHERE c.status = 'active' GROUP BY c.code, c.name` — `public.countries` has no RLS hiding rows from country admins, so a country admin sees all 12 rows. Only the LEFT-JOINed `leads` data is RLS-filtered, leaving non-own rows zero-filled. This is exactly the same shape `country_today_stats` (00011) exposes, and the same shape `country-admin.rpcs.test.ts` test 1 already pins.
- **Fix:** Updated test 3 to assert "MZ admin sees 12 rows, MZ row populated, others zero-filled" — matching the precedent set by 04-01 tests, not the plan's BW=1 spec. Documented in the test inline comment.
- **Files modified:** `apps/web/tests/hq.rpcs.test.ts`
- **Verification:** Test passes 3x in a row.
- **Committed in:** `e025971` (Task 2 commit).

**2. [Rule 1 — Spec correction] Test users substituted MZ for BW**

- **Found during:** Task 2 (test authoring).
- **Issue:** Plan spec mentions creating a "country_admin (Botswana, BW)" test user. Helpers ship `TEST_USERS = { hqAdmin, countryAdminMz, agentMz }` — the project has only an MZ country admin. Plan 04-01's tests already mapped "own country" to MZ and "other country" to BW; this plan inherits that map.
- **Fix:** Use `TEST_USERS.countryAdminMz` for the country-admin role-deny tests. Plan template said "BW", actual test user available is "MZ" — the role-guard logic doesn't depend on which non-HQ country is used.
- **Files modified:** `apps/web/tests/hq.rpcs.test.ts` (header doc-comment explains the substitution).
- **Verification:** Test 6 (`group_speed_to_lead_series` country_admin denied) passes with MZ admin returning `forbidden_role / 42501`.
- **Committed in:** `e025971`.

### Acknowledged advisor warnings (NOT regressions)

Migration 00013 raises three NEW advisor lints, ALL of which are same-class repeats of warnings already accepted in 00008 / 00011 — they replicate the existing pattern, not introduce a new pattern that needs its own remediation:

- `anon_security_definer_function_executable` for `broadcast_lead_to_group()` — same lint pre-existing for `broadcast_lead_to_agent()` and `broadcast_lead_to_country()` (00008). All three are trigger-only functions; the lint flags them because `SECURITY DEFINER` functions land at `/rest/v1/rpc/{name}` by default, but they require trigger-only invocation context. Phase 6 cleanup target: explicit `REVOKE ALL ... FROM anon, authenticated` on all three trigger functions.
- `authenticated_security_definer_function_executable` for `broadcast_lead_to_group()` — same as above (one warning per role per function).
- `authenticated_security_definer_function_executable` for `group_speed_to_lead_series(p_days integer)` — same lint pre-existing for `speed_to_lead_series(text, timestamptz, timestamptz)`, `country_stats_in_range(...)`, `agent_performance_in_range(...)` etc. The function is intentionally `EXECUTE`-granted to `authenticated` because it runs from the cookie-authed HQ session. Defence-in-depth lives inside the function body (`IF v_jwt_role <> 'hq_admin' THEN RAISE forbidden_role`).
- `auth_rls_initplan` for `hq_group_topic` policy on `realtime.messages` — same lint pre-existing for `agent_own_topic`, `country_admin_country_topic`, `hq_country_topic`. Phase 6 cleanup target along with the other realtime.messages policies.

These warnings are **same-pattern as existing accepted ones, not new pattern classes.** Carried forward into Phase 6's "wrap auth.jwt() in (SELECT ...) for InitPlan caching" sweep.

---

**Total deviations:** 2 auto-fixed (1 test assertion correction vs spec, 1 test-user substitution).
**Impact on plan:** Zero scope creep. Both deviations are spec-vs-environment alignment; the plan's intent (verify HQ admin can read, country admin can't) is fully tested.

## Issues Encountered

- **Full vitest suite failures unrelated to this plan.** Running `npm run test --workspace=apps/web` end-to-end produces 36 failures across 6 test files — root causes are (a) Supabase auth rate-limit (`Request rate limit reached` on `verifyOtp` after ~50 sequential `signInAs()` calls in the same run) and (b) test-data drift (e.g. `rls.cross-tenant.test.ts` expecting BW seed leads — DB currently has only MZ leads after Phase 4 teardown). Both are pre-existing infrastructure brittleness, NOT regressions from plan 05-01. The plan-required `npm run test --workspace=apps/web -- hq.rpcs` runs 8/8 green, three flake-free consecutive runs. Phase 6 already tracks "hermetic vitest setup" as a carry-over (STATE.md "Carry-overs explicitly tracked into Phase 6").

## User Setup Required

None — no external service configuration required.

## Next Phase Readiness

**Ready for plan 05-02** (DAL + Zod + UI shell). Carry-forward notes for 05-02:

- **DAL surface to mirror.** `packages/supabase/src/dal/group.ts` should export Zod schemas + 4 query functions:
  - `getGroupTodayStats(): Promise<GroupTodayStats>` — wraps `from('group_today_stats').select('*').single()`
  - `getCountryPerformanceToday(): Promise<CountryPerformanceTodayRow[]>` — array-shaped from the 12-row view
  - `getLeadsByServiceGroup(): Promise<LeadsByServiceGroupRow[]>` — array-shaped, ordered DESC server-side
  - `getGroupSpeedToLeadSeries(days?: number): Promise<GroupSpeedToLeadDay[]>` — `.rpc('group_speed_to_lead_series', { p_days: days ?? 7 })`. The function returns 0..p_days rows; the DAL caller (chart component) is responsible for zero-filling missing days client-side.
- **Zod schemas to lock.**
  - `groupTodayStatsSchema` — 8 fields (active_country_count, total/new/contacted/converted/lost group counts as `z.number()`, conversion_rate_alltime as `z.number().nullable()`, avg_speed_to_lead_seconds_today as `z.number().nullable()`).
  - `countryPerformanceTodayRowSchema` — 7 fields. `total_leads` and `new_today` are bigint-as-string in supabase-js so the schema should `z.coerce.number()` or coerce in the DAL after parse.
  - `leadsByServiceGroupRowSchema` — 2 fields (form_slug, leads_count).
  - `groupSpeedToLeadDaySchema` — 3 fields (day as ISO date string, median_seconds + p75_seconds as `z.number().nullable()`).
- **`computeResponseStatus(seconds)` helper** in `dal/group.ts` per Phase 5 RESEARCH.md pitfall 4 — returns `'green' | 'amber' | 'red'` from thresholds `<5min / 5–8min / >8min`. Called by the leaderboard component AND the legend so they never drift.
- **`useGroupBroadcast(refresh)`** at `packages/supabase/src/realtime/use-group-broadcast.ts` — thin wrapper over `usePrivateBroadcast<unknown>({ topic: 'group:all', event: '*', onMessage: () => refresh() })`. Mirrors `useAgentBroadcast` and `useCountryBroadcast` shape. The migration's RLS policy gates the topic to hq_admin so it's safe to call from any (hq) page.
- **`parseRangeParams` promotion** to `apps/web/app/_lib/date-range.ts` — Phase 5 is the third caller (sales-rep + country-admin + HQ). Plan 04-RESEARCH.md flagged this lift at line 233.
- **bigint-as-string awareness.** supabase-js returns `count(...)::bigint` columns as TS `string` until an explicit cast. Tests demonstrate the pattern (`Number(row.total_leads_group)`); DAL must coerce or schema-`.transform(Number)`.

No blockers.

---
*Phase: 05-hq-overview*
*Completed: 2026-05-04*
