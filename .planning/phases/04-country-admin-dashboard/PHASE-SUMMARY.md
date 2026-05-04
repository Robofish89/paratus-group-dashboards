# Phase 4 — Country Admin Dashboard

**Status:** shipped
**Validated:** 2026-05-04
**Tag:** `phase-4-complete` (staged locally, push pending)

## What shipped

The country admin surface is live end-to-end. A country admin lands on `/[country]`, sees five live KPI tiles (Total Leads, New Today, Contacted, Converted, Avg Response Time), a leads-by-service breakdown, a status-pipeline funnel, a sales-rep performance leaderboard, and a speed-to-lead gauge with a 7-day sparkline. They can navigate to `/[country]/leads`, filter by status / service / date / search, paginate, reassign any lead in their country to another in-country agent, and export a CSV scoped to their country.

## Plans

| Plan | Subsystem | Status | Summary |
|------|-----------|--------|---------|
| 04-01 | Migration 00011 — 4 views + 4 RPCs + integration tests | shipped | `04-01-SUMMARY.md` |
| 04-02 | Overview page — KPIs, funnel, leaderboard, speed-to-lead | shipped | `04-02-SUMMARY.md` |
| 04-03 | Lead list + reassign dialog + reassign + CSV export APIs | shipped | `04-03-SUMMARY.md` |
| 04-04 | E2E golden path + visual checkpoint + RLS fix | shipped | `04-04-SUMMARY.md` |

## Phase gate (Boil-the-Ocean checklist)

- [x] **Code shipped** — 5 specs Playwright green, 31 vitest green (10 RPC + 9 DAL + 11 route + 1 lint helper). No TODOs in shipped paths, no mock data on production paths, no `any` shortcuts.
- [x] **Tests green** — type-check, lint, 31 vitest, 5 Playwright. Three consecutive flake-free Playwright runs.
- [x] **Docs updated** — STATE.md, ROADMAP.md, all four plan SUMMARYs, this PHASE-SUMMARY, the new migrations 00011 + 00012.
- [x] **Demo** — running on `npm run dev` at `http://localhost:3012/[country]`. Walked side-by-side against `docs/design-reference/country-admin-dashboard.html`.
- [x] **Security checklist re-run** — `mcp__supabase-paratusgroup__get_advisors --type security` reports zero new warnings introduced by 00011 or 00012. Pre-existing warnings tracked into Phase 6.
- [x] **Visual fidelity** — checkpoint completed. Two deviations from the mockup logged and resolved (KPI tile pattern, pipeline funnel shape) with cross-dashboard congruence with Phase 3 as the deciding factor.
- [x] **Commit & tag** — `phase-4-complete` to be staged at close-out.
- [x] **No dangling threads** — range-picker UI on overview is the only deferral, logged with a clear path forward; otherwise zero loose ends.

## Key decisions locked in this phase

- **Cross-dashboard congruence over mockup literalism.** When the mockup conflicts with shipped neighbours (Phase 3 queue-stats), neighbours win.
- **Two-source stats split** (live tile from view + range tile from RPC) — the Phase 3 pattern is now also the Phase 4 pattern. HQ overview must inherit it.
- **Pipeline funnel widths are positional, not data-driven.** Counts + share-% inside the segment carry the data; width is a visual cue.
- **`getCountryAgents` requires the new user_roles SELECT policy** under a country-admin seat — migration 00012 ships the policy. Without it, all country-admin UI paths that read user_roles silently degrade to "Unassigned" / "no agents" states.
- **`reassign_lead` defence-in-depth holds.** Three independent gates: middleware → route role-check → SECURITY DEFINER guard inside the RPC (role + country + cross-country target). Even with a misconfigured RLS policy, cross-tenant assignment is blocked at the RPC layer.

## Carry-overs into Phase 6

(All from upstream plan SUMMARYs — Phase 4 added zero new ones beyond visual range-picker.)

- Hermetic vitest setup (today the route-driven tests need `npm run dev` running on port 3012)
- Next.js 16 `middleware` → `proxy` rename (still emitting deprecation warning at every build)
- `createServiceRoleClient` and `createAdminClient` convergence
- Phase 1 `user_roles` policies wrapping for `(SELECT auth.jwt())` InitPlan caching symmetry — relevant now that 00012 has joined the file
- **Range-picker UI on country-admin overview** — overview honours `?range=` URL contract but provides no picker control. URL-only acceptable for v1.
- **Stat-tile component consolidation** — three stat-tile patterns now exist (`MetricCard` in `@repo/ui` with full-width top bar, `queue-stats` with coloured ring, `kpi-strip` now also coloured ring). Phase 6 should consolidate to a single shared component.

## Next

Phase 5 — HQ overview. The 13th surface, group-wide across the active 12 countries, expanding as coming-soon countries activate. Inherits Phase 4's two-source stats split, ring-around-card KPI tile pattern, and `usePrivateBroadcast` topic-naming convention.
