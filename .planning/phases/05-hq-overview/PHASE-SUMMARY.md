# Phase 5 — HQ Overview

**Status:** shipped
**Validated:** 2026-05-04
**Tag:** `phase-5-complete` (on origin)

## What shipped

The HQ overview surface is live end-to-end. An HQ admin lands on `/`, sees five live KPI tiles (Total Leads (Group), Countries Active, Conversion Rate, Avg Speed to Lead, Leads Today) with a coloured ring matching each tile's domain, a 12-row Country Performance leaderboard ordered by total_leads desc with status dots driven by speed-to-lead thresholds, an all-time Leads by Service breakdown, and a 7-day Speed to Lead Trend chart. They can click any country in the leaderboard to drill into the country-admin shell. Webhook-ingested leads bump the KPI strip without manual refresh — one `group:all` realtime topic replaces 12 simultaneous per-country subscriptions per HQ tab. The four-link sidebar resolves cleanly: Overview is the live surface; Countries / Service Mix / Settings are placeholder pages explaining what each will become in Phase 6.

## Plans

| Plan | Subsystem | Status | Summary |
|------|-----------|--------|---------|
| 05-01 | Migration 00013 — 3 views + 1 RPC + 1 broadcast trigger + 1 RLS policy + 8 vitest cases | shipped | `05-01-SUMMARY.md` |
| 05-02 | Group DAL + Zod + 4 React components + page composition + 6 vitest cases | shipped | `05-02-SUMMARY.md` |
| 05-03 | Playwright golden path + sidebar stubs + visual checkpoint + close-out | shipped | `05-03-SUMMARY.md` |

## Phase gate (Boil-the-Ocean checklist)

