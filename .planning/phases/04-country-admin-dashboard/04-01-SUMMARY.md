---
phase: 04-country-admin-dashboard
plan: 01
status: shipped
shipped_at: 2026-05-04
subsystem: db/country-admin-foundation
tags: [supabase, postgres, view, rpc, rls, security-definer, vitest]

# Dependency graph
requires:
  - phase: 02-data-model-ingestion
    provides: leads / lead_events / callbacks tables; country_code RLS; lead_event_type enum (incl. `reassigned`); BEFORE INSERT trigger on lead_events.country_code
  - phase: 03-sales-rep-queue
    plan: 01
    provides: SECURITY DEFINER pattern (search_path locked, REVOKE public/anon, GRANT EXECUTE authenticated); JWT custom-claim convention (`user_role`, `country_code`)
  - phase: 03-sales-rep-queue
    plan: 04
    provides: agent_today_stats LEFT-JOIN-from-anchor shape (mirrored for country-scoped views); agent_stats_in_range single-row range RPC pattern
provides:
  - migration-00011-country-admin
  - country-today-stats-view
  - leads-by-service-today-view
  - status-pipeline-today-view
  - country-speed-to-lead-today-view
  - country-stats-in-range-rpc
  - agent-performance-in-range-rpc
  - speed-to-lead-series-rpc
  - reassign-lead-rpc
  - cross-country-defence-in-depth-guard
affects:
  - 04-country-admin-dashboard (plans 04-02, 04-03)
  - 05-hq-overview
---

# 04-01 — Country Admin DB Foundation

## What shipped

**Migration:** `packages/supabase/migrations/00011_country_admin.sql` (applied to project `tgswsdfaszvztbpczfve`).

**4 views (`security_invoker = true`, granted SELECT to `authenticated`):**
- `country_today_stats` — one row per active country with today + yesterday counts for total, new, contacted, converted, lost. Drives the 5 KPI tiles + vs-yesterday delta in a single read.
- `leads_by_service_today` — `(country_code, form_slug, leads_count)` for today's leads. Drives the leads-by-service horizontal bar chart.
- `status_pipeline_today` — `(country_code, status, count)` across the full `lead_status` enum (incl. `qualified` for analytics back-compat). Drives the funnel.
- `country_speed_to_lead_today` — gauge tile per country (total_contacted, on_target_count within 5 min, on_target_pct, avg_response_seconds). Operates only over leads where `first_contacted_at IS NOT NULL` — NULL policy spelled out in SQL header.

**4 RPCs (`SECURITY DEFINER`, locked `search_path = public, pg_temp`, REVOKE from public/anon, GRANT EXECUTE to authenticated):**
- `country_stats_in_range(p_country, p_from, p_to)` — range-aware status counts (converted/lost/contacted/new). country_admin pinned to JWT `country_code`; hq_admin allowed any.
- `agent_performance_in_range(p_country, p_from, p_to)` — one row per agent (LEFT JOIN from `user_roles WHERE role='agent'`). Zero-work agents still show. Returns leads_assigned / contacted / converted / lost / avg_response_seconds, all windowed.
- `speed_to_lead_series(p_country, p_from, p_to)` — per-day P50/P75 of seconds-to-first-contact, in country tz. Source for the sparkline.
- `reassign_lead(p_lead_id, p_to_agent_id)` — atomic mutation + audit event. Role guard (country_admin or hq_admin) + country-scope guard + cross-country target guard (defence-in-depth) + not_found.

**Tests:** `apps/web/tests/country-admin.rpcs.test.ts` — 11 vitest cases, all green. Service-role used only for fixture seed/teardown; assertion paths run from anon-key clients carrying real user JWTs (magiclink-cookie technique) so RLS + RPC inside-function guards are the thing under test.

## Test counts

| Surface | Cases |
|---|---|
| `country_today_stats` RLS visibility | 1 |
| `country_stats_in_range` (cross-country block, own-country success, HQ all-country) | 3 |
| `agent_performance_in_range` LEFT-JOIN inclusion | 1 |
| `speed_to_lead_series` NULL-filter | 1 |
| `reassign_lead` (happy path, role guard, country guard, cross-country target, not_found) | 5 |
| **Total** | **11** |

The plan called for 10 cases; case 2 was naturally split into the negative path (cross-country block) plus its positive twin (own-country success) for clearer assertion intent. All five `reassign_lead` shapes from the plan are covered.

## Key decisions

- **Median (P50) for the sparkline, average for the headline KPI tile.** `speed_to_lead_series` returns `median_seconds` and `p75_seconds` because the chart is sensitive to outliers — one stale lead getting its first call would explode an average and visually erase real performance trends. The KPI tile labelled "Avg Response Time" still reads `avg_response_seconds` from `country_speed_to_lead_today` because that's the literal label on the mockup. Asymmetry is intentional and documented in the SQL.

