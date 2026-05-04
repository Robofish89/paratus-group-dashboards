# Plan 04-04 Summary

**Status:** shipped
**Date:** 2026-05-04

## What shipped

- **Playwright golden-path E2E** at `apps/web/e2e/country-admin-golden-path.spec.ts` — 5 specs covering:
  1. Overview render (5 KPI tiles, leads-by-service, status pipeline, agent leaderboard, gauge + sparkline)
  2. Range URL contract (`?range=today|week|custom&from=&to=`)
  3. Reassign UI dialog opens + reassign-via-API + audit event written
  4. CSV export (filtered headers, every row scoped to country, `?status=` filter respected)
  5. Cross-tenant defensive (middleware redirect + export-route RLS lockdown)
- **Visual checkpoint walked** by user against `docs/design-reference/country-admin-dashboard.html`. Two deviations surfaced and fixed:
  - KPI strip accent line was too short — refactored to coloured ring around whole card matching tile's domain colour. Mirrors Phase 3's queue-stats pattern (cross-dashboard congruence).
  - Status pipeline funnel was inconsistent when downstream segments were zero (segments collapsed to 25% min width and looked stacked). Replaced with fixed positional widths `100/88/76/64/52` so it always reads as a funnel; count + share-% inside each segment carry the data.
- **Migration 00012** — `user_roles` country-admin SELECT policy. Phase 1 only allowed HQ admins to read all rows + users to read their own row; under a country admin's seat, `getCountryAgents()` returned empty and the reassign dropdown / lead-list "Assigned To" cell broke. New policy is country-scoped read; writes remain HQ-only.

## Key decisions

- **Cross-dashboard congruence over mockup literalism.** The mockup specifies a small inset accent stripe at top of each KPI tile. Phase 3's queue-stats already shipped a different pattern (coloured ring around card). Phase 4 had used the mockup pattern; user flagged inconsistency during the visual checkpoint. Ruled in favour of Phase 3's pattern — Phase 4 KPI strip refactored to match. The mockup is a visual reference, not a binding contract when shipped neighbours diverge.
- **Pipeline width = funnel position, not data magnitude.** Counts inside each segment communicate the data; the funnel shape is a positional cue. This survives sparse data (zero downstream counts) and matches the mockup's hardcoded shape pattern.
- **Migration 00012 was authorised by user during checkpoint.** RLS migrations against shared infra require explicit OK; user said "B. Apply the fix if you need to." Migration applied, advisors checked (no new warnings), E2E assertion flipped from broken-state to working-state.
- **5th KPI tile remains "Avg Response Time"** (not "Lost" as the original plan said) — user approved as-is during checkpoint walk.
- **Range-picker UI on overview deferred** — overview honours `?range=` URL contract but provides no picker control. URL-only is acceptable for v1; if added later, reuse `<DateRangePicker />` from `(sales-rep)/_components/`.

## Test results

- 5/5 Playwright specs green, 3 consecutive flake-free runs
- 31/31 vitest country-admin tests still green after RLS migration + visual refactor (DAL + RPC + routes — no regressions)
- type-check + lint clean

## Carry-overs

- **Range-picker UI on country-admin overview** (deferred from this plan). Reuse `<DateRangePicker />` and `parseRangeParams` helper. Drop in next minor polish pass or roll into Phase 5 if HQ overview shares the pattern.
- **Cross-dashboard MetricCard consolidation** — Phase 3 ships a `MetricCard` in `@repo/ui` with a different visual treatment (full-width top bar) than the inline tiles in queue-stats and country-admin's KPI strip. Three different stat-tile patterns now exist. Roll up into a single shared component during Phase 6 cleanup.
- **HQ overview (Phase 5) must inherit Phase 4's KPI tile pattern** — coloured ring around card matching domain colour. Already locked in queue-stats, now in country-admin KPI strip; HQ should be the third surface using it.
