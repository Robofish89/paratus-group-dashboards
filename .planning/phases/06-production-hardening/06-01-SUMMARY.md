---
phase: 06-production-hardening
plan: 01
subsystem: alerts
requires: ["02-data-model-ingestion", "04-country-admin-dashboard"]
provides: ["sla-cron", "resend-wrapper", "v_sla_breaches"]
affects: ["06-05"]
tags: ["security", "observability", "external-service"]
key-decisions: ["resend-vs-postmark", "cron-dedupe-via-column-vs-redis", "lazy-resend-client-init", "server-only-vitest-alias"]
key-files: ["packages/supabase/migrations/00014_sla_alerts.sql", "packages/supabase/src/lib/email.ts", "apps/web/app/api/cron/sla-check/route.ts"]
---

# 06-01 — SLA breach detection + email alerts

## Accomplishments

- **Migration 00014_sla_alerts** applied to live Supabase project `tgswsdfaszvztbpczfve`:
  - `leads.sla_breach_alerted_at timestamptz` dedupe column.
  - Partial index `leads_sla_pending_idx` over `(submitted_at)` filtered to
    `first_contacted_at IS NULL AND sla_breach_alerted_at IS NULL AND status = 'new'` so the per-minute scan stays O(open breaches).
  - `v_sla_breaches` view (`security_invoker = true`, granted to
    `service_role` only) — one row per lead unanswered for >5 minutes whose
    dedupe column is still NULL.
  - `mark_sla_alerted(p_lead_id uuid)` SECURITY DEFINER RPC (granted to
    `service_role` only) — sets the dedupe column.
- **Resend wrapper** at `packages/supabase/src/lib/email.ts` with lazy client
  init. Single export `sendSlaBreachEmail({ to, lead, ageMinutes, agentName,
  countryName, leadDeepLink })`. Throws on every failure mode (missing env,
  Resend API error) so the cron can refuse to mark the lead alerted and let
  the next tick retry.
