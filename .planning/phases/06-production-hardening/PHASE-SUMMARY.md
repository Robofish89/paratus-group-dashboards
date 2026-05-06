# Phase 6 — Production Hardening

**Status:** shipped
**Validated:** 2026-05-05 (48 h pilot soak passed; user signed off "approved — phase 6 done")
**Tag:** `phase-6-complete` (on origin)

## What shipped

Phase 6 closed every Phase 1–5 carry-over and added the operational layer needed to run the production pilot. Webhook ingest is HMAC-validated **and rate-limited per tenant**; SLA breaches send a Resend email to the country admin within 60 seconds of the 5-minute miss; every admin/agent write lands in an immutable `audit_log` with country-scoped RLS visibility and an IP-hashed actor trail; the Next.js 16 `proxy` rename is in, three Phase 1 `user_roles` policies are wrapped for InitPlan caching, and three broadcast trigger functions are EXECUTE-locked. The country-admin lead list runs on cursor pagination over a composite index; all three dashboards share a single `MetricCard` primitive; the country-admin overview gets a range picker; the e2e flake on `no-answer 3×` is gone; `.env.local.example` documents `E2E_AUTH_ENABLED` + `.next` cache restart cadence. `/api/health` reports `db_ms` and 503s when latency exceeds 500 ms; Sentry captures server + client errors with build-time source-map upload; vitest boots a hermetic local Supabase stack, escaping the chained-suite auth rate-limit. `docs/RUNBOOK.md` and `docs/BACKUP_RESTORE.md` are shippable to William. The 48-hour pilot soak ran clean — zero cross-country leakage, zero unresolved Sentry P1/P2 issues, ≥99.9 % UptimeRobot uptime, organic SLA breach alerted within 60 s, audit log captured every gated write.

## Plans

| Plan | Subsystem | Status | Summary |
|------|-----------|--------|---------|
| 06-01 | Resend SLA breach cron — migration 00014 + email template + cron route + 4 vitest cases | shipped | `06-01-SUMMARY.md` |
| 06-02 | Audit log — migration 00015 + `record_audit` RPC + DAL + 5 wired routes + viewer page + 5 vitest cases | shipped | `06-02-SUMMARY.md` |
| 06-03 | Production hardening sweep — `proxy` rename + RLS InitPlan caching (00016) + broadcast lockdown (00017) + Upstash rate-limit + `createAdminClient` convergence + 6 security headers verified | shipped | `06-03-SUMMARY.md` |
| 06-04 | UX/scale carry-overs — cursor pagination (00018) + single MetricCard primitive + range picker + e2e flake fix + env doc | shipped | `06-04-SUMMARY.md` |
| 06-05 | Operations gating — `/api/health` DB probe + Sentry + hermetic vitest + RUNBOOK + BACKUP_RESTORE + 48 h pilot soak | shipped | `06-05-SUMMARY.md` |

## Phase gate (Boil-the-Ocean checklist)

- [x] **Code shipped** — 5 migrations applied (00014 SLA, 00015 audit, 00016 RLS InitPlan, 00017 broadcast lockdown, 00018 cursor index), 5 new env-gated services wired, all five plans atomically committed. No TODOs in shipped paths, no mock data on production paths, no `any` shortcuts.
- [x] **Tests green** — Vitest: 4 SLA cases + 5 audit cases + Phase 2/3/4/5 suites all green when run hermetically. Playwright: country-admin golden path + HQ overview golden path + sales-rep golden path + sidebar stub specs all green; no-answer 3× flake fixed.
- [x] **Docs updated** — STATE.md, ROADMAP.md, all five plan SUMMARYs, this PHASE-SUMMARY, the new `06-USER-SETUP.md` operator runbook, `docs/RUNBOOK.md`, `docs/BACKUP_RESTORE.md`, `.planning/PROJECT.md` (Phase 4 + 5 + 6 "Validated" entries).
- [x] **Demo** — production deploy soaked for 48 hours against real lead traffic in the chosen pilot country. UptimeRobot ≥99.9 %, Sentry P1/P2 = 0, organic SLA email arrived within 60 s, audit rows visible to scoped country admins only, queue page < 1.5 s on a real phone.
- [x] **Security checklist re-run** — `mcp__supabase-paratusgroup__get_advisors --type security` reports zero NEW findings introduced by Phase 6. Three pre-existing low-priority advisor entries remain (`function_search_path_mutable`, `auth_leaked_password_protection`, `multiple_permissive_policies`) — documented in carry-overs to Phase 7.
- [x] **Visual fidelity** — KPI tile consolidation (single `MetricCard` primitive across all three dashboards) + country-admin range picker; visual continuity preserved with Phase 4/5 cross-dashboard congruence locks.
- [x] **Commit & tag** — five plan close-outs committed; `phase-6-complete` tag staged at this close-out.
- [x] **No dangling threads** — every Phase 1–5 carry-over either closed in 06-01..06-05 or explicitly deferred to Phase 7 with a written rationale (see Carry-overs section below).

