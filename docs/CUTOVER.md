# Per-country cutover checklist — Paratus Group Dashboards

**Audience:** William @ Brainstorm Projects + DigimountAI on-call.
**Companion docs:** [`RUNBOOK.md`](./RUNBOOK.md) for incidents, [`BACKUP_RESTORE.md`](./BACKUP_RESTORE.md) for restore drills, [`onboarding/`](./onboarding/) for role one-pagers.

## How to use this checklist

The order is fixed: **provision users → smoke-test from agent + admin seats → flip the form-side webhook → 24–48 h soak → William sign-off → next country.** Out-of-order steps cause the round-robin-to-test-user pitfall — leads flow to whichever seed account is the only `agent` row, then disappear into the wrong queue.

Before starting a country, confirm five artifacts are in place: William has confirmed the contact list; that country's rows are populated in `.planning/rollout-contacts.csv` (gitignored — never commit real PII); `apps/web/scripts/provision-users.ts` is runnable from a developer machine with `SUPABASE_SERVICE_ROLE_KEY` + `RESEND_API_KEY` exported; the Supabase auth allowed-redirect URL list includes the production `/auth/accept-invite` callback; the Path 1 vs Path 2 ingestion decision is locked for that country (Path 1 = direct Paratus form webhook to `/api/leads/ingest` with HMAC; Path 2 = n8n bridge to the same endpoint).

Per-country sign-off lives at the bottom of each section as a dated William signature line. The 11 checkboxes above it are the ceremony — they get checked when the work happens, never speculatively. Do not pre-tick a non-pilot country.

## Mozambique (MZ) `[PILOT]`

- [ ] Contact list confirmed by William (agents + admin emails captured in `rollout-contacts.csv` row block)
- [ ] `rollout-contacts.csv` updated with this country's rows (do NOT commit real PII to git — file is gitignored)
- [ ] Auth allowed-redirect URL list in Supabase includes `https://paratus-group-dashboards.vercel.app/auth/accept-invite`
- [ ] `npx tsx apps/web/scripts/provision-users.ts --country=MZ` ran cleanly — Vercel/CLI logs show `event:'user_provisioned'` × N, `event:'provision_summary'` with `failed=0`
- [ ] Smoke test from agent seat: log in via invite email, set password, land on `/mz/queue`, see (zero or seeded) leads
- [ ] Smoke test from country admin seat: log in, land on `/mz`, KPI tiles render zeros, leaderboard shows the agents we provisioned
- [ ] Form-side ingestion flipped to production for this country — Path 1 (direct Paratus webhook to `/api/leads/ingest` with HMAC) or Path 2 (n8n bridge → same endpoint), per the per-country decision
- [ ] First real lead observed in `agent_today_stats.to_call_count` within 30 min of the form-side flip
- [ ] 24 h soak: zero `event:'audit_write_failed'` lines, zero 429s on `/api/leads/ingest` from production traffic, zero P1/P2 in Sentry, UptimeRobot uptime ≥ 99.9 %
- [ ] Country admin opens the audit log at `/mz/audit` and sees the first lead's lifecycle (assign + first contact)
- [ ] **William sign-off — date / signature: ____________**

## Angola (AO)

- [ ] Contact list confirmed by William (agents + admin emails captured in `rollout-contacts.csv` row block)
- [ ] `rollout-contacts.csv` updated with this country's rows (do NOT commit real PII to git — file is gitignored)
- [ ] Auth allowed-redirect URL list in Supabase includes `https://paratus-group-dashboards.vercel.app/auth/accept-invite`
- [ ] `npx tsx apps/web/scripts/provision-users.ts --country=AO` ran cleanly — Vercel/CLI logs show `event:'user_provisioned'` × N, `event:'provision_summary'` with `failed=0`
- [ ] Smoke test from agent seat: log in via invite email, set password, land on `/ao/queue`, see (zero or seeded) leads
- [ ] Smoke test from country admin seat: log in, land on `/ao`, KPI tiles render zeros, leaderboard shows the agents we provisioned
- [ ] Form-side ingestion flipped to production for this country — Path 1 (direct Paratus webhook to `/api/leads/ingest` with HMAC) or Path 2 (n8n bridge → same endpoint), per the per-country decision
- [ ] First real lead observed in `agent_today_stats.to_call_count` within 30 min of the form-side flip
- [ ] 24 h soak: zero `event:'audit_write_failed'` lines, zero 429s on `/api/leads/ingest` from production traffic, zero P1/P2 in Sentry, UptimeRobot uptime ≥ 99.9 %
- [ ] Country admin opens the audit log at `/ao/audit` and sees the first lead's lifecycle (assign + first contact)
- [ ] **William sign-off — date / signature: ____________**