- **Speed-to-lead NULL policy: only leads where `first_contacted_at IS NOT NULL` count.** Including uncontacted leads in AVG/percentile would make the metric look artificially fast (Phase 4 RESEARCH.md pitfall 3). Documented at the top of the migration and in each function/view comment.

- **Defence-in-depth on `reassign_lead` cross-country target.** The function reads the target agent's `user_roles.country_code`. If it differs from the lead's country, raise `cross_country_assignment` (`42501`). For a country admin this is technically redundant (the JWT-country guard already fires earlier), but for an hq_admin — who has no country-scope check — it's the *only* thing stopping a cross-country zombie assignment ("lead assigned to a user who can't read it"). Caught by test 9, which had to mint a synthetic BW agent because the project has no second auth user provisioned.

- **`leads_assigned` is range-windowed** (`count(l.id) FILTER (WHERE l.created_at IN [p_from, p_to))`). The first cut counted the agent's lifetime assignments instead of the requested window — caught by the test, fixed in commit `aaba26e` and applied live as migration `country_admin_fix_leads_assigned_window`. The other four columns already filtered by the window; this restored symmetry.

- **JWT claim names: `user_role` / `country_code` (not `role` / `country`).** Phase 1's `custom_access_token_hook` injects those exact keys, and the `agent` role enum value (not `sales_rep`) is what `user_roles.role` stores. Plan template was written before that convention was finalised; every guard in 00011 reads the correct keys. Sales-rep role check inside `reassign_lead` rejects everything except `country_admin` / `hq_admin`.

- **Time zone: all "today" boundaries are calendar-day in country-local tz**, computed as `date_trunc('day', now() AT TIME ZONE c.timezone) AT TIME ZONE c.timezone`. Source: `countries.timezone` (seeded by migration 00004).

- **Status pipeline includes `qualified`** even though Phase 3 plan 03-04 made `complete_call` reject it. The enum value is preserved for analytics back-compat; the funnel renders five segments and the qualified column will simply read 0 going forward.

- **`country_speed_to_lead_today` coexists with `speed_to_lead_daily`** (00006). Different shapes, both kept: the daily view powers the multi-day chart; the today view powers the single-row gauge tile. Not collapsed into one to keep the gauge query a one-row pluck.

## Carry-overs for downstream plans

- **04-02 — Database type regen.** `Database` type in `@repo/supabase/types` does not yet know about migration 00011's views/RPCs. 04-02 should regenerate via the Supabase CLI (or `mcp__supabase-paratusgroup__generate_typescript_types`) and drop any `as never` casts where the country-admin DAL calls `.from('country_today_stats')` / `.rpc('reassign_lead')`. Same close-out pattern as plan 03-01 used for migration 00009.

- **04-02 / 04-03 — UI consumes the views/RPCs from this plan.** `country_today_stats` powers the 5 KPI tiles + delta. `leads_by_service_today` powers the bar chart. `status_pipeline_today` powers the funnel. `country_speed_to_lead_today` + `speed_to_lead_series` power the gauge + sparkline pair. `country_stats_in_range` swaps in for the range-aware tile (same two-source-stats split that Phase 3 locked). `agent_performance_in_range` drives the Sales Rep Performance table. `reassign_lead` is wired to the lead-list reassign action.

- **04-02 — Realtime channel.** Per the Phase 3 carry-forward, country admin reuses `usePrivateBroadcast<T>` with `topic: country:<code>`. The country-scope realtime broadcast triggers from `00008_realtime_broadcast.sql` already exist; no new DB work needed.

- **Advisor warnings unchanged.** The four new RPCs each emit the standard `0029_authenticated_security_definer_function_executable` warning — same heuristic that fires on every Phase 3 RPC (`mark_lead_contacted`, `complete_call`, `schedule_callback`, `record_no_answer`). This is the deliberate pattern: signed-in users *must* be able to call them, with JWT guards inside the function. No new violations.

## Commits

- `17cdf56` — feat(04-01): migration 00011 part 1 — country admin views
- `13ff45d` — feat(04-01): migration 00011 part 2 — country admin RPCs
- `aaba26e` — fix(04-01): window leads_assigned in agent_performance_in_range
- `91308cb` — test(04-01): country-admin RPCs + RLS gates

The fix commit corresponds to a live patch-migration `country_admin_fix_leads_assigned_window` already applied to `tgswsdfaszvztbpczfve`. Future fresh deployments rebuild from the corrected `00011_country_admin.sql` (the patch SQL is folded back into the source-of-truth file).