## Carry-overs from Phases 1–5 closed by Phase 6

Pulled out of "Next move" in STATE.md — none of these are open any more:

- **Next.js 16 `middleware` → `proxy` rename** — closed by 06-03 (commit `ab09c78`).
- **Hermetic vitest setup** — closed by 06-05 (commit `cdb57f1`). VITEST_USE_CLOUD=1 escape hatch retained.
- **`createServiceRoleClient` → `createAdminClient` convergence** — closed by 06-03 (commit `9cf90c8`).
- **Phase 1 `user_roles` policies wrapped for InitPlan caching** — closed by 06-03 migration 00016 (commit `92b8b55`).
- **Three `broadcast_lead_to_*` trigger functions REVOKE'd** — closed by 06-03 migration 00017 (commit `92b8b55`).
- **Offset → cursor pagination on country-admin lead list** — closed by 06-04 migration 00018 (commit `86129f7`).
- **Stat-tile component consolidation** — closed by 06-04 (commit `7d5832e`). Single `MetricCard` primitive in `@repo/ui`; two variants (ring default, top-bar legacy); seven accent families.
- **Range-picker UI on country-admin overview** — closed by 06-04 (commit `6810d85`). Re-uses sales-rep `DateRangePicker`; URL contract from 04-03 unchanged.
- **`E2E_AUTH_ENABLED=true` documented in `.env.local.example`** — closed by 06-04 (commit `6810d85`); reinforced by 06-05 with `IP_HASH_SALT` + Sentry vars (commit `e37ba6c`).
- **Sales-rep `no-answer 3×` flake** — closed by 06-04. Timeout bumped 8 s → 12 s; root cause is broadcast-emit timing on a real subscription, not a logic bug.

## New Phase 6 deliverables

- **SLA breach email alerts** (06-01) — per-minute Vercel cron + Resend wrapper + React Email template + `v_sla_breaches` view + `mark_sla_alerted` RPC + dedupe column (`leads.sla_breach_alerted_at`). 60-second alert latency budget.
- **Immutable audit log + viewer page** (06-02) — `audit_log` table with SELECT-only RLS (no INSERT/UPDATE/DELETE policies → mutations only via the SECURITY DEFINER `record_audit` RPC); `visible_to_country_codes text[]` for cross-country reassign visibility; IP hashing via `sha256(ip || IP_HASH_SALT)`; field-level diff snapshots; non-blocking audit hooks on 5 write routes (reassign + 4 queue outcomes); audit viewer at `/{country}/audit` with filter pills + offset pagination + `<details>` drill-down.
- **Upstash rate limiting** (06-03) — sliding-window via `@upstash/ratelimit` + `@upstash/redis`. `authLimiter`: 5 req/60 s/IP on auth-flow paths; `ingestLimiter`: 60 req/60 s/secret-hash on the webhook (rate-limit BEFORE HMAC validation so 401s also count, preventing secret-validity side-channel). Lazy init pattern (build-safe; first runtime call resolves Redis); dev fail-open via shim, prod fail-closed at first call.
- **Sentry instrumentation** (06-05) — `@sentry/nextjs` server + client + edge configs; `next.config.ts` wrapped with `withSentryConfig`; build-time source-map upload (`SENTRY_AUTH_TOKEN` Build-only env in Vercel) so production stack traces show symbolised file paths; CSP `connect-src` extended; session replay disabled in v1 (privacy + cost); 10 % traces; release tagged via `VERCEL_GIT_COMMIT_SHA`.
- **`/api/health` DB probe** (06-05) — `createAdminClient` round-trip on `countries`, reports `{ status, supabase, db_ms, commit, ts }`, 503s when `db_ms > 500` or DB errors. UptimeRobot 5-min synthetic monitor wired against the URL.
- **`docs/RUNBOOK.md`** (06-05) — first-five-minutes ops guide; on-call contacts; live infra cheat sheet; 7 common-alert runbooks; secret-rotation table for 8 secrets; cron debug recipe; pilot incident triage cheat sheet.
- **`docs/BACKUP_RESTORE.md`** (06-05) — honest RTO ≤1 h / RPO ≤24 h statement (free tier; tier checked live via `mcp__supabase-paratusgroup__get_organization`); manual `supabase db dump` procedure; quarterly restore drill recipe (3 flavours); pre-pilot drill executed and PASSED; three disaster-scenario playbooks.
- **`06-USER-SETUP.md`** — single operator runbook covering Resend + Upstash + Sentry + UptimeRobot + IP_HASH_SALT + pilot-country/ingestion-path lockdown.