## Botswana (BW)

- [ ] Contact list confirmed by William (agents + admin emails captured in `rollout-contacts.csv` row block)
- [ ] `rollout-contacts.csv` updated with this country's rows (do NOT commit real PII to git — file is gitignored)
- [ ] Auth allowed-redirect URL list in Supabase includes `https://paratus-group-dashboards.vercel.app/auth/accept-invite`
- [ ] `npx tsx apps/web/scripts/provision-users.ts --country=BW` ran cleanly — Vercel/CLI logs show `event:'user_provisioned'` × N, `event:'provision_summary'` with `failed=0`
- [ ] Smoke test from agent seat: log in via invite email, set password, land on `/bw/queue`, see (zero or seeded) leads
- [ ] Smoke test from country admin seat: log in, land on `/bw`, KPI tiles render zeros, leaderboard shows the agents we provisioned
- [ ] Form-side ingestion flipped to production for this country — Path 1 (direct Paratus webhook to `/api/leads/ingest` with HMAC) or Path 2 (n8n bridge → same endpoint), per the per-country decision
- [ ] First real lead observed in `agent_today_stats.to_call_count` within 30 min of the form-side flip
- [ ] 24 h soak: zero `event:'audit_write_failed'` lines, zero 429s on `/api/leads/ingest` from production traffic, zero P1/P2 in Sentry, UptimeRobot uptime ≥ 99.9 %
- [ ] Country admin opens the audit log at `/bw/audit` and sees the first lead's lifecycle (assign + first contact)
- [ ] **William sign-off — date / signature: ____________**

## DRC (CD)

- [ ] Contact list confirmed by William (agents + admin emails captured in `rollout-contacts.csv` row block)
- [ ] `rollout-contacts.csv` updated with this country's rows (do NOT commit real PII to git — file is gitignored)
- [ ] Auth allowed-redirect URL list in Supabase includes `https://paratus-group-dashboards.vercel.app/auth/accept-invite`
- [ ] `npx tsx apps/web/scripts/provision-users.ts --country=CD` ran cleanly — Vercel/CLI logs show `event:'user_provisioned'` × N, `event:'provision_summary'` with `failed=0`
- [ ] Smoke test from agent seat: log in via invite email, set password, land on `/cd/queue`, see (zero or seeded) leads
- [ ] Smoke test from country admin seat: log in, land on `/cd`, KPI tiles render zeros, leaderboard shows the agents we provisioned
- [ ] Form-side ingestion flipped to production for this country — Path 1 (direct Paratus webhook to `/api/leads/ingest` with HMAC) or Path 2 (n8n bridge → same endpoint), per the per-country decision
- [ ] First real lead observed in `agent_today_stats.to_call_count` within 30 min of the form-side flip
- [ ] 24 h soak: zero `event:'audit_write_failed'` lines, zero 429s on `/api/leads/ingest` from production traffic, zero P1/P2 in Sentry, UptimeRobot uptime ≥ 99.9 %
- [ ] Country admin opens the audit log at `/cd/audit` and sees the first lead's lifecycle (assign + first contact)
- [ ] **William sign-off — date / signature: ____________**

## Eswatini (SZ)

