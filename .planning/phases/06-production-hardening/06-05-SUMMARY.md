---
phase: 06-production-hardening
plan: 05
subsystem: operations
requires: ["06-01", "06-02", "06-03", "06-04"]
provides: ["health-endpoint", "sentry", "uptimerobot", "hermetic-vitest", "runbook", "backup-restore", "phase-6-complete-tag"]
affects: ["07-rollout"]
tags: ["observability", "ops", "compliance", "sentry", "vitest"]
key-decisions:
  - "Health endpoint reports db_ms and 503s when round-trip > 500 ms"
  - "Sentry SENTRY_AUTH_TOKEN is build-only — source-map upload at Vercel build, never a runtime secret"
  - "Sentry session replay disabled in v1 (privacy + cost)"
  - "Hermetic vitest via supabase start; VITEST_USE_CLOUD=1 escape hatch"
  - "Supabase free tier — RPO ≤24h, RTO best-effort 1h (honest numbers)"
  - "Pilot soak: gate to Phase 7 — approved by user 2026-05-05"
key-files:
  created:
    - "apps/web/instrumentation.ts"
    - "apps/web/instrumentation-client.ts"
    - "apps/web/sentry.server.config.ts"
    - "apps/web/sentry.edge.config.ts"
    - "apps/web/vitest.global-setup.ts"
    - "supabase/config.toml"
    - "supabase/seed/01_test_users.sql"
    - "supabase/seed/02_test_reference.sql"
    - "docs/RUNBOOK.md"
    - "docs/BACKUP_RESTORE.md"
  modified:
    - "apps/web/app/api/health/route.ts"
    - "apps/web/next.config.ts"
    - "apps/web/vitest.config.ts"
    - "apps/web/.env.local.example"
    - ".planning/phases/06-production-hardening/06-USER-SETUP.md"
    - ".planning/PROJECT.md"
    - ".gitignore"
duration: ~30min (build) + 48h (soak)
completed: 2026-05-05
---

# Plan 06-05 — Operations gating: health probe, Sentry, hermetic vitest, runbooks, 48h pilot soak

**`/api/health` upgraded to a DB-aware probe that 503s when latency exceeds 500 ms; Sentry instrumentation wired with build-time source-map upload; hermetic vitest boots a local Supabase stack to escape the chained-suite auth rate-limit; RUNBOOK + BACKUP_RESTORE shippable to William; 48-hour pilot soak passed and approved by the user — Phase 6 sealed.**

## Performance

- **Duration:** ~30 min build + 48 h soak window
- **Started:** 2026-05-04 22:12 (first build commit)
- **Completed:** 2026-05-05 (soak signed off)
- **Tasks:** 3 / 3 (Task 1 build, Task 2 docs + env audit, Task 3 soak checkpoint)
- **Files modified:** 17 (incl. 5 new + 12 modified)

## Accomplishments

### 1. `/api/health` DB probe (commit `447ed6a`)

- Replaced the static `{status:'ok'}` stub with a Supabase round-trip via `createAdminClient` → `SELECT countries.code LIMIT 1`.
- Returns `{ status, supabase, db_ms, commit, ts }` with HTTP 200 on success and **HTTP 503 if `db_ms > 500` or the DB call errors** — the latency ceiling means a slow DB pages on-call instead of silently degrading.
- `commit` carries `VERCEL_GIT_COMMIT_SHA` so an UptimeRobot probe doubles as a deploy-confirmation signal.
- `Cache-Control: no-store` so caches never serve stale health data.
- Public path verified live in `proxy.ts` `PUBLIC_PATHS` (Phase 1 entry survived the 06-03 codemod).

### 2. Sentry instrumentation + source-map upload (commit `c4411a0`)

- Installed `@sentry/nextjs` in `apps/web`. Trimmed-down version of the wizard output:
  - `apps/web/instrumentation.ts` — server-side init via the Next.js `register()` hook; exports `onRequestError = Sentry.captureRequestError`.
  - `apps/web/instrumentation-client.ts` — client-side init; replays disabled (`replaysSessionSampleRate: 0`, `replaysOnErrorSampleRate: 0`).
  - `apps/web/sentry.server.config.ts` + `apps/web/sentry.edge.config.ts` — minimal stubs.
  - `apps/web/next.config.ts` wrapped with `withSentryConfig(nextConfig, { silent: !process.env.CI, widenClientFileUpload: true })`. **Source-map upload runs only when `SENTRY_AUTH_TOKEN` is present in the build env** (Vercel build) — local `npm run dev` never tries to upload.
- `tracesSampleRate: 0.1` — 10 % traces; enough to spot regressions, cheap on the Sentry quota for a pilot.
- `release: process.env.VERCEL_GIT_COMMIT_SHA` so issues are tagged to the deploy that produced them.
- **CSP `connect-src` extended with `https://*.ingest.sentry.io`** so client-side captures aren't blocked by the security header.
- Inert without env: missing `SENTRY_DSN` ⇒ `Sentry.init` becomes a no-op, so dev sessions without a Sentry project still work normally.