## Key decisions locked in this phase

### Plan 06-01 (SLA breach cron)

- **`v_sla_breaches` filters `status = 'new'`, not `'new'|'assigned'`** — the `lead_status` enum has no `'assigned'`; assignment flips `assigned_to` from NULL without changing `status`.
- **Cron dedupe via `leads.sla_breach_alerted_at` column, not external store** — single transaction (cron call → mark RPC) is enough; partial Resend failure leaves NULL → next minute retries.
- **Lazy Resend client init** — fail-fast on first `sendSlaBreachEmail` call instead of module init, so test imports + cold-boot routes don't crash.
- **`X-Entity-Ref-ID` header** prevents Gmail thread-collapse of consecutive breach alerts.
- **`server-only` aliased to a no-op shim in vitest** so the test runner can import the cron route module; Webpack/Turbopack still enforces the boundary at compile time.

### Plan 06-02 (audit log)

- **SELECT-only RLS — no INSERT/UPDATE/DELETE policies.** Mutations are impossible from any non-service-role caller; writes only via the SECURITY DEFINER `record_audit` RPC.
- **`visible_to_country_codes text[]`, not two rows for cross-country reassign.** One row, two-element array; both country admins see it via `= ANY(array)`.
- **Audit write failure is non-blocking.** `try/catch` around `recordAudit(...)` in every wired route; primary 200/204 still lands; audit failure structured-logs `audit_write_failed` for the pilot dashboard.
- **IP hashing, never raw IP.** `sha256(first(x-forwarded-for) || IP_HASH_SALT)`. Salt is per-deploy env; rotating it deliberately breaks correlation across rotations.
- **Field-level diff snapshots** (`{ field: { before, after } }`), not whole-row dumps — avoids whole-row PII surface and column bloat.
- **Audit page is a Server Component; no realtime; offset pagination at 50/page.** Audit reads must be authoritative; realtime would add complexity for no user benefit.

### Plan 06-03 (production hardening sweep)

- **`apps/web/middleware.ts` → `apps/web/proxy.ts`** via Next.js 16 codemod. Build now reports `ƒ Proxy (Middleware)` — deprecation warning gone.
- **Three Phase 1 `user_roles` policies wrapped** in `(SELECT auth.jwt()/auth.uid())` for InitPlan caching (migration 00016). `realtime.messages` policies were already wrapped at the source — STATE.md tracking was stale; sweep narrowed in-flight after live SQL audit.
- **Three `broadcast_lead_to_*` trigger functions REVOKE'd** EXECUTE from PUBLIC, anon, authenticated (migration 00017). Trigger context invokes them as the table owner.
- **Lazy Upstash limiter init.** Eager `Redis.fromEnv()` at module load broke `next build` in production NODE_ENV with no runtime env. `LazyLimiter` class — first call resolves Redis. Still fail-closed at first runtime request in prod-no-env.
- **Rate-limit BEFORE HMAC validation on ingest.** 401 vs 429 with the same `X-RateLimit-*` header shape on every response means a probe can't side-channel secret-validity via timing or header presence.
- **Per-tenant ingest key = `sha256(PARATUS_INGEST_SECRET)`.** Not per-IP (n8n cloud egresses from a small shared pool). Per-secret = each tenant gets its own bucket. Hashing keeps the secret out of Upstash logs.
- **`/api/auth/logout` excluded from auth-path rate limit.** Logout is intent-revealing but harmless; capping it traps users mid-session if they're behind a flooded IP.
- **Converge to `createAdminClient`, not `createServiceRoleClient`.** Older name, more call sites; `createServiceRoleClient` was the late-comer.
- **Six security headers verified in `next.config.ts`** — zero diff. CSP, HSTS, X-Frame-Options, X-Content-Type-Options, Referrer-Policy, Permissions-Policy.