- [ ] Contact list confirmed by William (agents + admin emails captured in `rollout-contacts.csv` row block)
- [ ] `rollout-contacts.csv` updated with this country's rows (do NOT commit real PII to git — file is gitignored)
- [ ] Auth allowed-redirect URL list in Supabase includes `https://paratus-group-dashboards.vercel.app/auth/accept-invite`
- [ ] `npx tsx apps/web/scripts/provision-users.ts --country=SZ` ran cleanly — Vercel/CLI logs show `event:'user_provisioned'` × N, `event:'provision_summary'` with `failed=0`
- [ ] Smoke test from agent seat: log in via invite email, set password, land on `/sz/queue`, see (zero or seeded) leads
- [ ] Smoke test from country admin seat: log in, land on `/sz`, KPI tiles render zeros, leaderboard shows the agents we provisioned
- [ ] Form-side ingestion flipped to production for this country — Path 1 (direct Paratus webhook to `/api/leads/ingest` with HMAC) or Path 2 (n8n bridge → same endpoint), per the per-country decision
- [ ] First real lead observed in `agent_today_stats.to_call_count` within 30 min of the form-side flip
- [ ] 24 h soak: zero `event:'audit_write_failed'` lines, zero 429s on `/api/leads/ingest` from production traffic, zero P1/P2 in Sentry, UptimeRobot uptime ≥ 99.9 %
- [ ] Country admin opens the audit log at `/sz/audit` and sees the first lead's lifecycle (assign + first contact)
- [ ] **William sign-off — date / signature: ____________**

## Kenya (KE)

- [ ] Contact list confirmed by William (agents + admin emails captured in `rollout-contacts.csv` row block)
- [ ] `rollout-contacts.csv` updated with this country's rows (do NOT commit real PII to git — file is gitignored)
- [ ] Auth allowed-redirect URL list in Supabase includes `https://paratus-group-dashboards.vercel.app/auth/accept-invite`
- [ ] `npx tsx apps/web/scripts/provision-users.ts --country=KE` ran cleanly — Vercel/CLI logs show `event:'user_provisioned'` × N, `event:'provision_summary'` with `failed=0`
- [ ] Smoke test from agent seat: log in via invite email, set password, land on `/ke/queue`, see (zero or seeded) leads
- [ ] Smoke test from country admin seat: log in, land on `/ke`, KPI tiles render zeros, leaderboard shows the agents we provisioned
- [ ] Form-side ingestion flipped to production for this country — Path 1 (direct Paratus webhook to `/api/leads/ingest` with HMAC) or Path 2 (n8n bridge → same endpoint), per the per-country decision
- [ ] First real lead observed in `agent_today_stats.to_call_count` within 30 min of the form-side flip
- [ ] 24 h soak: zero `event:'audit_write_failed'` lines, zero 429s on `/api/leads/ingest` from production traffic, zero P1/P2 in Sentry, UptimeRobot uptime ≥ 99.9 %
- [ ] Country admin opens the audit log at `/ke/audit` and sees the first lead's lifecycle (assign + first contact)
- [ ] **William sign-off — date / signature: ____________**

## Namibia (NA)

- [ ] Contact list confirmed by William (agents + admin emails captured in `rollout-contacts.csv` row block)
- [ ] `rollout-contacts.csv` updated with this country's rows (do NOT commit real PII to git — file is gitignored)
- [ ] Auth allowed-redirect URL list in Supabase includes `https://paratus-group-dashboards.vercel.app/auth/accept-invite`
- [ ] `npx tsx apps/web/scripts/provision-users.ts --country=NA` ran cleanly — Vercel/CLI logs show `event:'user_provisioned'` × N, `event:'provision_summary'` with `failed=0`
- [ ] Smoke test from agent seat: log in via invite email, set password, land on `/na/queue`, see (zero or seeded) leads
- [ ] Smoke test from country admin seat: log in, land on `/na`, KPI tiles render zeros, leaderboard shows the agents we provisioned
- [ ] Form-side ingestion flipped to production for this country — Path 1 (direct Paratus webhook to `/api/leads/ingest` with HMAC) or Path 2 (n8n bridge → same endpoint), per the per-country decision
- [ ] First real lead observed in `agent_today_stats.to_call_count` within 30 min of the form-side flip
- [ ] 24 h soak: zero `event:'audit_write_failed'` lines, zero 429s on `/api/leads/ingest` from production traffic, zero P1/P2 in Sentry, UptimeRobot uptime ≥ 99.9 %
- [ ] Country admin opens the audit log at `/na/audit` and sees the first lead's lifecycle (assign + first contact)
- [ ] **William sign-off — date / signature: ____________**