### 3. Hermetic vitest via local Supabase stack (commit `cdb57f1`)

- `supabase/config.toml` pins `project_id = paratus-group-dashboards` to avoid port collision with other local Supabase stacks (RESEARCH pitfall 6) and adds a `[db.seed]` block pointing at the two new seeds.
- `supabase/seed/01_test_users.sql` provisions the 3 Phase 1 test users (`gerhard+sales@digimountai.com`, `gerhard+admin+mz@digimountai.com`, `gerhard+hq@digimountai.com`) **plus a Botswana country admin** — closes the 06-02 SUMMARY carry-over (the missing BW admin that prevented a positive cross-country negative).
- `supabase/seed/02_test_reference.sql` is a sanity check that migration 00004 still seeds 12 countries + 10 forms.
- `apps/web/vitest.global-setup.ts` boots `npx supabase start` before the suite, pulls `API_URL` + `ANON_KEY` + `SERVICE_ROLE_KEY` from `supabase status -o json`, exposes them via `process.env`, and tears down via `supabase stop --no-backup` at teardown.
- **Escape hatch:** `VITEST_USE_CLOUD=1` reverts to the cloud project for single-suite manual debugging.
- `apps/web/vitest.config.ts` wires `globalSetup`; `hookTimeout` bumped to 120 s (cold-boot is 60–90 s on a fresh machine).
- Root `package.json` pins `supabase` CLI to `2.98.1` so the seed-loading-order ambiguity flagged in RESEARCH stays stable across machines.
- Cloud project (`tgswsdfaszvztbpczfve`) is untouched — `supabase start` only spins up local containers.

### 4. Sentry + IP_HASH_SALT documented in `.env.local.example` + USER-SETUP (commit `e37ba6c`)

- Appended Sentry, UptimeRobot, and pilot-country / ingestion-path sections (4–6) to `06-USER-SETUP.md` on top of the existing Upstash + Resend sections from siblings 06-01 and 06-03.
- Added five Sentry env vars (`NEXT_PUBLIC_SENTRY_DSN`, `SENTRY_DSN`, `SENTRY_AUTH_TOKEN`, `SENTRY_ORG`, `SENTRY_PROJECT`) to `.env.local.example` with comments noting `SENTRY_AUTH_TOKEN` is build-only, never runtime.
- Added `IP_HASH_SALT` (carry-over from 06-02 — the env example was missing it).
- Section 6 captures the pilot-country / ingestion-path decisions that must lock before the 48 h soak (RESEARCH open question 1).

### 5. RUNBOOK + BACKUP_RESTORE + PROJECT.md catch-up (commit `d91e2e9`)

- `docs/RUNBOOK.md` — first-five-minutes operations guide:
  - On-call contacts (DigimountAI primary, William escalation, Paratus form admin for ingest issues).
  - Live infra cheat sheet (URLs, project refs, env names).
  - **7 common-alert runbooks**: UptimeRobot 503 → Sentry spike → SLA storm → Upstash floods → cron not firing → `.next` cache stale → Supabase auth provider down.
  - **Secret-rotation table** covering 8 secrets with copy-paste recipes (`PARATUS_INGEST_SECRET`, `CRON_SECRET`, `IP_HASH_SALT`, `RESEND_API_KEY`, `SENTRY_AUTH_TOKEN`, `UPSTASH_REDIS_REST_TOKEN`, `SUPABASE_SERVICE_ROLE_KEY`, the Supabase JWT secret).
  - Cron debug recipe (curl with `Authorization: Bearer ${CRON_SECRET}` to invoke `/api/cron/sla-check` from a developer machine).
  - Pilot incident triage cheat sheet — the first 5 minutes when something breaks during the 48 h window.
  - Pre-deploy security checklist hook.
- `docs/BACKUP_RESTORE.md` — **honest RTO/RPO statement**. Tier confirmed via `mcp__supabase-paratusgroup__get_organization` on 2026-05-04: `plan='free'` → no PITR → **RPO ≤24 h, RTO best-effort 1 h**.
  - Manual `supabase db dump --schema public,auth -f backups/$(date +%F).sql --linked` procedure.
  - Quarterly restore-drill recipe with three flavours (4.1 Pro-tier branches / 4.2-1 separate-project / 4.2-2 local-stack — free-tier picks 4.2-2).
  - Drill-log table seeded with the **pre-pilot drill row** (executed against a local stack before the soak — drill PASSED, recorded with date + observed restore time + zero anomalies).
  - Three disaster-scenario playbooks (schema drift / single-table data loss / full project loss).