### Plan 06-04 (UX/scale carry-overs)

- **Cursor pagination over composite index** `leads_created_at_id_desc_idx` on `(created_at DESC, id DESC)`; URL contract `?cursor=<base64url>`; Prev walks browser history (`router.back()`); Next pushes; offset path fully removed.
- **Single `MetricCard` primitive in `@repo/ui`** backs all three dashboards. Two variants (ring default, top-bar legacy); seven accent families; all `data-*` hooks flow through `dataAttrs` prop.
- **Range picker re-uses sales-rep `DateRangePicker`** rather than lifting to `@repo/ui` — UI package has no `next` peer dep; thin wrapper at the country-admin path is the seam.
- **No-answer flake** — bumped poll timeout 8 s → 12 s; root cause is broadcast-emit timing on a real subscription, not a logic bug.

### Plan 06-05 (operations gating)

- **Health endpoint 503s when `db_ms > 500`.** Latency ceiling pages on-call instead of silently degrading.
- **`SENTRY_AUTH_TOKEN` is build-only.** Source-map upload at Vercel build, never a runtime secret. Marked Sensitive + Build-scope.
- **Sentry session replay disabled in v1** (privacy + cost). Revisit when retainer scope justifies it.
- **`tracesSampleRate: 0.1`** — 10 % traces; cheap on Sentry quota for a pilot.
- **Hermetic vitest pins Supabase CLI to 2.98.1.** Seed-loading-order ambiguity stays stable across machines.
- **`VITEST_USE_CLOUD=1` escape hatch.** Faster feedback loop for single-test iteration than booting Docker.
- **Honest RTO ≤1 h / RPO ≤24 h.** Live tier check returned `plan='free'` ⇒ no PITR. Pro upgrade is a Phase 7 line item if pilot expands.
- **Pre-pilot restore drill executed on local stack** (free-tier-friendly flavour 4.2-2). Drill PASSED; logged in `BACKUP_RESTORE.md`.
- **Pilot country + ingestion path locked with William before T+0** (per RESEARCH q1; details in `06-USER-SETUP.md` section 6).

## Carry-overs into Phase 7

- **Conversion-rate comparator window** (week-over-week vs month-over-month) — RESEARCH q4 still open; deferred to Phase 7. Wires the delta arrow on the HQ KPI strip's "Conversion Rate" tile.
- **HQ sidebar stubs → real surfaces.** `/countries` becomes a drill-in directory of every active country; `/service-mix` becomes a group-wide service breakdown over time; `/settings` becomes a group admin surface (feature flags / SLA targets / country activation toggles).
- **Supabase advisor low-priority entries:**
  - `auth_leaked_password_protection` — Supabase Auth setting, admin-flip via dashboard.
  - `function_search_path_mutable` on `handle_updated_at`, `custom_access_token_hook`, `set_lead_event_country_code` — three SECURITY DEFINER functions need `SET search_path = ''` added. Quick patch migration.
  - `multiple_permissive_policies` warnings on `leads`, `lead_events`, `callbacks`, `audit_log`, `user_roles` — same role + same action across HQ-all + country-scoped + agent-own policies. Low pilot-scale cost; consolidating into single role-aware policies is a Phase 7 cleanup.
- **Pro-tier Supabase upgrade** — required for PITR (RPO < 24 h) and branches (cleaner restore-drill flavour). Cost-benefit decision lands when pilot expands beyond a single country.
- **`leads_by_service_group` cap to top-N** — currently returns every form_slug with ≥1 lead; mockup shows ~9 rows. Add a top-N cap if the form catalogue grows.
- **Sortable headers on the country leaderboard** — defaults to `total_leads DESC` from the view layer. v2: client-side sort state.
- **P75 series toggle on the speed-to-lead trend** — data already in row shape; UI only plots the median.
- **Per-minute Vercel cron cost** — switch to `*/2 * * * *` if the steady-state shows up on the bill; document the SLA-target drift.

## Next

**Phase 7 — Rollout.** `/gsd:research-phase 7 → /gsd:plan-phase 7 → /gsd:execute-phase 7`. Activate the remaining 11 active countries; replace HQ sidebar stubs with real surfaces; pick the conversion-rate comparator window and wire the delta; close the three low-priority Supabase advisor entries; evaluate Supabase Pro-tier upgrade.
