---
phase: 04-country-admin-dashboard
plan: 02
status: shipped
shipped_at: 2026-05-04
subsystem: ui/country-admin-overview + dal
tags: [recharts, dal, zod, types-regen, server-components, broadcast, vitest]

# Dependency graph
requires:
  - phase: 04-country-admin-dashboard
    plan: 01
    provides: migration 00011 — 4 views + 4 RPCs + cross-country defence-in-depth
  - phase: 03-sales-rep-queue
    plan: 02
    provides: usePrivateBroadcast<T> generic hook with `config: { private: true }` baked in
  - phase: 03-sales-rep-queue
    plan: 04
    provides: parseRangeParams + DateRangePicker + two-source stats split (live tile + range RPC)
provides:
  - country-admin-overview-route (`/[country]`)
  - country-admin-dal (8 reads + 1 write)
  - country-zod-schemas
  - database-types-regen-against-00011
  - kpi-strip + leads-by-service + status-pipeline + agent-performance + speed-to-lead components
  - useCountryBroadcast typed hook (topic `country:<code>`)
affects:
  - 04-country-admin-dashboard (plan 04-03 — lead list page, reassign dialog, write APIs)
  - 04-country-admin-dashboard (plan 04-04 — visual checkpoint)
  - 05-hq-overview (the 12-card country grid will reuse `country_today_stats` + `country_speed_to_lead_today` directly)
---

# 04-02 — Country Admin DAL + Overview UI

## What shipped

### Foundation (commit `4364ba9`)

**Recharts** pinned to `^3.8.1` in `apps/web/package.json` (matches the AMA companion repo). Recharts ships its own types — no `@types/recharts` install. Lockfile updated.

**`Database` type regenerated** from migration 00011 via `mcp__supabase-paratusgroup__generate_typescript_types`. Source-of-truth file `packages/supabase/src/types/database.ts` now has first-class entries for:

- Views: `country_today_stats`, `leads_by_service_today`, `status_pipeline_today`, `country_speed_to_lead_today`
- RPCs: `country_stats_in_range`, `agent_performance_in_range`, `speed_to_lead_series`, `reassign_lead`

No `as never` casts in the country DAL — same close-out pattern plan 03-01 used for migration 00009.

**Zod schemas** at `packages/supabase/src/schemas/country.ts` (re-exported from `schemas/index.ts`):