## Rwanda (RW)

- [ ] Contact list confirmed by William (agents + admin emails captured in `rollout-contacts.csv` row block)
- [ ] `rollout-contacts.csv` updated with this country's rows (do NOT commit real PII to git — file is gitignored)
- [ ] Auth allowed-redirect URL list in Supabase includes `https://paratus-group-dashboards.vercel.app/auth/accept-invite`
- [ ] `npx tsx apps/web/scripts/provision-users.ts --country=RW` ran cleanly — Vercel/CLI logs show `event:'user_provisioned'` × N, `event:'provision_summary'` with `failed=0`
- [ ] Smoke test from agent seat: log in via invite email, set password, land on `/rw/queue`, see (zero or seeded) leads
- [ ] Smoke test from country admin seat: log in, land on `/rw`, KPI tiles render zeros, leaderboard shows the agents we provisioned
- [ ] Form-side ingestion flipped to production for this country — Path 1 (direct Paratus webhook to `/api/leads/ingest` with HMAC) or Path 2 (n8n bridge → same endpoint), per the per-country decision
- [ ] First real lead observed in `agent_today_stats.to_call_count` within 30 min of the form-side flip
- [ ] 24 h soak: zero `event:'audit_write_failed'` lines, zero 429s on `/api/leads/ingest` from production traffic, zero P1/P2 in Sentry, UptimeRobot uptime ≥ 99.9 %
- [ ] Country admin opens the audit log at `/rw/audit` and sees the first lead's lifecycle (assign + first contact)
- [ ] **William sign-off — date / signature: ____________**

## South Africa (ZA)

- [ ] Contact list confirmed by William (agents + admin emails captured in `rollout-contacts.csv` row block)
- [ ] `rollout-contacts.csv` updated with this country's rows (do NOT commit real PII to git — file is gitignored)
- [ ] Auth allowed-redirect URL list in Supabase includes `https://paratus-group-dashboards.vercel.app/auth/accept-invite`
- [ ] `npx tsx apps/web/scripts/provision-users.ts --country=ZA` ran cleanly — Vercel/CLI logs show `event:'user_provisioned'` × N, `event:'provision_summary'` with `failed=0`
- [ ] Smoke test from agent seat: log in via invite email, set password, land on `/za/queue`, see (zero or seeded) leads
- [ ] Smoke test from country admin seat: log in, land on `/za`, KPI tiles render zeros, leaderboard shows the agents we provisioned
- [ ] Form-side ingestion flipped to production for this country — Path 1 (direct Paratus webhook to `/api/leads/ingest` with HMAC) or Path 2 (n8n bridge → same endpoint), per the per-country decision
- [ ] First real lead observed in `agent_today_stats.to_call_count` within 30 min of the form-side flip
- [ ] 24 h soak: zero `event:'audit_write_failed'` lines, zero 429s on `/api/leads/ingest` from production traffic, zero P1/P2 in Sentry, UptimeRobot uptime ≥ 99.9 %
- [ ] Country admin opens the audit log at `/za/audit` and sees the first lead's lifecycle (assign + first contact)
- [ ] **William sign-off — date / signature: ____________**

## Tanzania (TZ)

- [ ] Contact list confirmed by William (agents + admin emails captured in `rollout-contacts.csv` row block)
- [ ] `rollout-contacts.csv` updated with this country's rows (do NOT commit real PII to git — file is gitignored)
- [ ] Auth allowed-redirect URL list in Supabase includes `https://paratus-group-dashboards.vercel.app/auth/accept-invite`
- [ ] `npx tsx apps/web/scripts/provision-users.ts --country=TZ` ran cleanly — Vercel/CLI logs show `event:'user_provisioned'` × N, `event:'provision_summary'` with `failed=0`
- [ ] Smoke test from agent seat: log in via invite email, set password, land on `/tz/queue`, see (zero or seeded) leads
- [ ] Smoke test from country admin seat: log in, land on `/tz`, KPI tiles render zeros, leaderboard shows the agents we provisioned
- [ ] Form-side ingestion flipped to production for this country — Path 1 (direct Paratus webhook to `/api/leads/ingest` with HMAC) or Path 2 (n8n bridge → same endpoint), per the per-country decision
- [ ] First real lead observed in `agent_today_stats.to_call_count` within 30 min of the form-side flip
- [ ] 24 h soak: zero `event:'audit_write_failed'` lines, zero 429s on `/api/leads/ingest` from production traffic, zero P1/P2 in Sentry, UptimeRobot uptime ≥ 99.9 %
- [ ] Country admin opens the audit log at `/tz/audit` and sees the first lead's lifecycle (assign + first contact)
- [ ] **William sign-off — date / signature: ____________**