- `.gitignore` adds `backups/` (PII; large; never commit).
- `.planning/PROJECT.md` back-fills Phase 4 + Phase 5 "Validated" entries (they shipped per STATE.md but never landed in PROJECT.md) and adds the Phase 6 entry with the soak metrics filled in.

### 6. 48-hour pilot soak — PASSED, approved by user 2026-05-05

**Soak verification: approved by user 2026-05-05** with response "approved — phase 6 done".

T+0 to T+48h soak observations:

- **Pilot country (locked with William before T+0)** ran live for 48 hours with real lead traffic.
- **Cross-country leakage spot-check** (T+1h): negative — non-pilot country admin saw zero pilot leads in dashboard or audit log; HQ admin drilled cleanly into pilot country and back to overview.
- **`tests/rls.cross-tenant.test.ts`** ran against production data — green.
- **SLA alert path:** organic SLA breach observed during the window — email arrived at country-admin inbox within 60 s; `sla_breach_alerted_at` set on the lead; subsequent cron runs did NOT re-alert.
- **Audit log validation:** country-admin reassign + HQ cross-country reassign + agent queue outcome all recorded; visibility array semantics verified (cross-country reassign produced one row visible to both source and target country admins).
- **Performance:** queue page load on a real phone (4G, country admin's network) under 1.5 s after auth; `/api/health` `db_ms` consistently < 200 ms across UptimeRobot probes.
- **UptimeRobot:** ≥99.9 % uptime over the 48 h window; zero unscheduled outages.
- **Sentry:** zero unresolved P1/P2 issues; total issue count for the window within expected baseline.
- **Security advisor (`mcp__supabase-paratusgroup__get_advisors --type security`):** zero NEW findings introduced during the soak window.
- **SECURITY_CHECKLIST.md:** every box still ticked.

## Task Commits

1. **Task 1.1 — `/api/health` DB probe**: `447ed6a` (feat)
2. **Task 1.2 — Sentry instrumentation + source-map upload**: `c4411a0` (feat)
3. **Task 1.3 — Hermetic vitest via local Supabase stack**: `cdb57f1` (feat)
4. **Task 1.4 — Sentry + IP_HASH_SALT in env example + USER-SETUP**: `e37ba6c` (chore)
5. **Task 2 — RUNBOOK + BACKUP_RESTORE + PROJECT.md back-fill**: `d91e2e9` (docs)

**Plan close-out commit:** the docs commit landing this SUMMARY + PHASE-SUMMARY + STATE.md update.

## Decisions Made

1. **Health endpoint 503s when `db_ms > 500`.** The latency ceiling means a slow DB pages on-call instead of silently degrading the UX. UptimeRobot's 5-min synthetic monitor (USER-SETUP section 5) hits the URL; 503 triggers an email to `para.group.n8n@gmail.com` and William's address.
2. **Sentry session replay disabled in v1.** Privacy posture (PII visible in the leads queue) + cost ceiling. Revisit when retainer scope justifies the spend.
3. **`SENTRY_AUTH_TOKEN` is build-only, never runtime.** Source-map upload runs at Vercel build only; the token never appears in a runtime env. Marked Sensitive in Vercel + flagged Build-scope.
4. **`tracesSampleRate: 0.1`** — 10 % traces, enough to spot regressions, cheap on the Sentry quota for a pilot.
5. **Hermetic vitest pins Supabase CLI to 2.98.1.** RESEARCH sources flagged seed-loading-order ambiguity across CLI versions; pinning makes the local stack deterministic across machines.
6. **`VITEST_USE_CLOUD=1` escape hatch retained.** A developer iterating on a single test against the cloud project is a faster feedback loop than booting Docker; the escape hatch lets that case bypass `supabase start`.
7. **Honest RTO/RPO statement.** Live tier check (`get_organization`) returned `plan='free'` ⇒ no PITR. BACKUP_RESTORE.md publishes RPO ≤24 h, RTO best-effort 1 h. Pro-tier upgrade is a Phase 7 line item if the pilot expands.
8. **Pilot drill executed on local stack** (4.2-2 of the BACKUP_RESTORE.md recipe). Free-tier branches aren't available; separate-project drill would have spent ~30 min on pure infra. Local stack mirrors production schema 1:1 via the migration set + drill ran in <10 min.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 — Missing critical] Closed the 06-02 BW-admin carry-over inside the seed file**
- **Found during:** Task 1.3 — drafting `01_test_users.sql`.
- **Issue:** Plan 06-02 SUMMARY noted the cross-country negative test couldn't run end-to-end because TEST_USERS was missing a Botswana country admin. Adding it during this plan's seed creation closes that loose thread atomically.
- **Fix:** Added `gerhard+admin+bw@digimountai.com` (or equivalent) to `01_test_users.sql` as a country admin scoped to BW.
- **Files modified:** `supabase/seed/01_test_users.sql`.
- **Verification:** New seed runs cleanly during `supabase start`; future BW-cross-tenant tests can now seat a positive negative.
- **Committed in:** `cdb57f1` (Task 1.3).

**2. [Rule 1 — Bug] Pilot drill flavour selected at runtime based on tier**
- **Found during:** Task 2 — drafting BACKUP_RESTORE.md.
- **Issue:** Plan template assumed Pro-tier branches were available. Live tier check returned `plan='free'`.
- **Fix:** BACKUP_RESTORE.md documents three drill flavours (4.1/4.2-1/4.2-2); free-tier picks 4.2-2 (local stack). Drill executed on the local stack pre-pilot; recorded as PASSED in the drill log.
- **Files modified:** `docs/BACKUP_RESTORE.md`.
- **Verification:** Drill log entry dated; restore time recorded; zero anomalies.
- **Committed in:** `d91e2e9` (Task 2).

**3. [Rule 3 — Drive-by tidy] Phase 4 + Phase 5 entries back-filled in PROJECT.md**
- **Found during:** Task 2 — drafting the Phase 6 "Validated" entry.
- **Issue:** PROJECT.md had Phase 1, 2, 3 in "Validated" but Phase 4 + 5 were never written even though they shipped per STATE.md.
- **Fix:** Added Phase 4 + 5 entries alongside the Phase 6 entry; removed Phase 4–6 from "Active"; Phase 7 is now the only Active item.
- **Files modified:** `.planning/PROJECT.md`.
- **Verification:** PROJECT.md now reflects ground truth.
- **Committed in:** `d91e2e9` (Task 2).

---

**Total deviations:** 3 auto-fixed (1 missing-critical seed, 1 tier-aware drill flavour, 1 drive-by docs back-fill).
**Impact on plan:** All three closed loose threads — none expanded scope.

## Issues Encountered

- **`@sentry/nextjs` install bumped `package-lock.json` by ~2300 lines.** Single biggest dep weight added in Phase 6; not a problem, just notable. No runtime cost when DSN absent (Sentry init becomes a no-op).
- **Local Supabase cold-boot is 60–90 s on a fresh machine.** `hookTimeout` set to 120 s in `vitest.config.ts` to absorb this; warm runs are <5 s.
- **Free-tier no-PITR.** Pro-tier upgrade documented as a Phase 7 line item in `BACKUP_RESTORE.md`. Mitigation in the meantime: daily manual `supabase db dump` recipe + quarterly restore drill.

## Decisions captured for downstream phases

- **Pilot country + ingestion path locked before T+0** (per RESEARCH open question 1; details captured in `06-USER-SETUP.md` section 6).
- **Conversion-rate comparator window is still undecided.** RESEARCH q4 left this open. Deferred to Phase 7 — the rollout phase will pick a window (week-over-week vs month-over-month) and wire the delta on the HQ KPI strip.
- **HQ sidebar stub pages → real surfaces deferred to Phase 7.** Plan 05-03 shipped them as placeholders; the soak confirmed there's no demand for fuller surfaces during pilot. Phase 7 will wire `/countries` (drill-in directory), `/service-mix` (group-wide service breakdown over time), and `/settings` (group admin / feature flags / SLA targets / country activation toggles).

## Outstanding user setup

`06-USER-SETUP.md` is the canonical operator runbook. By the close of Phase 6, the operator has:

- [x] Resend domain verified, `RESEND_API_KEY` + `SLA_ALERT_FROM_EMAIL` + `CRON_SECRET` in Vercel.
- [x] `IP_HASH_SALT` in Vercel.
- [x] Upstash Redis provisioned, `UPSTASH_REDIS_REST_URL` + `UPSTASH_REDIS_REST_TOKEN` in Vercel.
- [x] Sentry workspace + project, all five Sentry env vars in Vercel (`SENTRY_AUTH_TOKEN` build-only).
- [x] UptimeRobot monitor on `/api/health` every 5 min, alerts to `para.group.n8n@gmail.com` + William.
- [x] Pilot country + ingestion path locked with William.

## Next Phase Readiness

Phase 6 sealed. Next is **Phase 7 — Rollout**:

- `/gsd:research-phase 7 → /gsd:plan-phase 7 → /gsd:execute-phase 7`.
- Inherits Phase 6's full carry-over closure (cursor pagination, single MetricCard, range picker, hermetic vitest, RUNBOOK, BACKUP_RESTORE).
- Two explicit Phase 6 → Phase 7 deferrals: conversion-rate comparator window decision; HQ sidebar stubs → real surfaces.
- `phase-6-complete` tag staged locally; push pending explicit user approval (mirrors phase-2/3/4/5 posture).

---
*Phase: 06-production-hardening*
*Plan: 05*
*Completed: 2026-05-05*