- [x] **Code shipped** — 5 specs Playwright green (3 HQ overview + 2 stub pages), 14 vitest green (8 HQ RPCs + 6 HQ DAL). No TODOs in shipped paths, no mock data on production paths, no `any` shortcuts. All 4 HQ sidebar nav links resolve.
- [x] **Tests green** — `npm run type-check` clean, `npm run lint` clean, `npm run build` succeeds. 3 consecutive flake-free runs of the HQ Playwright suite. The full vitest suite has the documented Phase 6 hermetic-setup carry-over (Supabase auth rate-limit on chained suites); HQ-relevant suites all pass when run in isolation.
- [x] **Docs updated** — STATE.md, ROADMAP.md, all three plan SUMMARYs, this PHASE-SUMMARY, the new migration 00013.
- [x] **Demo** — running on `npm run dev` at `http://localhost:3012/`. Walked side-by-side against `docs/design-reference/hq-dashboard.html`.
- [x] **Security checklist re-run** — `mcp__supabase-paratusgroup__get_advisors --type security` reports zero NEW warnings introduced by Phase 5 (plan 05-03 modified zero DB objects; plan 05-01's `broadcast_lead_to_group` warning is pre-existing carry-over from the same warning class on the agent + country broadcast triggers shipped in Phase 2).
- [x] **Visual fidelity** — checkpoint completed. Six points of divergence between mockup and shipped surface; all six are locked Phase 4 decisions, RESEARCH-resolved questions, or project-scope corrections. Zero genuine drift. Full table in `05-03-SUMMARY.md`.
- [x] **Commit & tag** — `phase-5-complete` to be staged at close-out.
- [x] **No dangling threads** — sidebar links resolve, sales-rep test heading drift was caught + fixed during the full-suite run, realtime broadcast race was caught + fixed via `data-realtime-status` exposure. Phase 6 carry-overs are explicit and captured below.

## Key decisions locked in this phase

- **`group:all` realtime topic + `hq_group_topic` RLS policy.** One trigger replaces 12 simultaneous per-country subscriptions per HQ tab. Existing `hq_country_topic` policy stays — HQ retains the ability to subscribe to a specific country topic when drilling in.
- **`leads_by_service_group` is ALL-TIME** (not today-only per country like the country-admin equivalent). The mockup math has bars summing to "Total Leads (Group)" 8,432, not "Leads Today" 127 — confirms all-time is the right window.
- **`group_speed_to_lead_series` uses UTC day boundaries** (not country tz). Group view spans 12 IANA tz; per-country boundary makes no sense in a single-axis trend. Country-scoped `speed_to_lead_series` keeps country-tz boundaries because it's scoped.
- **`group_speed_to_lead_series` rejects `country_admin`** (`forbidden_role / 42501`). Country admins have their own per-country RPC; the HQ RPC is HQ-only by design.
- **`country_performance_today.avg_response_seconds` is ALL-TIME.** Today-only would be too volatile across small-volume countries.
- **RLS NOT tightened on the new HQ views.** Country admins can technically `SELECT * FROM group_today_stats` and get country-scoped sums (RLS hides their other-country leads). Route layer (`(hq)/layout.tsx requireRole(['hq_admin'])`) is the access boundary, kept symmetrical with how `country_today_stats` works for HQ admin reads.
- **Status-bucket helper lives in `schemas/group.ts`, not `dal/group.ts`.** Pure helper, no `server-only` boundary. Client components import directly from `@repo/supabase/schemas`; the DAL re-exports for ergonomic server-side imports. Plan template originally placed it in `dal/`; moved during execution to fix a `'server-only' cannot be imported from a client component'` build error.
- **Status thresholds:** null → red, < 300s → green, ≤ 480s → amber, > 480s → red. Single source of truth: `RESPONSE_STATUS_THRESHOLDS = { green: 300, amber: 480 }`. Read by leaderboard dots, KPI strip ring, the legend, AND the speed-to-lead trend chart's `<ReferenceLine>` so the 5-min target is never a magic number.
- **5 KPI tiles, mockup verbatim.** Total Leads (Group) / Countries Active / Conversion Rate / Avg Speed to Lead / Leads Today.
- **Country leaderboard drill-in is `<Link href='/<slug>'>`** on the country name. Phase 4 plan 04-03 already wired the country-admin layout to accept `hq_admin`. Phase 5 inherits "for free" but pins the contract via Playwright spec — any future tightening of the country-admin role gate MUST keep `hq_admin` in the allow-list.
- **HQ broadcast SUBSCRIBED-gating via `data-realtime-status`** on the `<KpiStrip>` wrapping div. Mirrors Phase 3's queue-view pattern. E2E tests wait for `SUBSCRIBED` before triggering broadcasts, eliminating the race where the broadcast lands before the client subscribes.
- **Sidebar stubs are placeholders, not full surfaces.** The canonical view of "Countries" today *is* the leaderboard on Overview; building it again would duplicate. Phase 6 will replace the stubs with real surfaces (drill-in directory, group-wide service breakdown over time, group admin settings).
- **Cross-dashboard congruence wins over mockup literalism** (carried from Phase 4 plan 04-04). KPI tile colour treatment, sidebar nav, sidebar footer all defer to the locked patterns from queue-stats / country-admin rather than the mockup specifics.

## Carry-overs into Phase 6

(Plus all carry-overs from Phases 2, 3, 4 still tracked in STATE.md.)

- **Pin `E2E_AUTH_ENABLED=true` into `.env.local.example`** so a fresh `npm run dev` works without an explicit env override.
- **Document `.next/dev` cache restart in the dev-server runbook** — turbopack can hold a stale state across long sessions and need a `rm -rf .next/dev` + restart.
- **Sales-rep `no-answer 3×` flake** — `data-attempts` poll occasionally only reads 2 (not 3) within 8s. Either bump to 12s or instrument the `record_no_answer` RPC's broadcast-emit timing.
- **Conversion Rate delta arrow** — currently omitted from the v1 KPI strip. RESEARCH q4 left the comparator window (week-over-week vs month-over-month) undecided. Phase 6 should pick a window and wire the delta.
- **Sidebar stubs → real surfaces.** `/countries` becomes a drill-in directory of every active country; `/service-mix` becomes a group-wide service breakdown over time; `/settings` becomes a group admin surface (feature flags / SLA targets / country activation toggles).
- **`leads_by_service_group` cap to top-N** — currently returns every form_slug with ≥ 1 lead. Mockup shows ~9 rows. Add a top-N cap if the form catalogue grows.
- **Sortable headers on the country leaderboard** — defaults to `total_leads DESC` from the view layer. v2: client-side sort state.
- **P75 series toggle on the speed-to-lead trend** — data is already in the row shape; UI only plots the median.
- **From 05-01 (still standing):** explicit `REVOKE ALL ... FROM anon, authenticated` on the three `broadcast_lead_to_*` trigger functions; wrap `auth.jwt()` in `(SELECT ...)` for `hq_group_topic` and the other realtime.messages policies (InitPlan caching sweep).
- **From 04-04 (still standing):** stat-tile component consolidation (3 patterns now exist: `MetricCard` full-width top bar, `queue-stats` ring, `kpi-strip` ring). Range-picker UI on country-admin overview.
- **From earlier phases:** Next.js 16 `middleware` → `proxy` rename (deprecation warning at every build); hermetic vitest setup (chained suites hit Supabase auth rate-limit); `createServiceRoleClient` and `createAdminClient` convergence; Phase 1 `user_roles` policies wrapping for InitPlan caching symmetry; offset → cursor pagination on the lead list.

## Next

Phase 6 — Production Hardening. RLS deep-audit, Phase 6 carry-over cleanup, security checklist re-run, pilot-country runbook, performance baselines. Run `/gsd:research-phase 6 → /gsd:plan-phase 6 → /gsd:execute-phase 6`.