- `countryCodeSchema` — `^[A-Z]{2}$`. URL slugs are lower-case; the schema is the upper-case contract the RPCs expect.
- `countryStatsInRangeInput` — adds `to > from` refinement (caller can't slip an inverted range past Zod into the RPC).
- `countryStatsInRangeOutput` — converted/lost/contacted/new counts.
- `agentPerformanceRow` — full LEFT-JOIN-from-anchor row shape (every active agent gets a row, even with zero work).
- `speedToLeadDay` — day + median + p75. (P50 for the chart, AVG for the headline tile — asymmetry inherited from plan 04-01.)
- `reassignLeadInput` — `lead_id` + `to_agent_id`.

**DAL** at `packages/supabase/src/dal/country.ts` (`server-only`, cookie-authed client; RLS in force, never service-role):

- `getCountryTodayStats(country)` — single-row pluck for the KPI tiles.
- `getCountryStatsInRange(country, from, to)` — range-aware Converted/Lost/etc tile (two-source-stats split — live tile + range RPC).
- `getLeadsByServiceToday(country)` — DESC-ordered.
- `getStatusPipelineToday(country)` — view's GROUP BY drops zero-count statuses; doc spells out that callers MUST default missing statuses to 0 (enforced in `<StatusPipelineCard>`).
- `getCountrySpeedToLeadToday(country)` — gauge tile single-row.
- `getAgentPerformanceInRange(country, from, to)` — leaderboard.
- `getSpeedToLeadSeries(country, from, to)` — sparkline.
- `getCountryAgents(country)` — reassign-dialog dropdown source (queued for 04-03).
- `reassignLead(input)` — write RPC, maps `42501 → ForbiddenError`, `P0002 → NotFoundError` (typed errors so route handlers branch without string-matching).

Re-exported from `dal/index.ts`.

### Overview UI (commit `be72bc1`)

**Server Component** `apps/web/app/(country-admin)/[country]/page.tsx` reads `[country]` slug + `?range=` query, calls `requireRole(['country_admin', 'hq_admin'])` + `requireCountry(country, claims)`, then `Promise.all`s every dashboard read in parallel and hands props down. Wrapped in the existing `<CountryAdminShell>` which provides the sidebar / topbar / user menu chrome.

Seven client components under `apps/web/app/(country-admin)/[country]/_components/`:

| File | Role | Notes |
|---|---|---|
| `kpi-strip.tsx` | 5 KPI tiles + delta + Live pill | Subscribes to `useCountryBroadcast`; optimistically `+1`s `total_leads` and `new_today` on each broadcast event. `router.refresh()` resyncs the authoritative server view. |
| `leads-by-service-card.tsx` | Horizontal bar chart | Composes `<HorizontalBarChart>` from `@repo/ui`. Maps form_slug → human label, caps at 8. |
| `status-pipeline-card.tsx` | 5-segment funnel | Composes `<StatusPipeline>` from `@repo/ui`. Defaults missing statuses to 0 (enforces the GROUP-BY-drops-zero contract from the DAL). Includes `qualified` segment for analytics back-compat per plan 04-01. |
| `agent-performance-table.tsx` | Leaderboard | Composes `<Table>` from `@repo/ui`. Sorted by `leads_converted DESC`. Avg response colour-coded vs the 5-min target. |
| `speed-to-lead-card.tsx` | Gauge ring + sparkline + stats | Custom 160×160 SVG ring (no library); renders `<SpeedToLeadChart>` underneath; "Avg Response" / "Target 5m" stat lines. |
| `speed-to-lead-chart.tsx` | Recharts AreaChart | `h-12` wrapper (research pitfall 2 — collapsed `ResponsiveContainer`). `isAnimationActive={false}` (pitfall 1 — SSR hydration jitter). `<ReferenceLine y={300} />` marks the 5-minute target threshold (DB stores seconds). |
| `use-country-broadcast.tsx` | Typed broadcast wrapper | `usePrivateBroadcast<LeadRow>` with `topic: country:<code>`, `event: '*'` (matches the webhook `UPDATE` path — same reasoning as plan 03-02). |

### Tests (commit `2189d93`)

**`apps/web/tests/country-admin.dal.test.ts`** — 9 vitest cases, all green (run in 14.9s). Mirrors the plan 04-01 magiclink-cookie technique: service-role for fixture seed/teardown, anon-key client carrying real user JWTs for assertions so RLS + RPC inside-function guards are the thing under test, never bypassed.

| # | Case | Surface verified |
|---|---|---|
| 1 | own-country row + `total_leads >= seeded` | `country_today_stats` view + DAL projection |
| 2 | DESC order by leads_count | `leads_by_service_today` + `.order(...)` chain |
| 3 | one row per non-zero status, all valid enum values | `status_pipeline_today` GROUP-BY-drops-zero contract |
| 4 | `total_contacted` excludes NULL `first_contacted_at` | NULL-policy from plan 04-01 holds end-to-end |
| 5 | `agent_performance_in_range` row shape (Zod-parseable) | RPC return shape + `AgentPerformanceRow` schema |
| 6 | series non-empty + median honours seeded latency | `speed_to_lead_series` RPC + NULL filter |
| 7 | reassign happy path — `assigned_to` updated, `lead_events` row landed | `reassign_lead` RPC + audit trail |
| 8 | sales rep call → Postgres `42501` | DAL → `ForbiddenError` mapping wire format |
| 9 | random UUID → Postgres `P0002` | DAL → `NotFoundError` mapping wire format |

## Test counts

| Surface | Cases |
|---|---|
| Country DAL views (today stats, leads-by-service, status pipeline, speed-to-lead today) | 4 |
| Country DAL RPCs (agent performance, speed-to-lead series) | 2 |
| `reassign_lead` (happy + role guard + not_found) | 3 |
| **Total** | **9** |

Plan called for 9; shipped 9.

## Key decisions

- **Recharts `^3.8.1` pinned to AMA companion repo.** Workspace-only install (`apps/web`), not the monorepo root — we don't pollute `packages/ui` since only the `<SpeedToLeadChart>` consumer needs it. `@types/recharts` deliberately not installed (Recharts ships its own types; the legacy types package is years out of date).

- **Broadcast topic `country:<code>` listening on `event:'*'`.** Matches Phase 3 plan 03-02's locked pattern — the webhook path emits `UPDATE` (when `assign_lead` flips `assigned_to` from `NULL` to `agent_id`) rather than `INSERT`, and filtering to a single op would silently miss the production code path. The country-scope realtime broadcast triggers from `00008_realtime_broadcast.sql` already exist; no new DB work needed.

- **Two-source stats split is now also the country-admin pattern.** `KpiStrip` reads `country_today_stats` for live tiles + delta (server-authoritative; broadcast hook bumps optimistically) AND `country_stats_in_range` for the range-aware Converted tile. Same shape Phase 3 locked for the agent queue. `router.refresh()` resyncs the server view on every successful write later in 04-03.

- **Custom 160×160 SVG gauge, no library.** The mockup's gauge is ~12 lines of `<circle stroke-dasharray>` math — any library is heavier than the actual implementation. Recharts only enters the picture for the AreaChart sparkline, which IS load-bearing (gradient fill, `<ReferenceLine y={300} />`, smooth curve on monotone interpolation).

- **`<ReferenceLine y={300} />`, not `y=5`.** The DB stores `extract(epoch from ...)` — seconds, not minutes. 300 seconds = the 5-minute target. This is the third project that's hit this conversion; the rule lives in the speed-to-lead chart file.

- **GROUP-BY-drops-zero contract enforced at the component, not the view.** `getStatusPipelineToday` returns rows for non-zero statuses only (the SQL `GROUP BY status` does this); `<StatusPipelineCard>` defaults missing statuses to 0 so the funnel always renders five segments. Test case 3 pins the contract; the DAL doc-comment was refined in this plan to spell it out (was previously incorrect — claimed "5 rows" which only happens when every status has data).

- **`security_invoker` views consumed via `.from(...)` directly, not RPC wrappers.** Standard supabase-js `.from(view)` is fine because the view sits inside RLS. Saves four RPC functions worth of boilerplate.

- **DAL doesn't compute aggregations.** Every aggregation (counts, percentiles, averages, deltas vs. yesterday) is in the views/RPCs from 04-01. The DAL is a thin SDK wrapper, identical in shape to `dal/queue.ts`. The KPI strip's "vs yesterday %" is the only TS-side derivation, and it's literally `(today - yesterday) / yesterday`.

- **No client-side fetches.** Every component receives its data via props from the Server Component. The broadcast hook is the only client-side data source, and it just bumps a counter optimistically. Network tab confirms zero REST calls after initial load (broadcast WS connection is the only network activity after navigation).

- **`getCountryAgents` shipped now even though 04-03 consumes it.** Cheaper to land it alongside the other DAL functions than split the foundation commit. Re-exported from `dal/index.ts`; no caller in this plan; no dead-code lint warning because `index.ts` is the public surface.

## Visual fidelity vs `docs/design-reference/country-admin-dashboard.html`

The mockup is the contract. This plan's UI matches it on:

- Layout: full-width KPI strip → 2-col grid (leads-by-service + status pipeline) → 2-col grid (agent performance + speed-to-lead).
- Brand tokens: `#2B479B` primary, `#F7941D` accent, `#0F172A` sidebar, DM Sans typography.
- Live pill convention from plan 03-04 (replaces stats subheading).
- Speed-to-lead gauge geometry: 160×160 SVG ring, centre `{on_target_pct}%`, "Within 5 min" caption.
- Funnel order: `new → contacted → qualified → converted → lost`.

**Deferred to plan 04-04 visual checkpoint** (small, intentional — logged here so 04-04 picks them up):

- Pixel-perfect spacing review against the mockup's flexbox / grid metrics. The current build matches the *structural* mockup; sub-pixel padding/gap ticks are 04-04's job (a designer's eye pass on the running UI, not a TS measurement).
- "vs yesterday" delta colour transitions on broadcast bumps — currently jumps; 04-04 may add a 200ms ease.
- Gauge ring stroke-linecap polish (currently `butt`; mockup has `round`). Trivial change; lumped into 04-04 to avoid a bikeshed PR now.

These are the only knowing deviations; everything else lands at parity. Visual fidelity is a hard project requirement (CLAUDE.md "boil the ocean") — the deferred items are explicitly logged as 04-04 inputs, not silent tech debt.

## Carry-overs for downstream plans

### Plan 04-03 (lead list + reassign dialog + write APIs)

- **`getCountryAgents` is already wired** — drop-in for the dialog dropdown.
- **`reassignLead` is already wired** with typed error mapping — `ForbiddenError` / `NotFoundError` so the route handler branches without string-matching. The route handler in 04-03 just needs to: validate via `reassignLeadInput` Zod schema, call `reassignLead(input)`, map errors to `403`/`404`/`500` HTTP responses.
- **`useCountryBroadcast` is already exported** — the lead list page can subscribe to the same hook to get optimistic row insertion / status update.
- **Two-source stats split locked** — when the lead list page lands, it'll read its own paginated query but reuse `country_today_stats` for the page-header tile counts (single source for "X new today" across the surface).

### Plan 04-04 (visual checkpoint)

- Three known visual deferrals listed in "Visual fidelity" above.
- Browser-level checks: hydration warnings (Recharts `isAnimationActive=false` should keep this clean — verify); broadcast WS connect on every navigation (Phase 3 already validated this, re-check after 04-03 lands).

### Phase 5 (HQ overview)

- The `country_today_stats` view + `country_speed_to_lead_today` view are ready to be re-consumed by the HQ surface — same DAL functions, called once per active country, drive the 12-card country grid.

## Commits

- `4364ba9` — feat(04-02): country admin foundation — recharts, types regen, DAL
- `be72bc1` — feat(04-02): country admin overview UI — KPIs, funnel, leaderboard, gauge
- `2189d93` — test(04-02): country admin DAL behaviour
- (next) — docs(04-02): close plan — SUMMARY + STATE update

## Verification

- `npm install` — clean, lockfile updated for recharts ^3.8.1.
- `npm run type-check` — green (turbo, 1 task, 2.069s).
- `npm run lint` — clean (turbo, 1 task, 2.955s).
- `npm test -- country-admin.dal.test.ts --run` (apps/web workspace) — 9/9 green in 14.9s.
- `npm run dev` on port 3012 — `/MZ` (and other active country slugs) renders all 5 components with server-fetched data; no console errors; no client-side REST fetches (broadcast WS is the only network activity).