- **React Email template** at `packages/supabase/src/lib/emails/sla-breach.tsx`
  — paratus-blue (#2B479B) + accent-orange (#F7941D) palette per `CLAUDE.md`,
  renders country, lead contact, agent name, age in minutes, and a deep-link
  button. Inline-style only (Gmail/Outlook compatible).
- **DAL surface** at `packages/supabase/src/dal/sla.ts` exporting
  `getOpenBreaches(): Promise<BreachLead[]>` and
  `markBreachAlerted(leadId): Promise<void>`. Plus three new helpers in
  `packages/supabase/src/dal/users.ts` — `getCountryAdminEmails`,
  `getAgentDisplayName`, `getCountryName` — the cron's per-breach lookups.
- **Cron route** at `apps/web/app/api/cron/sla-check/route.ts`
  (`runtime='nodejs'`, `maxDuration=60`):
  - Verifies `Authorization: Bearer ${CRON_SECRET}` (Vercel scheduler
    contract); 401 otherwise.
  - Reads open breaches → caches per-country admin emails + country names →
    sends emails in parallel via `Promise.allSettled` → calls
    `mark_sla_alerted(...)` only when EVERY recipient succeeds.
  - Returns `{ checked, alerted, errors[] }` JSON; errors carry
    `{ leadId, recipient, message }` (no PII).
  - Structured per-invocation log via `process.stdout.write` of a
    JSON-per-line `{ event: 'sla_cron', checked, alerted, error_count }`.
- **vercel.json** registers `* * * * *` schedule against the route. Build
  graph confirms the route is dynamic (`ƒ /api/cron/sla-check`).
- **proxy.ts** (renamed from middleware.ts by sibling 06-03 mid-flight) —
  exempts the cron path from cookie auth via `PUBLIC_PATHS`. Sibling 06-04
  committed the change forward in their proxy edits.
- **Integration test** at `apps/web/tests/sla.cron.test.ts` — 4 cases, all
  green:
  1. Happy path: seeds a 6-min-old breach, calls the route with a mocked
     Resend, asserts `alerted >= 1`, mock called with expected `to` +
     `subject` + `X-Entity-Ref-ID` header, dedupe column flipped on the
     breached lead.
  2. Dedupe: second invocation; verifies the breached lead is not in
     `v_sla_breaches` anymore (route may still see other transient breaches
     from concurrent suite runs but our lead is gone).
  3. Missing `Authorization` header → 401.
  4. Wrong bearer → 401.
- **server-only vitest alias** — added to `apps/web/vitest.config.ts` plus a
  no-op shim at `apps/web/test-support/server-only-shim.ts`. Required so the
  route handler (which transitively imports `server-only`) can be invoked
  inside the test runner. Production Webpack/Turbopack still enforces the
  RSC boundary at build time.
- **`.env.local.example`** — three new entries (`RESEND_API_KEY`,
  `SLA_ALERT_FROM_EMAIL`, `CRON_SECRET`). Sibling 06-04 committed the
  appended block forward; the SLA + E2E env additions ended up in their
  commit (additive merge).
- **DAL barrel** updated to re-export `getOpenBreaches`,
  `markBreachAlerted`, `BreachLead`, `getCountryAdminEmails`,
  `getAgentDisplayName`, `getCountryName`.
- **Verification**:
  - `npm run type-check` clean (top-level turbo task).
  - `npm run lint` clean (only pre-existing warnings in
    `country-admin/reassign/route.ts` from sibling 06-02 mid-flight; not
    introduced by 06-01).
  - `npm run build` succeeds; Next 16 build graph lists
    `ƒ /api/cron/sla-check`.
  - `npx vitest run tests/sla.cron.test.ts` — 4 / 4 green in 6.6s.
  - `mcp__supabase-paratusgroup__list_migrations` shows `00014_sla_alerts`
    applied. `SELECT * FROM v_sla_breaches LIMIT 1` returns rows on the
    live project (one stale-seed breach in MZ).

## Issues encountered

- **`status = 'new'` only, not `'new'|'assigned'`.** The plan template
  referenced `'assigned'` but the `lead_status` enum (00005) doesn't include
  it — assignment flips `assigned_to` from NULL to an agent UUID without
  changing `status`. The view + index drop the IN-clause and use plain
  `status = 'new'`. SQL header comment documents the deviation.
- **types file is `database.ts`, not `database.types.ts`.** Plan template
  referenced the latter; project uses the former. Wrote the regen to
  `database.ts`. Sibling 06-02 then re-regenerated to add their `audit_log`
  table; the merged file carries both surfaces.
- **`server-only` package throws when imported into vitest.** The route
  transitively imports it; we resolved by adding a vitest `resolve.alias`
  pointing at a no-op shim. Production behaviour unchanged — the Next build
  enforces the RSC boundary at compile time, not via the runtime guard.
- **`middleware.ts` was renamed to `proxy.ts` by sibling 06-03 mid-flight.**
  Plan listed `middleware.ts` in `files_modified`; the cron-path entry was
  added to the new `proxy.ts` PUBLIC_PATHS set. Sibling 06-04 carried the
  change forward via their proxy edits — by the time this plan committed,
  `proxy.ts` already had the entry. No standalone proxy.ts edit ended up in
  06-01's commits.
- **`.tsx` files were not in `packages/supabase/tsconfig.json` `include`.**
  Updated to `["src/**/*.ts", "src/**/*.tsx"]` so the React Email template
  compiles. JSX support already in place via `@repo/config/typescript`
  (`jsx: react-jsx`).
- **Lazy Resend client init.** Plan called for fail-fast at module init. We
  fail fast on first `sendSlaBreachEmail(...)` call instead — same ship-time
  behaviour in any production code path (the cron triggers a send within 60s
  of deploy), but tests can import the route module without setting real env
  vars first. Module-init crash would also kill any other route that
  imported the cron's transitive deps.
- **Resend SDK + `@react-email/components` install.** Neither was in the
  monorepo. Added to `packages/supabase` deps via `npm install`. ~73 packages,
  no audit issues introduced (5 pre-existing moderate-severity vulnerabilities
  on the lock file, untouched by this plan).
- **Concurrent sibling work surfaced via `lib/email` export.** Sibling 06-03
  added `./lib/rate-limit` to `packages/supabase/package.json` exports;
  06-01 added `./lib/email` next to it. Both made it into HEAD via
  additive edits.
- **Full vitest suite** has pre-existing Supabase auth rate-limit failures
  (carry-over from STATE.md). 06-01's test alone is green; the rate-limit
  carry-over is unaffected.

## Deviations

- **`'new'` instead of `'new'|'assigned'`** in `v_sla_breaches.WHERE` and the
  partial index (above).
- **Lazy Resend client** instead of module-init fail-fast (above).
- **server-only vitest alias** added (not in `files_modified` but required
  for the test in the plan's verify block).
- **`packages/supabase/src/dal/users.ts` extended** with three new helpers
  (the plan mentioned this would be added "if it doesn't already exist").
- **`packages/supabase/src/dal/index.ts` updated** to re-export the new
  helpers + SLA DAL.
- **`packages/supabase/tsconfig.json`** widened to include `.tsx`.
- **Email template uses inline `style={…}` objects** rather than React Email
  Tailwind component — keeps the dep tree small and avoids a second JIT
  pass at render time. Visual fidelity is mockup-equivalent.

## Next phase readiness

For 06-05 pilot soak, the watchers below should be on the dashboard:

- **False positives.** Plan 06-01 considers a breach to be `submitted_at <
  now() - 5min AND first_contacted_at IS NULL AND status = 'new'`. A lead
  that was deliberately left in `'new'` because the agent is offline (e.g.
  weekend, holiday) will still trip the alert. Deferred to 06-05's review.
- **False negatives.** A lead whose `status` is flipped to `'contacted'` by
  any path other than `mark_lead_contacted` (00009) — e.g. a future bulk
  import migration — could escape the SLA window with `first_contacted_at`
  still null. The view's `status = 'new'` filter would drop it. If 06-05
  surfaces this, broaden the filter to
  `status IN ('new', 'contacted') AND first_contacted_at IS NULL`.
- **Resend domain not verified.** The plan's `user_setup` block requires
  the operator to verify a sending domain at Resend before production traffic
  flows. Until that's done, every `sendSlaBreachEmail` call returns
  `domain_not_verified` from Resend → cron logs `error_count` → lead never
  marked alerted → next minute retries. The retry loop is benign (no
  state corruption), but log volume will grow. 06-05 should walk the
  06-USER-SETUP.md checklist before pilot soak begins.
- **Per-minute schedule cost.** Vercel Pro plan supports per-minute crons.
  At 12 active countries × ~36 country admins, a typical minute has
  0 breaches → `getOpenBreaches()` → 1 partial-index scan → empty
  short-circuit. Steady-state Vercel function invocations: 1440/day. No
  Resend traffic until breaches exist. If the steady-state cost shows up
  on the Vercel bill, switch to `*/2 * * * *` and document the SLA-target
  drift.
- **`X-Entity-Ref-ID` header.** Stops Gmail thread-collapsing of
  consecutive breach alerts. Verified in test mock. Resend forwards the
  header by default (per their 2026-02-27 docs); if any provider strips
  it, breach alerts may visually merge into one thread.

## Outstanding user setup

- **`RESEND_API_KEY`**, **`SLA_ALERT_FROM_EMAIL`**, **`CRON_SECRET`** — must
  be set in Vercel (Production + Preview, all Sensitive). Recommended sender:
  `alerts@paratus.group` (after domain verification). `CRON_SECRET` via
  `openssl rand -hex 32`.
- **Resend domain verification** — Resend Dashboard → Domains → Add Domain
  → paste DKIM/SPF/DMARC into the registrar; wait for `verified` status.
- **Country admins seated for every active country** — without a recipient
  for a breach's country, the cron logs `no_country_admin_seated` and
  skips. Phase 7 rollout will seat country admins per the Pilot Country
  Runbook (06-05).

The runbook for these steps lives at
`.planning/phases/06-production-hardening/06-USER-SETUP.md` (sibling-authored;
the 06-01 entry has been merged in alongside 06-03's Upstash setup).
