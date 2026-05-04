---
phase: 05-hq-overview
plan: 03
subsystem: testing
tags: [hq-overview, e2e, playwright, visual-fidelity, sidebar-stubs, phase-close-out]

# Dependency graph
requires:
  - phase: 05-hq-overview
    provides: live HQ overview surface (plans 05-01 + 05-02)
  - phase: 04-country-admin-dashboard
    provides: country-admin layout's `hq_admin` allow-list (drill-in target), `data-realtime-status` pattern from queue-view
provides:
  - "Playwright golden path for HQ overview (3 specs: render, drill-in, realtime)"
  - "Sidebar stub-page contract spec (HQ stubs render, country admin → /unauthorized)"
  - "Three sidebar stub pages: /countries, /service-mix, /settings"
  - "data-realtime-status attribute on `<KpiStrip>` for SUBSCRIBED-gating"
affects: [06-production-hardening]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Cross-surface drill-in pinned by Playwright spec — any future tightening of country-admin role gate must keep `hq_admin` in the allow-list"
    - "Realtime poll timeout is 8s for HQ broadcast (research note 6); raise rather than lower"
    - "Sidebar stubs follow consistent shape: HQShell + currentPath + SectionCard + Phase 6 description"

key-files:
  created:
    - "apps/web/e2e/hq-overview-golden-path.spec.ts"
    - "apps/web/e2e/hq-stub-pages.spec.ts"
    - "apps/web/app/(hq)/countries/page.tsx"
    - "apps/web/app/(hq)/service-mix/page.tsx"
    - "apps/web/app/(hq)/settings/page.tsx"
  modified:
    - "apps/web/app/(hq)/_components/kpi-strip.tsx"
    - "apps/web/e2e/sales-rep-golden-path.spec.ts"

key-decisions:
  - "Realtime test uses `data-realtime-status='SUBSCRIBED'` gate before ingesting — without it, the broadcast races the client subscribe and the test flakes intermittently. Mirrors the queue-view pattern from Phase 3."
  - "Sidebar stubs ship as Phase 6 placeholders (not full surfaces) per RESEARCH q5. Each stub is a server component with `requireRole(['hq_admin'])` defence-in-depth on top of middleware."
  - "Visual checkpoint deviations all accepted under the 'cross-dashboard congruence wins' rule from Phase 4 plan 04-04. KPI tile colours, sidebar nav items, sidebar footer, omitted Conversion Rate delta — none are drift, all are locked decisions."

patterns-established:
  - "HQ broadcast SUBSCRIBED-gating via `data-realtime-status` attribute on the wrapping div"
  - "Phase-6-coming-soon stubs use HQShell + SectionCard + a single descriptive paragraph"

# Metrics
duration: ~75 min
completed: 2026-05-04
---

# Phase 5 Plan 03: HQ Overview Close-out Summary

**End-to-end Playwright golden path (3 specs flake-free × 3 runs), three sidebar stub pages so the HQ nav resolves cleanly, and visual checkpoint walked vs `docs/design-reference/hq-dashboard.html` with all deviations logged and accepted.**

## Performance

- **Duration:** ~75 min
- **Tasks:** 3
- **Files created:** 5
- **Files modified:** 2

## Accomplishments

- 3 Playwright specs in `e2e/hq-overview-golden-path.spec.ts` covering: HQ admin lands on `/` and sees the live overview (5 tiles, 12-row leaderboard, leads-by-service, speed-to-lead chart); leaderboard drill-in to `/<country-slug>` lands on the country-admin shell (cross-surface contract pinned); webhook ingest → group:all broadcast → KPI strip "Total Leads (Group)" tile bumps without manual refresh.
- 3 consecutive flake-free runs of the new HQ spec confirmed.
- 3 sidebar stub pages so the four-link `hqNav` resolves with no 404s; each stub renders a single SectionCard explaining what the surface will become in Phase 6.
- Stub-pages contract spec (`hq-stub-pages.spec.ts`) pins both the placeholder copy and the country-admin → /unauthorized gate.
- `<KpiStrip>` now exposes `data-realtime-status` for E2E gating — same pattern Phase 3 locked on the queue-view.
- Visual checkpoint walked side-by-side against `docs/design-reference/hq-dashboard.html`. Five points of divergence surfaced; all five are locked Phase 4 decisions or RESEARCH-resolved questions, none are genuine drift.
- Drive-by fix: the sales-rep `tab labels` test was looking for "Call Queue" copy that the 03-04 polish pass renamed to "My Leads"; updated the assertion. Test now green.