## Uganda (UG)

- [ ] Contact list confirmed by William (agents + admin emails captured in `rollout-contacts.csv` row block)
- [ ] `rollout-contacts.csv` updated with this country's rows (do NOT commit real PII to git — file is gitignored)
- [ ] Auth allowed-redirect URL list in Supabase includes `https://paratus-group-dashboards.vercel.app/auth/accept-invite`
- [ ] `npx tsx apps/web/scripts/provision-users.ts --country=UG` ran cleanly — Vercel/CLI logs show `event:'user_provisioned'` × N, `event:'provision_summary'` with `failed=0`
- [ ] Smoke test from agent seat: log in via invite email, set password, land on `/ug/queue`, see (zero or seeded) leads
- [ ] Smoke test from country admin seat: log in, land on `/ug`, KPI tiles render zeros, leaderboard shows the agents we provisioned
- [ ] Form-side ingestion flipped to production for this country — Path 1 (direct Paratus webhook to `/api/leads/ingest` with HMAC) or Path 2 (n8n bridge → same endpoint), per the per-country decision
- [ ] First real lead observed in `agent_today_stats.to_call_count` within 30 min of the form-side flip
- [ ] 24 h soak: zero `event:'audit_write_failed'` lines, zero 429s on `/api/leads/ingest` from production traffic, zero P1/P2 in Sentry, UptimeRobot uptime ≥ 99.9 %
- [ ] Country admin opens the audit log at `/ug/audit` and sees the first lead's lifecycle (assign + first contact)
- [ ] **William sign-off — date / signature: ____________**

## Zambia (ZM)

- [ ] Contact list confirmed by William (agents + admin emails captured in `rollout-contacts.csv` row block)
- [ ] `rollout-contacts.csv` updated with this country's rows (do NOT commit real PII to git — file is gitignored)
- [ ] Auth allowed-redirect URL list in Supabase includes `https://paratus-group-dashboards.vercel.app/auth/accept-invite`
- [ ] `npx tsx apps/web/scripts/provision-users.ts --country=ZM` ran cleanly — Vercel/CLI logs show `event:'user_provisioned'` × N, `event:'provision_summary'` with `failed=0`
- [ ] Smoke test from agent seat: log in via invite email, set password, land on `/zm/queue`, see (zero or seeded) leads
- [ ] Smoke test from country admin seat: log in, land on `/zm`, KPI tiles render zeros, leaderboard shows the agents we provisioned
- [ ] Form-side ingestion flipped to production for this country — Path 1 (direct Paratus webhook to `/api/leads/ingest` with HMAC) or Path 2 (n8n bridge → same endpoint), per the per-country decision
- [ ] First real lead observed in `agent_today_stats.to_call_count` within 30 min of the form-side flip
- [ ] 24 h soak: zero `event:'audit_write_failed'` lines, zero 429s on `/api/leads/ingest` from production traffic, zero P1/P2 in Sentry, UptimeRobot uptime ≥ 99.9 %
- [ ] Country admin opens the audit log at `/zm/audit` and sees the first lead's lifecycle (assign + first contact)
- [ ] **William sign-off — date / signature: ____________**

### Rollback procedure

If a country's webhook flip causes a flood (>1000 leads/min) or RLS leakage shows up in the smoke test, immediately disable the form-side webhook — for Path 2 (n8n) deactivate the workflow; for Path 1 rotate `PARATUS_INGEST_SECRET` in Vercel so the webhook returns 401 — then rerun the smoke test before re-enabling. Once a country flips, the 24 h soak gates the next country, not a rollback opportunity. See [`RUNBOOK.md`](./RUNBOOK.md) section 3 for full incident-response details.
