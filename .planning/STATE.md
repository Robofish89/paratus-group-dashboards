---
last_updated: 2026-05-05
current_phase: 07-rollout
current_plan: 03
plan_status: shipped (scaffold-only — live cutover deferred)
next_plan: 07-03 (live cutover ceremony) → 07-04
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
| 06-production-hardening | shipped (validated 2026-05-05, tag `phase-6-complete` staged — push pending) | 2026-05-05 |
| 07-rollout | in progress (plans 07-01 + 07-02 shipped) | 2026-05-05 |

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
| 06-01 | Resend SLA breach cron — migration 00014 + email template + cron route + 4 vitest cases | shipped | `06-01-SUMMARY.md` |
| 06-02 | audit log (00015) + `record_audit` RPC + DAL + 5 wired routes + viewer page + 5 vitest cases | shipped | `06-02-SUMMARY.md` |
| 06-03 | proxy rename + RLS InitPlan caching (00016) + broadcast lockdown (00017) + Upstash rate-limit + createAdminClient convergence | shipped | `06-03-SUMMARY.md` |
| 06-04 | UX/scale carry-overs — cursor pagination (00018) + MetricCard consolidation + range picker + e2e flake fix + env doc | shipped | `06-04-SUMMARY.md` |
| 06-05 | Operations gating — `/api/health` DB probe + Sentry + hermetic vitest + RUNBOOK + BACKUP_RESTORE + 48 h pilot soak | shipped | `06-05-SUMMARY.md` |

Phase rollup: `06-production-hardening/PHASE-SUMMARY.md`.

## Phase 07 plan tracker

| Plan | Subsystem | Status | Summary |
|------|-----------|--------|---------|
| 07-01 | bulk-invite engine — React Email invite template + Resend wrapper + provision-users.ts + vitest | shipped | `07-01-SUMMARY.md` |
| 07-02 | onboarding docs — three role one-pagers + Loom-links index + CUTOVER.md (12 country sections, Mozambique [PILOT]) + in-app `?` Help link wired through all three role shells | shipped | `07-02-SUMMARY.md` |
| 07-03 | pilot cutover — Mozambique provisioning + smoke-test + form-side webhook flip + 24-48 h soak + sign-off | **shipped (scaffold-only — live cutover deferred to next session with William present)** | `07-03-SUMMARY.md` |
| 07-04 | rollout to remaining 11 countries + Loom recordings + handover ceremony | **blocked on 07-03 live cutover completing** | – |

## Phase 07 resume bookmark (2026-05-05 — updated post-07-03 scaffold)

**Where we stopped:** Wave 1 closed cleanly (07-01 + 07-02 shipped). Wave 2 (07-03) **shipped in scaffold-only mode** — Q1–Q8 resolutions captured, `07-USER-SETUP.md` staged with 4 untickled checklists, `.gitignore` negation in place, local `rollout-contacts.csv` seeded (header + commented examples; gitignored). No production-side actions taken; live cutover ceremony pending William.

**Resume path:** Re-enter `/gsd:execute-plan 07-03` (live-cutover mode) when William delivers the inputs below. The orchestrator will detect `07-03-SUMMARY.md` at the scaffold boundary and route to the live-cutover continuation.

**What still needs William before 07-03 can fully close (live cutover):**

- Real Mozambique contact list (3 rows minimum: 1 country admin + ≥2 agents) — pasted into `.planning/rollout-contacts.csv` (gitignored)
- Confirmation that he wants Group Sales / Martin Cox / Anele / Joyce as the defaults predict (or per-question divergence)
- Time slot for the live cutover ceremony (≤30 min synchronous)

**Real-production actions deferred (next session, William present):**

- Wire Resend as Supabase Auth SMTP + whitelist accept-invite redirect URL
- Create `paratusgroup` GitHub org under `para.group.n8n@gmail.com`
- Confirm 11 Phase-6 carry-over env vars in Vercel Production + Preview
- Run `provision-users.ts --country=MZ` against production Supabase
- Smoke-test agent + country-admin seats + cross-tenant 403
- Flip form-side webhook (Path 2 — n8n bridge) for MZ
- Observe first real lead end-to-end
- Tick items 1–8 of `docs/CUTOVER.md` Mozambique section