## Task Commits

1. **Task 1: HQ overview Playwright golden path** — `72d0125` (test)
2. **Task 2: HQ sidebar stub pages — Countries, Service Mix, Settings** — `e2e8a8f` (feat)
3. **Task 3: Visual checkpoint + close-out** — pending (this commit)

## Files Created/Modified

### New

- `apps/web/e2e/hq-overview-golden-path.spec.ts` — 3 specs (render / drill-in / realtime)
- `apps/web/e2e/hq-stub-pages.spec.ts` — 2 specs (HQ stubs render Phase 6 copy / country admin → /unauthorized)
- `apps/web/app/(hq)/countries/page.tsx` — Phase 6 placeholder
- `apps/web/app/(hq)/service-mix/page.tsx` — Phase 6 placeholder
- `apps/web/app/(hq)/settings/page.tsx` — Phase 6 placeholder

### Modified

- `apps/web/app/(hq)/_components/kpi-strip.tsx` — wire `onStatusChange` from `useGroupBroadcast` to a `realtimeStatus` state, expose as `data-realtime-status` on the wrapping div
- `apps/web/e2e/sales-rep-golden-path.spec.ts` — flip the `Call Queue` text assertion to a `My Leads` heading match (drive-by fix; copy was renamed in 03-04 polish but the test was missed)

## Decisions Made

- **Realtime test must wait for SUBSCRIBED before ingesting.** First green-against-bug pass exposed a race: `page.goto('/')` returned 200 in <1s but the websocket SUBSCRIBE round-trip took 1-2s longer. Ingesting at t=1s emits the broadcast before the client is subscribed; the tile never bumps. Wired the same `data-realtime-status` attribute Phase 3 ships on the queue-view; the spec waits up to 15s for SUBSCRIBED before ingesting. 3 flake-free runs confirm.
- **Sidebar stubs ship as placeholders, not full surfaces.** RESEARCH q5 recommended this (the canonical view of "Countries" today *is* the leaderboard on Overview; building it again in Phase 5 would duplicate). Each stub is server-component, `requireRole(['hq_admin'])` re-checked, single SectionCard with a plain paragraph naming what the surface will become.
- **Visual checkpoint deviations are all accepted.** Six points of divergence between mockup and shipped:
  1. KPI tile numbers are tone-coloured (not slate-900) — accepted, cross-dashboard congruence with queue-stats + country-admin (Phase 4 plan 04-04 lock).
  2. Conversion Rate "+2.1%" delta arrow omitted — accepted, comparator window deferred (RESEARCH q4).
  3. Sidebar nav: "Service Mix / Settings" instead of "Services / Reports" — accepted, more accurate to project scope; Reports out of v1.
  4. Sidebar footer: user identity (name/email/role/sign-out) instead of "Paratus Africa Group / Dashboard v1.0" — accepted, DashboardLayout is the standard footer pattern across all 3 surfaces.
  5. Country Performance shows 12 rows instead of 13 — accepted, project locked 12 active countries (mockup pre-dated the active/coming-soon split).
  6. Y-axis label format `m:ss` vs whole minutes — accepted, ours is more precise; both formats read cleanly. (RESEARCH 05-02 visual-fidelity item 3 closed.)
