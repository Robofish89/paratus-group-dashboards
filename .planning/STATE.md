---
last_updated: 2026-05-04
current_phase: 06-production-hardening
current_plan: 02
plan_status: shipped
next_plan: 06-05
---

# Project State

Tracks where the GSD pipeline is in the roadmap. Updated at the end of every plan.

## Phase progress

| Phase | Status | Last touched |
|-------|--------|--------------|
| 01-foundation | shipped (validated 2026-04-28, tag `phase-1-complete`) | 2026-04-28 |
| 02-data-model-ingestion | shipped (validated 2026-05-01, tag `phase-2-complete` staged — push pending) | 2026-05-01 |
| 03-sales-rep-queue | shipped (validated 2026-05-02, tag `phase-3-complete` staged — push pending) | 2026-05-02 |
| 04-country-admin-dashboard | shipped (validated 2026-05-04, tag `phase-4-complete` staged — push pending) | 2026-05-04 |
| 05-hq-overview | shipped (validated 2026-05-04, tag `phase-5-complete` staged — push pending) | 2026-05-04 |
| 06-production-hardening | in progress (06-04 shipped 2026-05-04) | 2026-05-04 |
| 07-rollout | pending | – |

## Phase 02 plan tracker

| Plan | Subsystem | Status | Summary |
|------|-----------|--------|---------|
| 02-01 | rbac-v2 + reference data | shipped | `02-01-SUMMARY.md` |
| 02-02 | leads schema (`leads`, `lead_events`, `callbacks` + RLS + 5 views) | shipped | `02-02-SUMMARY.md` |
| 02-03 | assignment + ingest RPCs + realtime broadcast triggers | shipped | `02-03-SUMMARY.md` |
| 02-04 | webhook ingest endpoint (HMAC + Zod over `ingest_lead`) | shipped | `02-04-SUMMARY.md` |
| 02-05 | CSV importer route handler | shipped | `02-05-SUMMARY.md` |
| 02-06 | realtime + cross-tenant RLS validation tests | shipped | `02-06-SUMMARY.md` |

Phase rollup: `02-data-model-ingestion/PHASE-SUMMARY.md`.

## Phase 03 plan tracker

| Plan | Subsystem | Status | Summary |
|------|-----------|--------|---------|
| 03-01 | queue RPCs + DAL + Zod + tests | shipped | `03-01-SUMMARY.md` |
| 03-02 | queue UI (Server Components + realtime) | shipped | `03-02-SUMMARY.md` |
| 03-03 | callback modal + 3 API routes + Playwright bridge | shipped (modal deprecated by 03-04; routes + e2e bridge survive) | (no SUMMARY — superseded by 03-04 redesign before close-out; commits `15f9339`, `7d5df00`, `d846379`) |
| 03-04 | UX redesign — 4 tabs, 4 tiles, range picker, no-answer flow, double-counter fix, dead-button fix | shipped | `03-04-SUMMARY.md` |

Phase rollup: `03-sales-rep-queue/PHASE-SUMMARY.md`.

## Phase 04 plan tracker

| Plan | Subsystem | Status | Summary |
|------|-----------|--------|---------|
| 04-01 | country admin DB foundation — 4 views + 4 RPCs (incl. reassign defence-in-depth) + 11 vitest cases | shipped | `04-01-SUMMARY.md` |
| 04-02 | country admin DAL + Zod + types regen + overview UI (KPIs, funnel, leaderboard, gauge) + 9 vitest cases | shipped | `04-02-SUMMARY.md` |
| 04-03 | country admin lead list + reassign dialog + write APIs | shipped | `04-03-SUMMARY.md` |
| 04-04 | Playwright golden path + visual checkpoint + migration 00012 (user_roles country-admin SELECT) + cross-dashboard congruence refactor | shipped | `04-04-SUMMARY.md` |

Phase rollup: `04-country-admin-dashboard/PHASE-SUMMARY.md`.

## Phase 05 plan tracker

| Plan | Subsystem | Status | Summary |
|------|-----------|--------|---------|
| 05-01 | HQ overview DB foundation — 3 views + 1 RPC + 1 broadcast trigger + 1 RLS policy + 8 vitest cases | shipped | `05-01-SUMMARY.md` |
| 05-02 | DAL + Zod + 4 React components + page composition + 6 vitest cases | shipped | `05-02-SUMMARY.md` |
| 05-03 | Playwright golden path + sidebar stubs + visual checkpoint | shipped | `05-03-SUMMARY.md` |

Phase rollup: `05-hq-overview/PHASE-SUMMARY.md`.

## Phase 06 plan tracker

| Plan | Subsystem | Status | Summary |
|------|-----------|--------|---------|
| 06-01 | Resend SLA breach cron | shipped | `06-01-SUMMARY.md` |
| 06-02 | audit log (00015) + write-route hooks + viewer page + 5 vitest cases | shipped | `06-02-SUMMARY.md` |
| 06-03 | proxy rename + RLS InitPlan caching (00016) + broadcast lockdown (00017) + Upstash rate-limit + createAdminClient convergence | shipped | `06-03-SUMMARY.md` |
| 06-04 | UX/scale carry-overs — cursor pagination + MetricCard consolidation + range picker + e2e flake fix + env doc | shipped | `06-04-SUMMARY.md` |
| 06-05 | TBD (carry-overs not closed by 06-01..06-04) | pending | – |

## Key decisions still in force