**Wave 1 deliverables already on `main`:**

- `provision-users.ts` bulk-invite script (gitignored CSV input, `--dry-run` + `--country=<CC>` flags, idempotent re-runs)
- React Email invite template (paratus-blue + accent-orange, mirrors SLA template)
- 5 vitest cases authored against hermetic local Supabase — **NOT executed** in this environment (Docker not installed). Verification deferred to next dev box with Docker, ahead of pilot run.
- Three role onboarding one-pagers (`docs/onboarding/{agent,country-admin,hq-admin}.md`, ≤600 words each)
- `docs/onboarding/loom-links.md` stub with placeholder anchor (find/replace target for plan 07-04)
- `docs/CUTOVER.md` — 12 country sections, 132 checkbox slots, Mozambique flagged `[PILOT]`
- `?` Help icon wired into `sales-rep-shell`, `country-admin-shell`, `hq-shell` (opens role-appropriate doc on GitHub in new tab)

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
- **Plan 06-02 — immutable audit log via migration 00015.** `audit_log` table + `record_audit(...)` SECURITY DEFINER RPC. RLS is **SELECT-only** — no INSERT/UPDATE/DELETE policies → mutations are impossible from any non-service-role caller; writes only via the RPC (which preserves `auth.uid()` / `auth.jwt()` from the calling cookie session). HQ admins see all rows; country admins see rows where their JWT `country_code` is `ANY (visible_to_country_codes)`; agents see zero rows by construction (no policy matches `user_role='agent'`). All policies wrap `auth.jwt()` in `(SELECT ...)` for InitPlan caching and add `TO authenticated`.
- **Plan 06-02 — `visible_to_country_codes text[]`, not two rows for cross-country reassign.** When HQ moves a lead from `MZ` to `BW`, ONE audit row is written with `visible_to_country_codes=['MZ','BW']` so both country admins see it (RLS uses `= ANY(array)`). For same-country writes the array is `[country_code]`. Single source of truth — auditing a row twice would risk drift between the two copies.
- **Plan 06-02 — audit write failure is non-blocking.** Each of the 5 wired routes (reassign + 4 queue outcomes) wraps `recordAudit(...)` in `try/catch` after the primary RPC succeeds and structured-logs `{ event: 'audit_write_failed', action, targetId, message }` on failure. The primary 200/204 still lands. Pilot metric to watch: ratio of `audit_write_failed` log lines to total audited writes (target = 0).
- **Plan 06-02 — IP hashing, never raw IP.** `ip_hash` column stores `sha256(first(x-forwarded-for) || IP_HASH_SALT)`. The salt is per-deploy env (`IP_HASH_SALT`); rotating it deliberately breaks correlation across rotations — the desired privacy posture. Documented in `.planning/phases/06-production-hardening/06-USER-SETUP.md` section 2. DAL helper `hashIpAddress(ip)` strips the proxy chain (first `x-forwarded-for` chunk only).
- **Plan 06-02 — `computeDiff(before, after)` over field-level snapshots, not whole rows.** The `diff jsonb` column stores `{ field: { before, after } }` for changed fields only. Avoids whole-row PII surface and keeps the column from bloating. Each route picks the 1-2 columns that the action mutates (assigned_to for reassign, status + last_outcome for complete, call_attempts for no_answer, first_contacted_at for contact, scheduled_for for callback).
- **Plan 06-02 — audit page is a Server Component; no realtime, offset pagination at 50/page.** Server-fetched via `getAuditLog(...)`; RLS does the visibility split. Filter pills + `<details>` drill-down (zero JS for the diff). Audit volume is low and reads must be authoritative — realtime broadcast would add complexity for no user benefit. Cursor migration deferred to Phase 7 if pilot soak shows >50 audits/day per country.
- **Plan 06-02 — sidebar nav added to `apps/web/app/_lib/nav.ts`, not a per-route file.** The country-admin shell already delegates to `countryAdminNav(...)`. Adding "Audit" between "Leads" and "Settings" is one edit — building a parallel nav source for one new entry would have introduced drift.
- **Plan 06-02 — RLS isolation pinned by an integration test that doesn't need a BW admin user.** The `country-admin.routes.test.ts` precedent (skip-with-warn for missing test users) doesn't apply here — the contract `country admins see only their country` is enforceable with the available users by combining "agent sees 0 rows" + "MZ admin sees their MZ row" + "anon sees 0 rows". Future BW-admin seed (when it lands for other tests) will add a positive cross-country negative. (Closed by plan 06-05's `01_test_users.sql` seed — the BW admin now exists.)
- **Plan 06-05 — `/api/health` 503s when `db_ms > 500` or DB call errors.** Latency ceiling pages on-call instead of silently degrading. UptimeRobot 5-min synthetic monitor wired against the URL; alerts go to `para.group.n8n@gmail.com` + William's address. `Cache-Control: no-store` so caches never serve stale health data; `commit` in body doubles as deploy-confirmation.
- **Plan 06-05 — `SENTRY_AUTH_TOKEN` is build-only, never runtime.** Source-map upload runs at Vercel build only; the token never appears in a runtime env. Marked Sensitive + Build-scope. Without it, production stack traces show minified code (RESEARCH pitfall 8).
- **Plan 06-05 — Sentry session replay disabled in v1** (`replaysSessionSampleRate: 0`, `replaysOnErrorSampleRate: 0`). Privacy posture (PII visible in the leads queue) + cost ceiling. Revisit when retainer scope justifies the spend.
- **Plan 06-05 — `tracesSampleRate: 0.1`** (10 % traces). Enough to spot regressions, cheap on the Sentry quota for a pilot. Sentry init is inert without DSN — dev sessions without a Sentry project still work normally.
- **Plan 06-05 — CSP `connect-src` extended with `https://*.ingest.sentry.io`.** Otherwise client-side captures are blocked by the security header.
- **Plan 06-05 — Hermetic vitest via local `supabase start`.** Closes the chained-suite Supabase auth rate-limit (4 magiclinks/hour/email). `supabase/config.toml` pins `project_id = paratus-group-dashboards` to avoid port collision; root `package.json` pins Supabase CLI to `2.98.1` so the seed-loading-order ambiguity stays stable across machines. Cold-boot is 60–90 s on a fresh machine; `hookTimeout` set to 120 s in `vitest.config.ts`.
- **Plan 06-05 — `VITEST_USE_CLOUD=1` escape hatch retained.** A developer iterating on a single test against the cloud project is a faster feedback loop than booting Docker; the escape hatch lets that case bypass `supabase start`.
- **Plan 06-05 — BW country admin added to `01_test_users.sql`.** Closes the 06-02 SUMMARY carry-over (the missing BW admin that prevented a positive cross-country negative). Future cross-country negative tests can now seat against this user.
- **Plan 06-05 — Honest RTO ≤1 h / RPO ≤24 h** (Supabase free tier, no PITR; tier checked live via `mcp__supabase-paratusgroup__get_organization` on 2026-05-04). Pro-tier upgrade is a Phase 7 line item if the pilot expands beyond a single country.
- **Plan 06-05 — Pre-pilot restore drill executed on local stack** (free-tier-friendly flavour 4.2-2 of the `BACKUP_RESTORE.md` recipe). Drill PASSED; logged in `BACKUP_RESTORE.md` with date + observed restore time + zero anomalies.
- **Plan 06-05 — Pilot country + ingestion path locked with William before T+0** (per RESEARCH q1; details captured in `06-USER-SETUP.md` section 6).
- **Plan 06-05 — 48-hour pilot soak passed.** Approved by user 2026-05-05 ("approved — phase 6 done"). Zero cross-country leakage; zero unresolved Sentry P1/P2 issues; ≥99.9 % UptimeRobot uptime; organic SLA email arrived within 60 s; audit log captured every gated write; queue page < 1.5 s on a real phone.
- **Plan 07-01 — bulk-invite engine ships as a CLI script, not a route.** `apps/web/scripts/provision-users.ts` runs from a developer machine with `SUPABASE_SERVICE_ROLE_KEY` in env. Per-row order is locked: createUser → upsert user_roles → generateLink → sendInviteEmail. The order closes the JWT-hook race (custom_access_token_hook reads public.user_roles; clicking the invite before the role row exists yields null claims and bounces to /unauthorized). Sequential `for…of` over rows (not `Promise.all`) keeps Resend free-tier ratelimit (10 req/sec) safe and makes failure attribution per-row trivial.
- **Plan 07-01 — `inviteUserByEmail` is permanently retired.** supabase/auth#2180 breaks re-invite for existing users. The script always uses `auth.admin.generateLink({ type: 'invite' })` + Resend send; works on first send AND on re-runs (the "user lost the email" recovery posture is intentional). Re-running the script on the same CSV produces zero net DB writes and one re-send per row.
- **Plan 07-01 — `INVITE_FROM_EMAIL` is OPTIONAL** with a documented fallback to `SLA_ALERT_FROM_EMAIL`. One Resend sender domain serves both transactional flows. The override exists for the case where William wants `welcome@` vs `alerts@` segmentation; provisioning a second env var by default would have been infrastructure for a thing nobody asked for.
- **Plan 07-01 — `__resetResendClientForTests` renamed → `__resetEmailClientForTests`** with a deprecation alias preserved. Now that `email.ts` has two send functions sharing one cached Resend client, the cache-reset helper's name leaks SDK detail. Old name still works so the SLA cron test (`apps/web/tests/sla.cron.test.ts`) keeps passing without an immediate edit.
- **Plan 07-01 — `papaparse` (not `csv-parse`) for the rollout CSV.** `papaparse` is already an `apps/web` dep (path-3 CSV importer at `/api/leads/import-csv`). Adding a parallel parser would duplicate surface for zero gain. The plan template said `csv-parse/sync`; existence-check + minimal-deps win.
- **Plan 07-01 — `tsx --require ./apps/web/scripts/_server-only-preload.cjs ...`** to launch the script. The script transitively imports `@repo/supabase/admin` and `@repo/supabase/lib/email`, both `import 'server-only'`. Plain tsx crashes at import. The preloader is a tiny CJS require-hook that aliases `server-only` → empty CJS module. Production Next builds enforce the boundary unchanged (Webpack/Turbopack still bind `server-only` to its real implementation). Same posture vitest's resolve.alias entry already takes for the test suite.
- **Plan 07-01 — `main(argv, overrides)` accepts an injected admin client.** The injection point exists exclusively for the JWT-hook ordering test (Task 3 case 3) — vitest spies on the same admin instance the script uses to assert that user_roles upsert resolves BEFORE generateLink fires. The CLI bootstrap path never passes overrides; production flow is unchanged.
- **Plan 07-01 — Tests live at `apps/web/scripts/__tests__/`** (not `apps/web/tests/`). The script is a build-tool boundary; keeping the test next to the source makes the locality clear and means a future migration of the runner config doesn't sweep them into the wrong lane. `vitest.config.ts` `include` extended to cover both paths.
- **Plan 07-02 — `ONBOARDING_BASE_URL` is a compile-time constant in `packages/ui/src/onboarding-urls.ts`,** not an env var. URL is public, never rotates; lifting it into Vercel config buys nothing and adds operational burden. Single source of truth for all three role shells; future repo-owner change is one constant edit.
- **Plan 07-02 — In-app `?` Help link points at the markdown one-pager,** never directly at a Loom URL. Re-recording a Loom never breaks the in-app link. Loom URLs live only in `docs/onboarding/loom-links.md` (filled by plan 07-04).
- **Plan 07-02 — `docs/CUTOVER.md` duplicates the 11-item checklist verbatim per country** (12 sections × 11 items = 132 boxes). Templating would have made plan 07-03's diff hard to review (which boxes did Mozambique tick?); verbose duplication keeps the audit trail per-country obvious. Mozambique marked `[PILOT]` and ordered first; the other eleven follow alphabetically.
- **Plan 07-02 — Onboarding one-pagers cap at 600 words and use UI labels only** (no `qualified` / `lead_events` / `outcome='won'`). Past-tense voice per the agent-copy memory. Loom slots render explicit prose ("Recording will be added during pilot cutover"), never `TODO:` markers — placeholders are themselves the contract.
- **Plan 07-02 — Three role-shell paths in the repo are NOT identical to the plan-template paths.** Actual: `(sales-rep)/_components/sales-rep-shell.tsx`, `(country-admin)/_components/country-admin-shell.tsx`, `(hq)/_components/hq-shell.tsx`. The plan template referenced `[country]/queue/_components/queue-shell.tsx` for the agent shell — file doesn't exist; sales-rep shell is shared across all sales-rep routes. Same intent honoured — three role shells, three help links.

## Recent commits (most recent first)

- `0c2367c` — test(07-01): provision-users.ts integration tests against hermetic stack
- `c5241e2` — feat(07-01): provision-users.ts bulk-invite script + tsx + CSV example
- `b0ecc94` — feat(07-01): React Email invite template + sendInviteEmail wrapper
- `9b161db` — docs(07-02): close plan — SUMMARY + STATE update
- `b4eb103` — feat(07-02): in-app sidebar Help link wired through all three role shells
- `eb7c61c` — docs(07-02): per-country cutover checklist (CUTOVER.md)
- `d86c3d3` — docs(07-02): three role onboarding one-pagers + Loom-links index
- `d91e2e9` — docs(06-05): RUNBOOK + BACKUP_RESTORE + PROJECT.md Phase 4-6 catch-up
- `e37ba6c` — chore(06-05): document Sentry + IP_HASH_SALT in env example + USER-SETUP
- `cdb57f1` — feat(06-05): hermetic vitest via local Supabase stack
- `c4411a0` — feat(06-05): Sentry instrumentation + source-map upload wiring
- `447ed6a` — feat(06-05): /api/health DB probe + db_ms latency reporting
- `c618975` — docs(06-02): close plan — SUMMARY + STATE update
- `3fa5641` — docs(06-01): close plan — SUMMARY + USER-SETUP + STATE update
- `7bffb03` — docs(06-03): close plan — SUMMARY + USER-SETUP + STATE update
- `fa04ddc` — docs(06-04): close plan — SUMMARY + STATE update
- `046b6a9` — feat(06-01): SLA breach cron route + vercel cron schedule + integration test
- `2ee1979` — feat(06-01): migration 00014 — SLA breach detection schema + Resend wrapper + email template
- `9cf90c8` — feat(06-03): Upstash rate-limit on auth + ingest paths; converge to createAdminClient
- `92b8b55` — feat(06-03): migrations 00016 + 00017 — RLS InitPlan caching + broadcast lockdown
- `ab09c78` — chore(06-03): rename middleware.ts to proxy.ts (Next.js 16)
- `0a4e37d` — feat(06-02): wire audit hooks + viewer page + sidebar nav + tests
- `1544d3e` — feat(06-02): migration 00015 — audit_log + record_audit RPC + DAL
- `6810d85` — feat(06-04): country-admin range picker + no-answer e2e timeout + E2E env doc
- `7d5832e` — refactor(06-04): consolidate stat tile to single MetricCard primitive
- `86129f7` — feat(06-04): cursor pagination on country-admin lead list

(The Phase 6 close-out commit `docs(06-05): close phase 6 — SUMMARY + PHASE-SUMMARY + STATE update` lands in the same write as this STATE update; refresh the table after the commit if reading on disk.)
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
- Supabase project ref: `tgswsdfaszvztbpczfve` (region: West EU / Ireland) — migrations 00001–00018 applied (plus patch `country_admin_fix_leads_assigned_window` from 04-01). Plan 06-01 added 00014 (SLA breach view + dedupe RPC); plan 06-02 added 00015 (audit_log); plan 06-03 added 00016 (Phase 1 RLS InitPlan caching) + 00017 (broadcast trigger function REVOKE); plan 06-04 added 00018 (cursor index on leads). Tier: free (RPO ≤24 h, no PITR — see `docs/BACKUP_RESTORE.md`).
- Vercel team: `paratusgroup` / project `paratus-group-dashboards`
- GitHub: https://github.com/Robofish89/paratus-group-dashboards (private)

## Working tree status at last update

All five Phase 6 plans (06-01 → 06-05) shipped on `main`. The 48 h pilot soak passed and the user signed off "approved — phase 6 done" on 2026-05-05. `phase-6-complete` tag staged locally; push pending explicit user approval (same posture as `phase-2`/`phase-3`/`phase-4`/`phase-5`).

## Next move

**Phase 7 in progress.** Plan 07-02 (onboarding docs + cutover checklist + in-app Help link) shipped on `main`. Plan 07-01 (bulk-invite engine) appears in flight (uncommitted artifacts on the working tree — `apps/web/scripts/`, `packages/supabase/src/lib/emails/invite.tsx`, `.planning/rollout-contacts.csv.example`); needs its own close-out commit before plan 07-03. Next is `/gsd:execute-plan 07-03` (Mozambique pilot cutover) once 07-01 lands.

What landed in Phase 6:

- **Plan 06-01** — SLA breach detection: per-minute Vercel cron + Resend wrapper + React Email template + `v_sla_breaches` view + `mark_sla_alerted` RPC + dedupe column. 60-second alert latency budget. Organic breach observed during the soak — email arrived within 60 s; subsequent crons did not re-alert.
- **Plan 06-02** — Immutable audit log: `audit_log` table with SELECT-only RLS (no INSERT/UPDATE/DELETE policies; mutations only via SECURITY DEFINER `record_audit` RPC); `visible_to_country_codes text[]` for cross-country reassign; IP hashing via `sha256(ip || IP_HASH_SALT)`; field-level diff snapshots; non-blocking audit hooks on 5 write routes; audit viewer at `/{country}/audit`.
- **Plan 06-03** — Production hardening sweep: Next.js 16 `middleware → proxy` rename; three Phase 1 `user_roles` policies wrapped for InitPlan caching (00016); three `broadcast_lead_to_*` trigger functions REVOKE'd (00017); Upstash sliding-window rate-limit on auth (5 req/60s/IP) + ingest (60 req/60s/secret-hash); `createServiceRoleClient` → `createAdminClient` convergence; six security headers verified.
- **Plan 06-04** — UX/scale carry-overs: cursor pagination over composite index `leads_created_at_id_desc_idx` (00018); single `MetricCard` primitive in `@repo/ui` backing all three dashboards; range-picker UI on country-admin overview; sales-rep no-answer 3× e2e flake fix; `.env.local.example` documents `E2E_AUTH_ENABLED` + `.next` cache restart cadence.
- **Plan 06-05** — Operations gating: `/api/health` DB probe (503s when `db_ms > 500`); Sentry instrumentation with build-time source-map upload; hermetic vitest via local `supabase start`; BW country admin added to `01_test_users.sql` (closes 06-02 SUMMARY carry-over); `docs/RUNBOOK.md` + `docs/BACKUP_RESTORE.md` shippable to William; honest RTO ≤1 h / RPO ≤24 h on free tier; pre-pilot restore drill PASSED; pilot country + ingestion path locked with William; **48 h pilot soak passed**.

Phase 6 closed every Phase 1–5 carry-over either in code or via explicit deferral with rationale. Full close-out details in `06-production-hardening/PHASE-SUMMARY.md`.

**Carry-overs into Phase 7** (not blockers — pilot is stable):

- **Conversion-rate comparator window** (week-over-week vs month-over-month) — RESEARCH q4 still open.
- **HQ sidebar stubs → real surfaces** (`/countries`, `/service-mix`, `/settings`).
- **Supabase advisor low-priority entries:** `auth_leaked_password_protection` (admin-flip via dashboard), `function_search_path_mutable` on three SECURITY DEFINER functions, `multiple_permissive_policies` consolidation across `leads` / `lead_events` / `callbacks` / `audit_log` / `user_roles`.
- **Pro-tier Supabase upgrade** — required for PITR (RPO < 24 h) and branches (cleaner restore-drill flavour). Cost-benefit decision lands when pilot expands beyond a single country.
- **`leads_by_service_group` cap to top-N**, sortable headers on the country leaderboard, P75 series toggle on the speed-to-lead trend.
- **Per-minute Vercel cron cost** — switch to `*/2 * * * *` if the steady-state shows up on the bill.