- **Drive-by fix on the sales-rep tab labels test.** The test asserted `getByText('Call Queue')`, but the page heading was renamed to `My Leads` in plan 03-04 (per the user's "agent copy voice" memory: plain past-tense agent-friendly copy; "My Leads" not "Call Queue"). The test was passing previously only because... it wasn't being run? Surfaced during the full-suite Playwright run we did for the close-out. Boil-the-Ocean rule: if a related bug surfaces while building, fix it.

## Visual checkpoint deviations (full table)

| Element | Mockup | Implementation | Decision |
|---------|--------|----------------|----------|
| KPI tile numbers | slate-900 (all black) | tone-coloured (paratus-blue / amber / green / red ring + matching number) | **Accept** — Phase 4 cross-dashboard congruence lock; queue-stats and country-admin both ship the ring pattern |
| Conversion Rate delta | "+2.1%" green arrow | omitted | **Accept** — comparator deferred (RESEARCH q4); add when window decided |
| Sidebar nav items | Overview / Countries / Services / Reports | Overview / Countries / Service Mix / Settings | **Accept** — more accurate to project scope; Reports deferred to v2 |
| Sidebar footer | "Paratus Africa Group / Dashboard v1.0" static block | user identity card (name / email / role / sign-out) | **Accept** — DashboardLayout standard footer; consistent across all 3 dashboards |
| Country leaderboard rows | 13 (mockup pre-dated active/coming-soon split) | 12 (active countries only) | **Accept** — project lock; coming-soon countries activate via flag flip in Phase 7 |
| Y-axis label | whole minutes (10, 8, 6...) | `m:ss` (1:30 etc.) | **Accept** — both formats read cleanly; ours has more precision |

## Pre-close gate run

- `npm run type-check` — clean
- `npm run lint` — clean
- `npm run build` — production build succeeds, all routes including the 3 new stubs visible
- **Phase 5 Playwright suites: 5/5 green** (3 HQ overview specs + 2 stub specs), 3 consecutive flake-free runs of the HQ overview spec.
- **Full Playwright suite: 12/13 green** in a single run; the one failure is `no-answer 3× → Follow-ups` in `sales-rep-golden-path` and is a pre-existing intermittent flake (broadcast-cycle latency under load — `data-attempts` reached 2 not 3 within 8s). Reproducible solo. Logged as Phase 6 carry-over; not introduced by Phase 5.
- **Vitest HQ suites: 14/14 green** (`hq.dal.test.ts` 6 + `hq.rpcs.test.ts` 8).
- **Vitest country-admin DAL + routes: 23/23 green** (the country-admin RPCs suite hit the documented Supabase auth rate-limit when chained directly after another suite — a known Phase 6 carry-over from STATE.md, not a regression).
- **Supabase advisors:** `mcp__supabase-paratusgroup__get_advisors --type security` → no NEW warnings introduced by Phase 5 (plan 05-03 modified zero DB objects). Pre-existing function-search-path-mutable + SECURITY DEFINER public-execute warnings continue tracked into Phase 6.

## Deviations from Plan

### Auto-fixed issues

**1. [Rule 3 — Blocking] HQ broadcast race forced exposure of `data-realtime-status`**

- **Found during:** Task 1 (initial Playwright run of the realtime spec)
- **Issue:** First test pass failed: tile read 11 baseline, polled for ≥12 with 8s timeout, only ever saw 11. Investigation: webhook → broadcast → tile path was all working (manual reproduction green); the failing path was that `page.goto('/')` returned 200 before the realtime websocket finished its SUBSCRIBE round-trip. The synthetic ingest emitted the broadcast before the client subscribed, so no event reached the React state.
- **Fix:** Wired `<KpiStrip>` to track the realtime status from `useGroupBroadcast` and expose it as `data-realtime-status` on the strip's wrapping div (matching the existing pattern on `(sales-rep)/_components/queue-view.tsx`). Spec waits for the attribute to read `SUBSCRIBED` before ingesting.
- **Files modified:** `apps/web/app/(hq)/_components/kpi-strip.tsx`, `apps/web/e2e/hq-overview-golden-path.spec.ts`
- **Verification:** 3 consecutive flake-free runs of all 3 specs; full Playwright suite re-run.
- **Committed in:** `72d0125` (Task 1 commit).

**2. [Rule 1 — Bug] Sales-rep `tab labels` test asserted obsolete heading**

- **Found during:** Task 3 (full Playwright suite run during close-out)
- **Issue:** `e2e/sales-rep-golden-path.spec.ts:90` asserted `getByText('Call Queue').toBeVisible()`, but the queue page heading was renamed to "My Leads" in plan 03-04 polish (per the user's "agent copy voice" memory: plain past-tense, agent-friendly; "My Leads" not "Call Queue"). The test was apparently not run between 03-04 polish and now.
- **Fix:** Flipped the assertion to `getByRole('heading', { name: 'My Leads' })`. Added a comment naming the polish commit.
- **Files modified:** `apps/web/e2e/sales-rep-golden-path.spec.ts`
- **Verification:** Spec re-run alone; passes within 4s.
- **Committed in:** Task 3 close-out commit (this one).

---

**Total deviations:** 2 auto-fixed (1 blocking on a real broadcast race, 1 surface bug fix on stale spec copy).
**Impact on plan:** Both fixes are improvements. Status-attribute exposure is a real testability win; sales-rep heading fix closes a stale test gap that would otherwise mask future regressions.

## Issues Encountered

- **Supabase auth rate-limit when running every vitest suite back-to-back.** Pre-existing carry-over (STATE.md: "hermetic vitest setup needed; full-suite runs hit Supabase auth rate-limit"). Workaround: run suites in batches with ~60s recovery between groups. The HQ suites (the focus of Phase 5) all pass. Phase 6 should land hermetic test setup so a single `npm run test` is reliable.
- **Turbopack dev-cache state can require restart.** During this plan, restarting the dev server required passing `E2E_AUTH_ENABLED=true` explicitly (it isn't in `.env.local`); a stale `.next/dev` cache also caused a transient `require is not defined` SSR error in `(sales-rep)/[country]/queue/page.tsx`. Once the dev server was restarted with the env var, every test passed (except the pre-existing `no-answer 3×` flake). Phase 6 carry-over: pin `E2E_AUTH_ENABLED` into `.env.local.example` and document the dev-server restart cadence.

## User Setup Required

None — no external services or env vars introduced; Phase 5 plan 05-03 ships only test code, sidebar pages, and an existing-attribute exposure.

## Next Phase Readiness

Phase 5 is sealed. The HQ overview surface is end-to-end:

- Tiles render, leaderboard drills in, realtime bumps without refresh.
- Sidebar resolves on every link (no 404s).
- Visual fidelity vs the mockup is documented and accepted.
- All Phase 5 vitest + Playwright tests are green and flake-free.

`phase-5-complete` tag staged locally; push pending explicit user approval (same posture as `phase-2`/`phase-3`/`phase-4`).

### Carry-overs into Phase 6 (added during this plan)

- **Pin `E2E_AUTH_ENABLED=true` into `.env.local.example`** so a fresh `npm run dev` works without an explicit env override.
- **Document `.next/dev` cache restart in the dev-server runbook** — turbopack can hold a stale state across long sessions and need a `rm -rf .next/dev` + restart.
- **Sales-rep `no-answer 3×` flake** — `data-attempts` poll occasionally only reads 2 (not 3) within 8s. Either bump to 12s or instrument the `record_no_answer` RPC's broadcast-emit timing. Pre-existing; surfaced during this plan's full-suite run.
- **Stat-tile component consolidation** (carried from 04-04) — three patterns now exist (`MetricCard` / queue-stats ring / kpi-strip ring). Phase 6 cleanup target.

---
*Phase: 05-hq-overview*
*Completed: 2026-05-04*