- Single Next.js app (`apps/web`) with role-grouped routes — locked since phase 1.
- Single Supabase project, multi-tenant via RLS on `country_code` JWT claim — locked.
- AMA-mirrored design system in `packages/ui` — locked.
- `country_code` is enum on `user_roles` (auth-side strictness) but `text` on `countries.code` (FK target for leads/callbacks) — accepted asymmetry, see plan 02-01 SUMMARY.
- Migration filenames are sequential `0000N_*.sql`; new plan numbers do NOT correspond to migration numbers. Plan 03-01 took `00009`; plan 03-04 took `00010`. Next migration is `00011`.
- `lead_events.country_code` denormalised from `leads` (deviation from PRD) — symmetric RLS, indexable. Maintained by BEFORE INSERT trigger.
- All RLS policies use `(SELECT auth.jwt()/auth.uid())` wrap for InitPlan caching across Phase 1 (post-06-03) + Phase 2 + Phase 3 + Phase 4 + Phase 5. All views set `security_invoker = true`.
- Dedupe bucket uses `date_bin('5 minutes', submitted_at, '2000-01-01Z'::timestamptz)` (the IMMUTABLE timestamptz overload), not `date_trunc + extract` — required because the expression sits inside a unique index.
- Realtime uses Broadcast-from-Database (not `postgres_changes`); private channels are auth-checked via 3 RLS policies on `realtime.messages`.
- `ingest_lead(jsonb)` is the single atomic entry point for lead creation; webhook (02-04) and CSV importer (02-05) both wrap it. Service-role only (`REVOKE ALL FROM public/anon/authenticated; GRANT EXECUTE TO service_role`).
- Webhook ingest is HMAC-authenticated, not session-authenticated. Middleware bypasses cookie auth for any `/api/leads/*` path; each route does its own auth (HMAC for the webhook, cookie session for the importer). The redundant per-path `PUBLIC_PATHS` entry that plan 02-04 added was removed in plan 02-06 — single source of truth is now the prefix block.
- `runtime='nodejs'` on the webhook because Edge has no `crypto.timingSafeEqual`.
- `PARATUS_INGEST_SECRET` provisioned in Vercel for prod/preview/dev. Production + Preview are flagged Sensitive; Development is plain (Vercel rejects `--sensitive` on the development target). Same value across all three; rotate together via the runbook in `.planning/phases/02-data-model-ingestion/02-USER-SETUP.md`.
- Path 3 CSV importer (`/api/leads/import-csv`) and all DAL service-role call sites use `createAdminClient` (`@repo/supabase/admin`). The duplicate `createServiceRoleClient` in `server.ts` was deleted in plan 06-03 — single name across the codebase.
- Integration tests authenticate test users via the magiclink-cookie technique (`admin.generateLink` → `anon.verifyOtp`) — no test passwords in env. Service-role client is setup-only; assertions run from anon-key clients carrying real user JWTs so RLS is the thing under test.
- Realtime tests listen on `event:'*'` not `'INSERT'`. The agent broadcast trigger emits `TG_OP`, and the webhook path triggers an `UPDATE` (assign_lead changes assigned_to from NULL → agent_id) rather than the `INSERT` (which has assigned_to=NULL).
- Phase 3 queue RPCs (`mark_lead_contacted`, `complete_call`, `schedule_callback`, `record_no_answer`, `agent_stats_in_range`) are EXECUTE-granted to `authenticated`, not `service_role` like `ingest_lead`. They run from the agent's authed cookie session, gate `auth.uid() = leads.assigned_to` AND `auth.jwt() ->> country_code = leads.country_code` inside the SECURITY DEFINER function (defence in depth — the definer-rights bypass RLS, so the inside-function check is the only enforcement on writes).
- `agent_today_stats` view: `security_invoker = true`, LEFT JOINed from `user_roles` so every active agent gets a row even with zero work (UI doesn't have to handle missing rows). Plan 03-04 rewrote the column shape to `to_call_count / follow_ups_count / done_today / converted_today / lost_today` (was `to_call_count / completed_today / converted_today / callbacks_pending`).
- Plan 03-01 dropped the `as never` cast on `ingestLead` after regenerating `Database` type against migration 00009 — Phase 2 carry-forward TODO closed.
- Plan 03-02 rewrote `packages/supabase/src/realtime.ts` from a `postgres_changes` subscriber to `usePrivateBroadcast<T>` — a generic private-channel broadcast hook with `config: { private: true }` baked in. Country admin (Phase 4) reuses the same hook with `topic: country:<code>`; agents use the typed `useAgentBroadcast` wrapper at `apps/web/app/(sales-rep)/_components/use-agent-broadcast.ts`.
- Plan 03-02 listens on `event:'*'` (not `INSERT`) because the webhook path always emits `UPDATE` — `assign_lead` flips `assigned_to` from `NULL` to `agent_id` after the initial insert. Filtering to a single op would silently miss the production code path (same call shipped in plan 02-06's broadcast test).
- Plan 03-02 stats are server-authoritative: `getAgentTodayStats()` is fetched on every server render, and the client only optimistically bumps `to_call_count` by 1 on a fresh assignment. Plan 03-04 wires `router.refresh()` after every successful outcome RPC so all five counters re-fetch from the authoritative server view.
- **Plan 03-04 — sales-pipeline jargon collapsed: 5 outcomes → 3 outcomes + soft-no-answer.** UI label "Converted" maps to DB `status='converted'`. The DB enum value `lead_events.outcome='won'` is preserved for analytics back-compat — UI never renders the word "won".
- **Plan 03-04 — `'qualified'` rejected by `complete_call`** (post-00010); status enum still contains it (no destructive change) but no code path emits it. Zod `callOutcomeEnum` and the RPC IF-validation both reject it.
- **Plan 03-04 — no-answer attempts never auto-Lost.** Agent retains the lead forever in Follow-ups; `call_attempts >= 3 AND last_outcome='no_answer'` triggers the tab move only. Status stays `contacted`.
- **Plan 03-04 — date range URL-stateful** via `?range=today|week|month|custom` (+ `?from`/`?to`); server-fetched via `getAgentStatsInRange` RPC. `parseRangeParams` helper at `apps/web/app/(sales-rep)/_lib/date-range.ts` is the single source of truth for both server page and client picker.
- **Plan 03-04 — defence-in-depth on the dead-button bug.** `mark_lead_contacted` RAISEs `invalid_status` when called against a `converted` or `lost` lead; UI hides the button. Two layers must fail to reproduce plan 03-03's dead-button crash.
- **Plan 03-04 — done_today single-counted at the view layer.** Recreated `agent_today_stats.done_today` reads `count(leads where status IN ('converted','lost') and updated_at >= start_of_day)` — no longer sums `lead_events`. Fixes the prior bug where the `'connected'` event leaked into the counter.
- **Plan 03-04 — modal-free surface.** `CallOutcomeModal` deleted from `@repo/ui`. Inline state-aware card actions (`<CardActionArea />`) cover all five outcomes (Call → Converted / Lost / Callback / No-answer). `git grep -n 'CallOutcomeModal' packages/ apps/` returns zero hits.
- **Plan 04-01 — JWT custom claims are `user_role` + `country_code`** (NOT `role`/`country`); the `agent` role enum value is what `user_roles.role` stores (NOT `sales_rep`). Every guard in 00011 reads those exact keys. The 04-01 plan template was written before that convention was finalised; corrected during execution.
- **Plan 04-01 — speed-to-lead asymmetry: median for the sparkline, average for the headline KPI tile.** `speed_to_lead_series` returns P50 + P75 because charts are sensitive to outliers; `country_speed_to_lead_today.avg_response_seconds` keeps "Avg Response Time" on the tile because that's the literal mockup label. Documented in SQL comments.
- **Plan 04-01 — speed-to-lead NULL policy: aggregations operate only over leads where `first_contacted_at IS NOT NULL`.** Including uncontacted leads would make the metric look artificially fast (Phase 4 RESEARCH.md pitfall 3). Applies to `country_speed_to_lead_today` AND `speed_to_lead_series`.
- **Plan 04-01 — `reassign_lead` cross-country target guard is the *only* defence for HQ admins.** Country admins are caught earlier by the JWT-country guard, but hq_admin has no country-scope check. The target-country comparison (`v_target_country IS DISTINCT FROM v_lead_country` → `cross_country_assignment` / 42501) stops cross-country zombie assignments.
- **Plan 04-01 — `agent_performance_in_range.leads_assigned` is range-windowed.** First cut counted lifetime assignments; caught by the zero-work-agent test, fixed in commit `aaba26e` and applied live as patch migration `country_admin_fix_leads_assigned_window`. Source-of-truth `00011_country_admin.sql` carries the corrected version.
- **Plan 04-01 — `status_pipeline_today` includes the full `lead_status` enum, including `qualified`.** Even though Phase 3 plan 03-04 made `complete_call` reject `qualified`, the enum value is preserved for analytics back-compat and the funnel renders five segments (qualified will simply read 0).
- **Plan 04-02 — `status_pipeline_today` view's GROUP BY drops zero-count buckets.** The DAL surface returns *only* statuses with at least one lead today; the consuming `<StatusPipelineCard>` component defaults missing statuses to 0 so the funnel always renders five segments. Test case 3 pins the contract; the DAL doc-comment was refined to spell it out (the prior comment incorrectly claimed "5 rows" which only happens when every status has data).
- **Plan 04-02 — Recharts `^3.8.1` pinned to AMA companion repo, `apps/web`-only install (not monorepo root).** `@types/recharts` deliberately not installed (Recharts ships its own; the legacy types package is years out of date).
- **Plan 04-02 — country broadcast topic `country:<code>` listening on `event:'*'`.** Same reasoning as plan 03-02 — the webhook path emits `UPDATE` (when `assign_lead` flips `assigned_to` from `NULL` to `agent_id`); filtering to a single op would silently miss the production code path. The country-scope realtime broadcast triggers from `00008_realtime_broadcast.sql` already exist; no new DB work needed.
- **Plan 04-02 — two-source stats split is now also the country-admin pattern.** `KpiStrip` reads `country_today_stats` for live tiles + delta + `country_stats_in_range` for the range-aware Converted tile; `<StatusPipelineCard>` and `<LeadsByServiceCard>` are today-only views. Same shape Phase 3 locked for the agent queue. `router.refresh()` will resync the server view on every successful write later in 04-03.
- **Plan 04-02 — speed-to-lead chart `<ReferenceLine y={300} />`, not `y=5`.** The DB stores `extract(epoch from ...)` — seconds, not minutes. 300 seconds = the 5-minute target. Documented in the chart file.
- **Plan 04-02 — custom 160×160 SVG gauge ring, no library.** ~12 lines of `<circle stroke-dasharray>` math is lighter than any gauge library. Recharts is reserved for the AreaChart sparkline only (gradient fill, `<ReferenceLine>`, monotone curve).
- **Plan 04-02 — 04-04 visual checkpoint inputs explicitly logged.** Three known visual deferrals — pixel-perfect spacing review, broadcast-bump delta-colour transitions (currently jumps; 04-04 may add 200ms ease), gauge ring stroke-linecap (currently `butt`; mockup has `round`) — are listed in the SUMMARY's "Visual fidelity" section so 04-04 picks them up rather than silently leaving them as tech debt.
- **Plan 04-01 — `country_speed_to_lead_today` coexists with `speed_to_lead_daily` (00006).** Different shapes (today single-row vs per-day), both kept. The today view powers the gauge tile; the daily view powers the multi-day chart.
- **Plan 04-03 — CSV export uses cookie-authed `createClient`, never service-role** (RESEARCH.md pitfall 6). RLS is the country lock; HQ admins see all because the JWT custom claim doesn't pin `country_code`. The route deliberately does NOT add an `.eq("country_code", ...)` filter — that would silently break HQ's see-all path and is dead-code for country admins (RLS already enforces it).
- **Plan 04-03 — defence-in-depth role gate on both country-admin routes.** `claims.user_role` checked at the route layer (`country_admin | hq_admin`) on top of the SECURITY DEFINER `forbidden_role` guard inside `reassign_lead`. Mirrors the agent queue routes (`/api/queue/complete` etc.). 401 for missing session, 403 for wrong role.
- **Plan 04-03 — offset pagination for the lead list, cursor migration deferred to Phase 6.** Paratus's largest active country has ~5k leads; offset works at this scale. No `// TODO` left in code (Boil-the-Ocean) — v1 code is correct as shipped, just not asymptotically optimal.
- **Plan 04-03 — no realtime broadcast on the lead list view.** Pagination + concurrent inserts shifts indices; admins on page 2 would see rows duplicate / disappear as new leads arrive on page 1. Overview tiles still pop via `useCountryBroadcast`. Verified: opening `/[country]/leads` does NOT open a Supabase realtime WS connection.
- **Plan 04-03 — cross-country reassignment guard is RPC-only.** No client-side check in `<ReassignDialog>` — the agents dropdown is already filtered to the lead's country (`getCountryAgents(country)`), and the RPC's `cross_country_assignment` guard backstops it. Single source of truth at the SQL layer; UI layer doesn't try to mirror the rule.
- **Plan 04-03 — `q` filter sanitises `,()` before PostgREST `.or()`.** supabase-js splits the `.or()` value on commas and parens; passing user input verbatim breaks the filter. Helper strips those characters (searching for them isn't meaningful for name/email/phone).
- **Plan 04-03 — `signInViaBridge` collects every `Set-Cookie` chunk** via `getSetCookie()`. Next sets multiple `sb-...-auth-token.{0,1,...}` chunks for big sessions; concatenating only the first one breaks RLS auth in the test client. Helper splits each chunk on `;`, takes the `name=value` head, and joins with `; ` for the request `Cookie:` header.
- **Plan 04-04 — migration 00012 (`user_roles` country-admin SELECT) authorised at the visual checkpoint.** Phase 1 only allowed HQ admins to read all rows + users to read their own row. Country admins' UI display paths that read `user_roles` (reassign dropdown + lead-list "Assigned To" cell) silently degraded to "no agents" / "Unassigned" because `getCountryAgents()` returned the empty set under their seat. Writes remain HQ-only via the existing `HQ admins manage user_roles` policy. The `reassign_lead` RPC's `SECURITY DEFINER` body is unaffected (it bypasses RLS) — the route-layer reassign always worked; only the UI display paths were broken.
- **Plan 04-04 — cross-dashboard congruence wins over mockup literalism.** When a shipped neighbour (Phase 3 queue-stats) and a Phase 4 mockup disagree on a visual pattern, the neighbour wins. The Phase 4 KPI strip was refactored from "small inset accent stripe at top of card" (mockup) to "ring around card matching the tile's domain colour with the number coloured to match" (queue-stats). HQ overview (Phase 5) inherits the same pattern.
- **Plan 04-04 — pipeline funnel widths are positional, not data-driven.** `<StatusPipelineCard>` renders fixed widths `100/88/76/64/52` so it always reads as a coherent funnel even when downstream segments are zero. Counts + share-% inside each segment carry the data; width is a visual cue. Resolves a checkpoint finding where the prior data-driven width formula collapsed sparse-data segments to a 25% min that looked stacked.
- **Plan 04-04 — three stat-tile patterns now exist** (`MetricCard` in `@repo/ui` with full-width top bar, `queue-stats` with coloured ring, `kpi-strip` now also coloured ring). Phase 6 cleanup target: consolidate to a single shared component.
- **Plan 05-01 — `leads_by_service_group` is ALL-TIME, diverging from `leads_by_service_today` (00011, today-only per country).** Mockup math has the bars summing to "Total Leads (Group)" 8,432; today-only would break the visual contract. Documented in SQL COMMENT and migration header.
- **Plan 05-01 — `group_today_stats` body uses two CTEs cross-joined** (`country_aggs` summing per-country `country_today_stats`, `leads_aggs` aggregating from raw `leads`). Avoids the cartesian double-count that would occur if `countries ⨯ country_today_stats ⨯ leads` were joined in a single FROM clause.
- **Plan 05-01 — `group_speed_to_lead_series` uses UTC day boundaries (not country tz).** Group view spans 12 IANA tz; per-country boundary makes no sense in a single-axis trend. Country-scoped `speed_to_lead_series` (00011) keeps country-tz boundaries because it's scoped.
- **Plan 05-01 — `group_speed_to_lead_series` rejects `country_admin` (`forbidden_role / 42501`).** Country admins have their own per-country RPC (00011); the HQ RPC is HQ-only by design, not a wider window of theirs.
- **Plan 05-01 — `country_performance_today.avg_response_seconds` is ALL-TIME.** Today-only would be too volatile across small-volume countries.
- **Plan 05-01 — `group:all` realtime topic + `hq_group_topic` policy.** One trigger replaces 12 simultaneous per-country subscriptions per HQ tab. Existing `hq_country_topic` policy (00008) stays — HQ retains the ability to subscribe to a specific `country:<code>` topic when drilling into a country page.
- **Plan 05-01 — RLS NOT tightened on the new HQ views.** Country admins can technically `SELECT * FROM group_today_stats` and get country-scoped sums (RLS hides their other-country leads). Route layer (`apps/web/app/(hq)/layout.tsx requireRole(['hq_admin'])`) is the access boundary, kept symmetrical with how `country_today_stats` works for HQ admin reads.
- **Plan 05-02 — `computeResponseStatus` + `RESPONSE_STATUS_THRESHOLDS` live in `schemas/group.ts`, NOT `dal/group.ts`.** Pure helper, no `server-only` boundary. Client components (`<KpiStrip>`, `<CountryLeaderboard>`) import it directly from `@repo/supabase/schemas`; the DAL re-exports for ergonomic server-side imports. Plan template originally placed it in `dal/`; moved at execution time to fix a `'server-only' cannot be imported from a client component'` build error.
- **Plan 05-02 — Status thresholds: null → red, <300s → green, ≤480s → amber, >480s → red.** Single source of truth: `RESPONSE_STATUS_THRESHOLDS = { green: 300, amber: 480 }`. Read by leaderboard dots, KPI strip ring, the legend below the leaderboard, AND the speed-to-lead trend chart's `<ReferenceLine>` (so the 5-min target is never a magic number anywhere).
- **Plan 05-02 — 5 KPI tiles, mockup verbatim.** Total Leads (Group) / Countries Active / Conversion Rate / Avg Speed to Lead / Leads Today. The mockup's "+2.1%" comparator on Conversion Rate is dropped in v1 (no comparator window decided — RESEARCH.md open question 4).
- **Plan 05-02 — `<KpiStrip>` "Avg Speed to Lead" tile colour driven by `computeResponseStatus(seconds)`.** Green/amber/red ring matches the leaderboard dots. The misleading-mean caveat (a green tile here doesn't mean every country is on target) is documented in JSDoc; the leaderboard is the truth.
- **Plan 05-02 — country leaderboard drill-in is `<Link href='/<slug>'>` on the country name only.** Phase 4 plan 04-03 already wired the country-admin layout to accept `hq_admin` — drill-in Just Works. Future Phase 6 tightening MUST keep `hq_admin` in that allow-list.
- **Plan 05-02 — `<SpeedToLeadTrendCard>` uses paratus-blue (#2B479B) gradient + Recharts AreaChart with `<ReferenceLine y={RESPONSE_STATUS_THRESHOLDS.green}>`.** Country-admin's per-country chart uses emerald (matches the gauge tile); group-wide HQ chart uses paratus-blue (matches "Total Leads (Group)" tile and the mockup). Same chart primitive; different colour family.
- **Plan 05-02 — HQ overview page is a Server Component; broadcasts subscribe at the leaf.** `Promise.all` over 4 reads in the page; only `<KpiStrip>` opens a websocket via `useGroupBroadcast`. Same pattern Phase 4 locked: server-fetched truth + leaf-level optimistic bumps + `router.refresh()` on every event.
- **Plan 05-03 — `<KpiStrip>` exposes `data-realtime-status`** for E2E gating, mirroring the `(sales-rep)/_components/queue-view.tsx` pattern from Phase 3. The HQ realtime test waits for `SUBSCRIBED` before ingesting; without this gate the broadcast lands before the client subscribes and the tile never bumps.
- **Plan 05-03 — sidebar stubs are Phase 6 placeholders, not full surfaces.** `/countries`, `/service-mix`, `/settings` each render an `HQShell` + a single `<SectionCard>` describing what the surface will become. RESEARCH q5 resolved this — the canonical view of "Countries" today *is* the leaderboard on Overview; building it again would duplicate.
- **Plan 05-03 — visual checkpoint deviations all accepted under "cross-dashboard congruence wins" + project-scope corrections + RESEARCH-resolved questions.** Six points of divergence between mockup and shipped surface; zero genuine drift. Full table in `05-03-SUMMARY.md`.
- **Plan 05-03 — drive-by fix on sales-rep `tab labels` test.** The assertion was `getByText('Call Queue')` but the page heading was renamed to `My Leads` in plan 03-04 polish (per the user's "agent copy voice" memory). Fixed to `getByRole('heading', { name: 'My Leads' })`. Caught by the close-out full-suite Playwright run.
- **Plan 06-04 — cursor (keyset) pagination on the country-admin lead list.** Migration 00018 adds composite index `leads_created_at_id_desc_idx` matching ORDER BY `(created_at DESC, id DESC)`. URL contract is now `?cursor=<base64url>` instead of `?page=N`; Prev walks browser history (`router.back()`), Next pushes (so back works as the cursor stack). Filter changes still `replace` to avoid history pollution. Offset path fully removed.
- **Plan 06-04 — single `MetricCard` primitive in `@repo/ui` backs all three dashboards.** Two variants (`ring` default, `top-bar` for the original mockup look). Seven accent families (blue / orange / emerald / rose / slate / amber / violet). All `data-*` hooks (`data-tile`, `data-testid`, `data-realtime-status`) flow through the `dataAttrs` prop. The legacy `MetricCardTrend` type was dropped (no consumers); `MetricCardDelta` (`{ text, tone }`) is the replacement.
- **Plan 06-04 — country-admin range picker re-uses the sales-rep `DateRangePicker` directly** rather than lifting it to `@repo/ui`. The UI package has no `next` peer dep today; lifting would have required adding one. Thin `RangePicker` wrapper at `(country-admin)/[country]/_components/range-picker.tsx` is the seam if behaviour ever needs to diverge. URL contract from plan 04-03 is unchanged — picker only adds the UI.
- **Plan 06-04 — country-admin `KpiStrip` now exposes `data-realtime-status`** for symmetry with HQ. No spec depends on it today; available for the broadcast-gating pattern Phase 5 used.
- **Plan 06-03 — `apps/web/middleware.ts` → `apps/web/proxy.ts`** via Next.js 16 codemod (`@next/codemod middleware-to-proxy`). Named export `middleware` → `proxy`. Matcher and `/api/leads/*` HMAC bypass preserved. Build now reports `ƒ Proxy (Middleware)` — the Phase 1-onwards deprecation warning is gone. Comments referencing the concept of "middleware" left untouched (they refer to the Next.js feature, not the file name).
- **Plan 06-03 — three Phase 1 `user_roles` policies wrapped for InitPlan caching** (00016): `HQ admins read all user_roles`, `HQ admins manage user_roles`, `Users read own role`. `Country admins read country user_roles` (added by 04-04) and `hq_group_topic` on `realtime.messages` (00013) were ALREADY wrapped at the source — STATE.md tracking was stale; 00016 narrowed in-flight after live SQL audit. Role narrowing (`TO authenticated`) was already present at apply-time.
- **Plan 06-03 — `supabase_auth_admin`'s "Auth admin reads ... for JWT hook" policy on `user_roles` left untouched.** Scoped to a privileged role, runs once per JWT mint inside Supabase's auth hook — no row-loop, no caching benefit.
- **Plan 06-03 — three `broadcast_lead_to_*` trigger functions REVOKE'd EXECUTE from PUBLIC, anon, authenticated** (00017). Trigger context invokes them as the table owner, not the calling session — explicit GRANT back is unnecessary. Closes a gap that was open since plan 02-03 (agent + country triggers) and 05-01 (group trigger).
- **Plan 06-03 — Upstash rate-limit lib at `packages/supabase/src/lib/rate-limit.ts`.** Sliding-window via `@upstash/ratelimit` + `@upstash/redis`. Two limiters: `authLimiter` (5 req/60s, prefix `paratus:auth`) consumed in `proxy.ts` on auth-flow paths; `ingestLimiter` (60 req/60s, prefix `paratus:ingest`) consumed in `/api/leads/ingest` BEFORE HMAC validation. Lazy init (`LazyLimiter` class) — first runtime call resolves Redis. Required so `next build` page-data collection succeeds in production NODE_ENV without runtime env at build time. Dev fail-open via `makeShim`; prod fail-closed at first call. `safeLimit()` wraps `try/catch` and ALLOWS on Upstash error (DOS ceiling, not auth boundary).
- **Plan 06-03 — ingest rate-limit key = `sha256(PARATUS_INGEST_SECRET)`, not per-IP.** n8n cloud egresses from a small shared pool; per-secret means each tenant gets its own bucket. Hashing keeps the secret out of Upstash logs/keys. Rate-limit fires BEFORE HMAC validation — 401 responses also count against the bucket so probes can't side-channel secret-validity via timing or header presence.
- **Plan 06-03 — `/api/auth/logout` excluded from auth-path rate limit.** Logout is intent-revealing but harmless; capping it traps a user mid-session if they're behind a flooded IP.
- **Plan 06-03 — `createServiceRoleClient` deleted from `packages/supabase/src/server.ts`; `createAdminClient` is the single name.** All call sites converged: `dal/events.ts`, `dal/leads.ts`, `apps/web/app/api/e2e-login/route.ts`. `git grep -n createServiceRoleClient` returns only a single deprecation comment in `server.ts`.
- **Plan 06-03 — six security headers verified in `next.config.ts`:** Content-Security-Policy, Strict-Transport-Security, X-Frame-Options, X-Content-Type-Options, Referrer-Policy, Permissions-Policy. Zero diff (Permissions-Policy was already added in a prior phase).
- **Plan 06-01 — SLA breach detection via per-minute Vercel cron + Resend email.** Migration 00014 adds `leads.sla_breach_alerted_at` (dedupe column), partial index `leads_sla_pending_idx`, `v_sla_breaches` view (`security_invoker = true`, service-role only), and `mark_sla_alerted(uuid)` RPC. Cron route at `/api/cron/sla-check` (bearer-auth, `runtime='nodejs'`, `maxDuration=60`) reads breaches → emails country admins via Resend in parallel (`Promise.allSettled`) → marks dedupe column only on full success. Resend SDK + `@react-email/components` added to `packages/supabase` deps; React Email template at `lib/emails/sla-breach.tsx` uses paratus-blue/accent-orange palette + inline styles for Gmail/Outlook compat. `X-Entity-Ref-ID` header per breach prevents Gmail thread-collapse.
- **Plan 06-01 — `v_sla_breaches` filters `status = 'new'`, not `'new'|'assigned'`.** The `lead_status` enum (00005) has no `'assigned'` value — assignment flips `assigned_to` from NULL without changing `status`. Breach criterion is exactly `status = 'new' AND first_contacted_at IS NULL AND submitted_at < now() - 5min AND sla_breach_alerted_at IS NULL`. SQL header documents the deviation from the plan template.
- **Plan 06-01 — Resend client + env validation are lazy.** `email.ts` defers `RESEND_API_KEY`/`SLA_ALERT_FROM_EMAIL` reads until first `sendSlaBreachEmail(...)` call. Module-init crash would block any other route that transitively imports the cron's deps; lazy init still fails fast on first send (cron triggers within 60s of deploy in any env that's expected to email). Tests stub Resend at the module boundary via `vi.mock('resend')` and reset the cached client between cases via `__resetResendClientForTests`.
- **Plan 06-01 — `apps/web/vitest.config.ts` aliases `server-only` to a no-op shim.** Required so the test runner (plain Node, no RSC graph) can import the cron route module. Production Webpack/Turbopack still enforces the boundary at compile time. Shim lives at `apps/web/test-support/server-only-shim.ts`.
- **Plan 06-01 — cron dedupe via `sla_breach_alerted_at` column, not external store (Redis/SQS/DynamoDB).** The column is part of the source-of-truth `leads` row, so a single transaction (cron call → mark RPC) is enough to close the dedupe window. Partial Resend failure leaves the column NULL → next minute retries the entire batch. No additional infrastructure required.
- **Plan 06-01 — cron return shape `{ checked, alerted, errors[] }` carries no PII.** Errors are `{ leadId, recipient, message }`; the email body never appears in logs or responses. Per-invocation `process.stdout.write` of `{ event: 'sla_cron', checked, alerted, error_count }` for the Vercel runtime drain.

## Recent commits (most recent first)

- `046b6a9` — feat(06-01): SLA breach cron route + vercel cron schedule + integration test
- `2ee1979` — feat(06-01): migration 00014 — SLA breach detection schema + Resend wrapper + email template
- `9cf90c8` — feat(06-03): Upstash rate-limit on auth + ingest paths; converge to createAdminClient
- `92b8b55` — feat(06-03): migrations 00016 + 00017 — RLS InitPlan caching + broadcast lockdown
- `ab09c78` — chore(06-03): rename middleware.ts to proxy.ts (Next.js 16)
- `1544d3e` — feat(06-02): migration 00015 — audit_log + record_audit RPC + DAL
- `6810d85` — feat(06-04): country-admin range picker + no-answer e2e timeout + E2E env doc
- `7d5832e` — refactor(06-04): consolidate stat tile to single MetricCard primitive
- `86129f7` — feat(06-04): cursor pagination on country-admin lead list
- `e2e8a8f` — feat(05-03): HQ sidebar stub pages — Countries, Service Mix, Settings
- `72d0125` — test(05-03): HQ overview Playwright golden path
- `9aa0f08` — docs(05-02): close plan — SUMMARY + STATE update
- `86d42db` — feat(05-02): compose HQ overview page on top of plan 05-01 surface
- `27fef8f` — feat(05-02): HQ overview UI primitives — broadcast hook + 4 React cards
- `61fb4b5` — feat(05-02): group DAL — Zod schemas, 4 reads, status-bucket helper
- `f7c6113` — docs(05-01): close plan — SUMMARY + STATE update
- `e025971` — test(05-01): HQ overview integration tests — RPC guards + RLS shape + realtime
- `d526f0c` — feat(05-01): migration 00013 — HQ overview views + RPC + group:all topic
- `754266e` — test(04-04): flip reassign assertion after migration 00012 lands
- `be41ce8` — fix(04-04): KPI strip + pipeline funnel polish — congruence with sales-rep queue
- `df72cad` — feat(04-04): migration 00012 — country admins can read user_roles in their country
- `1d0b085` — docs(04-03): close plan — SUMMARY + STATE update
- `0e0f0af` — feat(04-04): country admin Playwright golden path
- `77f6f46` — test(04-03): country admin route handlers + RLS gates
- `ea69b85` — feat(04-03): country admin lead list + reassign dialog
- `87683b7` — feat(04-03): country admin write APIs — reassign + CSV export
- `10b84d8` — docs(04-02): close plan — SUMMARY + STATE update
- `2189d93` — test(04-02): country admin DAL behaviour
- `be72bc1` — feat(04-02): country admin overview UI — KPIs, funnel, leaderboard, gauge
- `4364ba9` — feat(04-02): country admin foundation — recharts, types regen, DAL
- `381f9bc` — docs(04-01): close plan — SUMMARY + STATE update
- `91308cb` — test(04-01): country-admin RPCs + RLS gates
- `aaba26e` — fix(04-01): window leads_assigned in agent_performance_in_range
- `13ff45d` — feat(04-01): migration 00011 part 2 — country admin RPCs
- `17cdf56` — feat(04-01): migration 00011 part 1 — country admin views
- `d9318ca` — docs(04): create phase plan
- `3b0d425` — docs(04): complete phase research
- `b9634ad` — ci: trigger redeploy after repo visibility change to public
- `61855d3` — docs: rename supabase-paratus MCP references to supabase-paratusgroup
- `8c6f207` — fix(03-04): replace stats subheading with Live data pill
- `37d6c5e` — chore(03-04): remove deprecated outcome modal
- `f92374d` — test(03-04): e2e for inline outcomes + follow-ups
- `f7d4828` — feat(03-04): no-answer route + complete route narrowed outcomes
- `dbd9773` — feat(03-04): 4-tab queue with date range
- `be51915` — feat(03-04): card action atoms
- `e78a0e4` — test(03-04): no-answer RPC + done_today filter + qualified rejection
- `b067f83` — feat(03-04): DAL surface for new queue model
- `fc3d77d` — feat(03-04): migration 00010 — queue UX redesign schema
- `d846379` — test(03-03): playwright golden-path E2E + e2e-login auth bridge
- `7d5df00` — feat(03-03): wire Call Now → contact → outcome modal → complete/callback
- `15f9339` — feat(03-03): replace CallOutcomeModal with five-outcome variant
- `c91a519` — docs(03-02): close plan — SUMMARY + STATE update

(Phase-3 close-out commit `docs(03-04): close phase 3 — SUMMARY + PHASE-SUMMARY + STATE update` lands in the same write as this STATE update; refresh the table after the commit if reading on disk.)

## Live infrastructure

- Production URL: https://paratus-group-dashboards.vercel.app
- Webhook URL: https://paratus-group-dashboards.vercel.app/api/leads/ingest
- CSV importer URL: https://paratus-group-dashboards.vercel.app/api/leads/import-csv
- Queue routes: `/api/queue/contact`, `/api/queue/complete`, `/api/queue/callback`, `/api/queue/no-answer` (internal — agent cookie session only)
- E2E bridge: `/api/e2e-login` (gated by `E2E_AUTH_ENABLED`; absent in production)
- SLA cron: `/api/cron/sla-check` (bearer-auth — `Authorization: Bearer ${CRON_SECRET}`; Vercel scheduler `* * * * *`)
- Supabase project ref: `tgswsdfaszvztbpczfve` (region: West EU / Ireland) — migrations 00001–00018 applied (plus patch `country_admin_fix_leads_assigned_window` from 04-01). Plan 06-01 added 00014 (SLA breach view + dedupe RPC); plan 06-03 added 00016 (Phase 1 RLS InitPlan caching) + 00017 (broadcast trigger function REVOKE).
- Vercel team: `paratusgroup` / project `paratus-group-dashboards`
- GitHub: https://github.com/Robofish89/paratus-group-dashboards (private)

## Working tree status at last update

Plans 06-01 + 06-03 + 06-04 lanes shipped on `main`. Sibling 06-02 lane (audit-log integrations into queue/reassign routes) still has unstaged work in the tree — lands via that plan's close-out.

## Next move

**Phase 5 sealed.** HQ overview surface is end-to-end:
- Live overview at `/`: 5 KPI tiles, 12-row country leaderboard with status dots + drill-in to `/<country-slug>`, all-time leads-by-service breakdown, 7-day speed-to-lead trend chart.
- Realtime: webhook ingest → `group:all` broadcast → KPI strip bumps without manual refresh. One trigger replaces 12 simultaneous per-country subscriptions per HQ tab.
- Sidebar resolves cleanly on every link: Overview is live; Countries / Service Mix / Settings are Phase 6 placeholders explaining what each will become.
- `phase-5-complete` tag staged locally; push pending explicit user approval (same posture as `phase-2`/`phase-3`/`phase-4`).

**Plan 05-03 deliverables:**
- 3 Playwright specs at `apps/web/e2e/hq-overview-golden-path.spec.ts` — render, drill-in, realtime — all green, 3 flake-free runs.
- 2 Playwright specs at `apps/web/e2e/hq-stub-pages.spec.ts` — HQ admin sees Phase 6 placeholders, country admin → /unauthorized.
- 3 sidebar stub pages — `(hq)/countries/page.tsx`, `(hq)/service-mix/page.tsx`, `(hq)/settings/page.tsx`.
- `<KpiStrip>` exposes `data-realtime-status` so the realtime spec can wait for SUBSCRIBED before ingesting.
- Visual checkpoint walked vs `docs/design-reference/hq-dashboard.html`. Six divergences logged; all six accepted (Phase 4 cross-dashboard congruence locks + RESEARCH-resolved questions + project-scope corrections).
- Drive-by fix on sales-rep `tab labels` test (was asserting old "Call Queue" copy; now matches the "My Leads" heading from 03-04 polish).

**Plan 06-04 shipped.** UX/scale carry-overs from "From 04-04" + "From 05-03" are closed:
- Cursor pagination on the country-admin lead list (composite index 00018; offset path fully removed; URL contract `?cursor=<base64url>`).
- Single `MetricCard` primitive in `@repo/ui` backing all three dashboards (sales-rep queue-stats, country-admin kpi-strip, HQ kpi-strip).
- Range-picker UI on the country-admin overview (re-uses the sales-rep `DateRangePicker`; 04-03 URL contract unchanged).
- Sales-rep no-answer 3× e2e flake fix (8s → 12s timeout).
- `.env.local.example` documents `E2E_AUTH_ENABLED=true` + `.next` dev-cache restart cadence.

**Plan 06-03 shipped.** Production hardening sweep closed in three atomic commits:
- `apps/web/middleware.ts` → `apps/web/proxy.ts` via Next.js 16 codemod. Build now reports `ƒ Proxy (Middleware)`; deprecation warning gone.
- Migration 00016: three Phase 1 `user_roles` policies wrapped in `(SELECT auth.<fn>())` for InitPlan caching. Live audit narrowed scope — `hq_group_topic` already shipped wrapped at 00013.
- Migration 00017: REVOKE EXECUTE on three `broadcast_lead_to_*` trigger functions from PUBLIC, anon, authenticated.
- Upstash rate-limit live on auth-flow paths (5 req/60s/IP) + ingest webhook (60 req/60s/secret-hash). Lazy-init pattern; dev fail-open via shim, prod fail-closed at first call.
- `createServiceRoleClient` deleted; `createAdminClient` is the single name across the codebase.
- Six security headers verified in `next.config.ts` — zero diff.
- 06-USER-SETUP.md created — Upstash provisioning checklist + verification curls.

**Plan 06-01** (Resend SLA breach cron) still running in parallel — close it out next, then optionally seal Phase 6 with a 06-05 plan covering the remaining carry-overs below.

Carry-overs still open after 06-03 + 06-04:
- Pilot-country runbook (one country running 48h with real leads, no incidents).
- Hermetic vitest setup (route-driven tests need `npm run dev` running on port 3012; full-suite runs hit Supabase auth rate-limit).
- Replace HQ sidebar stubs with real surfaces (drill-in directory / service mix over time / group admin settings).
- Conversion-rate comparator window decision (week-over-week vs month-over-month).
- Supabase performance-advisor cache shows stale `auth_rls_initplan` warnings on policies the SQL audit confirms are wrapped — re-check at phase boundary.
- `multiple_permissive_policies` warnings on `leads`, `lead_events`, `callbacks`, `audit_log`, `user_roles` — same role + same action across HQ-all + country-scoped + agent-own policies. Low pilot-scale cost; consolidating into single role-aware policies is a Phase 7 job.
- `auth_leaked_password_protection` Supabase Auth setting (admin-flip via dashboard).
- `function_search_path_mutable` on `handle_updated_at`, `custom_access_token_hook`, `set_lead_event_country_code` — three SECURITY DEFINER functions need `SET search_path = ''`. Quick patch migration.
- **From 06-03 Upstash setup** — Provision `UPSTASH_REDIS_REST_URL` / `_TOKEN` in Vercel Production + Preview before next prod deploy; otherwise auth + ingest paths return 500 at first request. See `06-USER-SETUP.md`.
