# Phase 6: User Setup Required

**Generated:** 2026-05-04 (plan 06-03)
**Phase:** 06-production-hardening
**Status:** Incomplete

External services introduced this phase that need manual configuration
before the next production deploy.

## 1. Upstash Redis (rate limiter)

Used by `apps/web/proxy.ts` (auth-flow rate limit) and
`apps/web/app/api/leads/ingest/route.ts` (webhook rate limit).
The library at `packages/supabase/src/lib/rate-limit.ts` fails-open in dev
(no env required) but **fails-closed in production at the first request**
if the env vars below are not present — the next deploy will boot fine
(build-time env not required) but every auth-path request and every
ingest-webhook hit will return a 500 until provisioned.

### Environment Variables

| Status | Variable | Source | Add to |
|--------|----------|--------|--------|
| [ ] | `UPSTASH_REDIS_REST_URL` | Upstash Console → your Redis DB → REST API → URL | Vercel Production + Preview (Sensitive); local `.env.local` if you want a real limiter in dev |
| [ ] | `UPSTASH_REDIS_REST_TOKEN` | Upstash Console → your Redis DB → REST API → Token | Vercel Production + Preview (Sensitive); local `.env.local` if you want a real limiter in dev |

### Account Setup

- [ ] Sign in to Upstash with `para.group.n8n@gmail.com`
  - URL: <https://console.upstash.com/login>
  - Skip if already authenticated via `upstash auth login` under that account.

### Dashboard Configuration

- [ ] **Create a Redis database** (or via CLI):
  - CLI: `upstash redis create paratus-ratelimit --region eu-west-1`
  - Console: Upstash Console → Create Database → Redis
  - Region: `eu-west-1` (closest to Vercel team `paratusgroup`'s FRA1 deploy region; HTTPS round-trip ≤ 30 ms).
  - Free tier (10 k commands/day) is enough for the pilot — at the configured caps (60 req/min on ingest, 5 req/min on auth) we are nowhere near the cap.

- [ ] **Add the two env vars to Vercel** for Production AND Preview, both flagged Sensitive:
  - `vercel env add UPSTASH_REDIS_REST_URL production preview --sensitive`
  - `vercel env add UPSTASH_REDIS_REST_TOKEN production preview --sensitive`
  - Skip Development target (Vercel rejects `--sensitive` there). Add to local `.env.local` only if you want a real limiter in dev — the lib's shim covers dev otherwise.

### Local Development

The lib uses a shim limiter when no Upstash env is set, so `npm run dev`
on port 3012 works as before. To exercise the real limiter locally:

```bash
# Add to apps/web/.env.local (or root .env.local — Next reads both)
UPSTASH_REDIS_REST_URL=...   # same value as Vercel
UPSTASH_REDIS_REST_TOKEN=... # same value as Vercel
```

### Verification

After Vercel env vars are set and a fresh deploy lands:

```bash
# Auth-flow rate limit (5 req/60s/IP):
for i in {1..7}; do
  curl -i -X POST https://paratus-group-dashboards.vercel.app/login \
    -H 'content-type: application/x-www-form-urlencoded' \
    -d 'email=probe@example.com&password=invalid' | head -1
done
# Expect: requests 1–5 return 200/302; request 6+ returns 429 with Retry-After.

# Ingest rate limit (60 req/60s/secret-hash):
SECRET="$(vercel env pull --plaintext production | grep PARATUS_INGEST_SECRET | cut -d= -f2)"
SIG="$(echo -n '{"x":1}' | openssl dgst -sha256 -hmac "$SECRET" -hex | cut -d' ' -f2)"
for i in {1..62}; do
  curl -i -X POST https://paratus-group-dashboards.vercel.app/api/leads/ingest \
    -H "x-paratus-signature: $SIG" -H 'content-type: application/json' \
    -d '{"x":1}' | head -1
done
# Expect: request 61+ returns 429 with Retry-After.
```

Mark this section complete once both 429 responses are observed against
production (or a preview deploy with Upstash env wired).

---

## 2. Audit log IP hashing salt (plan 06-02)

The audit log (migration 00015 + DAL `packages/supabase/src/dal/audit.ts`)
hashes the request IP before storing it on every audit row, so we keep a
correlation key without storing raw PII. The hash uses
`sha256(ip || IP_HASH_SALT)`. Rotating the salt deliberately breaks
correlation across rotations — exactly the privacy posture we want.

### Environment Variable

| Status | Variable | Source | Add to |
|--------|----------|--------|--------|
| [ ] | `IP_HASH_SALT` | Generate locally: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` | Vercel Production + Preview (Sensitive) + local `apps/web/.env.local` |

The audit DAL's `hashIpAddress(...)` falls through to `sha256(ip + '')`
when the env is absent, so dev still works without a salt — the resulting
hash is stable across machines, which is fine for local testing. Production
MUST have a real salt set so the audit-row IP correlations are not
trivially reversible from a published rainbow table.

### Setup

```bash
# 1. Generate locally
SALT=$(node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")

# 2. Push to Vercel (Production + Preview, Sensitive)
echo "$SALT" | vercel env add IP_HASH_SALT production --sensitive
echo "$SALT" | vercel env add IP_HASH_SALT preview --sensitive

# 3. Add to local .env.local
echo "IP_HASH_SALT=$SALT" >> apps/web/.env.local
```

### Verification

After deploy, write any audit row (reassign a lead) and verify the
`ip_hash` column is a 64-char hex string:

```sql
SELECT id, action, length(ip_hash) AS hash_len
FROM audit_log
ORDER BY created_at DESC
LIMIT 1;
-- Expect hash_len = 64.
```

### Rotation

Rotating `IP_HASH_SALT` is a no-op for the database — old rows keep their
old hashes, new rows hash with the new salt, and they stop matching. This
is the desired property: rotate after a privacy incident (or quarterly,
per the security runbook) to break long-term correlation.

---

## 3. Resend (transactional email — SLA breach alerts)

Used by `apps/web/app/api/cron/sla-check/route.ts`. The route emails country
admins when a lead has been unanswered for more than 5 minutes.

The Resend wrapper (`packages/supabase/src/lib/email.ts`) reads env lazily on
the first send — module import is safe even with no key — but the **first
real cron tick** in any environment without `RESEND_API_KEY` /
`SLA_ALERT_FROM_EMAIL` set will throw and the lead will not be marked alerted
(retry loop kicks in, log volume grows, no recipient receives mail).

The cron route also requires `CRON_SECRET` — Vercel's scheduler forwards it
as `Authorization: Bearer ${CRON_SECRET}` and the route refuses every other
request with 401.

### Environment Variables

| Status | Variable | Source | Add to |
|--------|----------|--------|--------|
| [ ] | `RESEND_API_KEY` | Resend Dashboard → API Keys → Create API Key (Full Access) | Vercel Production + Preview (Sensitive); `apps/web/.env.local` for local smoke |
| [ ] | `SLA_ALERT_FROM_EMAIL` | Verified Resend sender (e.g. `alerts@paratus.group`). Use `onboarding@resend.dev` only for the very first local smoke. | Vercel Production + Preview; `.env.local` for local smoke |
| [ ] | `CRON_SECRET` | `openssl rand -hex 32` | Vercel Production + Preview (Sensitive); `.env.local` for local smoke |

### Account Setup

- [ ] Sign in to Resend with `para.group.n8n@gmail.com`
  - URL: <https://resend.com/signup>
  - Skip if a Resend workspace already exists under that account.

### Dashboard Configuration

- [ ] **Verify the sending domain** (mandatory before production traffic):
  - Resend Dashboard → Domains → Add Domain
  - Use either `paratus.group` (root) or a sub-domain like `alerts.paratus.group`.
  - Resend prints DKIM, SPF, and DMARC records. Paste them into the registrar
    (e.g. Cloudflare DNS) and wait for `verified` status — usually < 10 min.
  - Until the domain is verified, every send will fail with
    `domain_not_verified` and the cron will log `error_count` per breach.

- [ ] **Create the API key**:
  - Resend Dashboard → API Keys → Create API Key (Full Access).
  - Copy once; the dashboard will not show it again.

- [ ] **Push env vars to Vercel** (Production + Preview only — never set
  `CRON_SECRET` on a development environment that doesn't need to receive
  real cron invocations):
  ```bash
  vercel env add RESEND_API_KEY production preview --sensitive
  vercel env add SLA_ALERT_FROM_EMAIL production preview
  vercel env add CRON_SECRET production preview --sensitive
  ```

### Local Development

```bash
# 1. Pull the existing Vercel envs into local .env.local
vercel env pull apps/web/.env.local

# 2. (Optional) for local smoke before pushing to Vercel:
echo "RESEND_API_KEY=re_dev_..." >> apps/web/.env.local
echo "SLA_ALERT_FROM_EMAIL=onboarding@resend.dev" >> apps/web/.env.local
echo "CRON_SECRET=$(openssl rand -hex 32)" >> apps/web/.env.local

# 3. Start the dev server, then in another terminal:
curl -H "Authorization: Bearer $CRON_SECRET" \
     http://localhost:3012/api/cron/sla-check
```

### Verification

After deploy, watch the Vercel function logs filter on `event=sla_cron`. A
quiet steady state shows `{"event":"sla_cron","checked":0,"alerted":0,"error_count":0}`
once per minute. A real breach shows `checked >= 1, alerted >= 1`. Then
verify the dedupe column landed:

```sql
SELECT id, country_code, sla_breach_alerted_at
FROM leads
WHERE sla_breach_alerted_at IS NOT NULL
ORDER BY sla_breach_alerted_at DESC
LIMIT 5;
```

### Rotation

- `RESEND_API_KEY`: rotate quarterly via the Resend dashboard. Update
  Vercel env, redeploy. The lazy-init client picks the new key up on first
  send post-restart.
- `CRON_SECRET`: rotate any time. The Vercel-managed cron picks up the new
  value on the next deploy automatically; no scheduler reconfiguration needed.

---

---

## 4. Sentry (application error tracking — plan 06-05)

Used by `apps/web/instrumentation.ts`, `apps/web/instrumentation-client.ts`,
`apps/web/sentry.server.config.ts`, `apps/web/sentry.edge.config.ts`, and
the `withSentryConfig(...)` wrapper in `apps/web/next.config.ts`.

The DSN is read lazily at `Sentry.init` time — no DSN ⇒ Sentry becomes a
no-op so dev sessions without a Sentry project still work. Source-map
upload runs at BUILD time only when `SENTRY_AUTH_TOKEN` is present in
the build env (Vercel build, NOT local dev). Without the token,
production stack traces will show minified code (RESEARCH pitfall 8).

### Environment Variables

| Status | Variable | Source | Add to |
|--------|----------|--------|--------|
| [ ] | `NEXT_PUBLIC_SENTRY_DSN` | Sentry → Settings → Projects → paratus-group-dashboards → Client Keys (DSN) | Vercel Production + Preview; client-side capture |
| [ ] | `SENTRY_DSN` | Same value as `NEXT_PUBLIC_SENTRY_DSN` | Vercel Production + Preview; server-side capture |
| [ ] | `SENTRY_AUTH_TOKEN` | Sentry → Settings → Account → API → Auth Tokens → Create with `project:releases` + `project:write` scopes | Vercel **Build** env scope (NOT runtime). Mark Sensitive. |
| [ ] | `SENTRY_ORG` | Your Sentry org slug (e.g. `paratus-group`) | Vercel Production + Preview |
| [ ] | `SENTRY_PROJECT` | `paratus-group-dashboards` | Vercel Production + Preview |

### Account Setup

- [ ] Sign in to Sentry with `para.group.n8n@gmail.com`
  - URL: <https://sentry.io/signup/>
  - Skip if already authenticated under that account.

### Dashboard Configuration

- [ ] **Create the project**:
  - Sentry → Create Project → Next.js → name `paratus-group-dashboards`.
  - Copy the DSN from the wizard; it goes into both
    `NEXT_PUBLIC_SENTRY_DSN` AND `SENTRY_DSN`.

- [ ] **Create the auth token**:
  - Sentry → Settings → Account → API → Auth Tokens → Create New Token.
  - Scopes: `project:releases` + `project:write`. Copy once.

- [ ] **Push env vars to Vercel** (BUILD scope for `SENTRY_AUTH_TOKEN`,
  Production + Preview for the rest):
  ```bash
  vercel env add NEXT_PUBLIC_SENTRY_DSN production preview
  vercel env add SENTRY_DSN production preview
  # SENTRY_AUTH_TOKEN must be added with Build env scope (not runtime).
  # Vercel CLI doesn't support that flag; add via Vercel Dashboard:
  #   Settings → Environment Variables → Add → Build (env) scope.
  vercel env add SENTRY_ORG production preview
  vercel env add SENTRY_PROJECT production preview
  ```

### Local Development

```bash
# Optional — only needed if you want errors from `npm run dev` to land in
# Sentry. Without these env vars, Sentry is a no-op locally.
echo "NEXT_PUBLIC_SENTRY_DSN=https://...@sentry.io/..." >> apps/web/.env.local
echo "SENTRY_DSN=https://...@sentry.io/..." >> apps/web/.env.local
```

### Verification

After deploy with all five env vars set:

```bash
# 1. Hit the health endpoint — proves the wrapper didn't break the build.
curl -sS https://paratus-group-dashboards.vercel.app/api/health | jq .

# 2. Trigger a deliberate error from a non-prod test page in dev,
#    then confirm an issue appears in the Sentry inbox with a
#    SYMBOLISED stacktrace (file paths visible, not minified). If
#    stacktraces are minified, SENTRY_AUTH_TOKEN was not set in the
#    Build env at deploy time — re-trigger the deploy after fixing.

# 3. Optional smoke test page:
#    Add a temporary route /api/test-sentry that throws, deploy,
#    GET it once, confirm Sentry issue, delete the route.
```

### Rotation

- DSN rotation: regenerate via Sentry → Project Settings → Client Keys →
  Rotate; update Vercel env, redeploy. The lazy-init client picks the new
  DSN up on first capture post-restart.
- Auth-token rotation: regenerate via Sentry → Settings → Account → API →
  Auth Tokens; update Vercel Build env. Old builds keep working; the next
  deploy uses the new token for source-map upload.

---

## 5. UptimeRobot (synthetic uptime monitoring — plan 06-05)

Free-tier UptimeRobot pings `/api/health` every 5 minutes. The endpoint
returns `200` when the DB round-trip is healthy AND under 500 ms; `503`
otherwise. The 503 path triggers an alert email to the configured contacts.

### Account Setup

- [ ] Sign up at <https://uptimerobot.com/signUp> with `para.group.n8n@gmail.com`.
  Skip if already authenticated.

### Dashboard Configuration

- [ ] **Create an HTTP(s) monitor**:
  - URL: `https://paratus-group-dashboards.vercel.app/api/health`
  - Interval: 5 minutes (the free-tier minimum)
  - Alert contacts: `para.group.n8n@gmail.com` + William's email
    (William to provide before pilot start)
  - **Pause until plan deploys**; resume at the start of the 48 h soak so
    the uptime % counter starts clean.

### Verification

After resuming the monitor:

- Wait 15 minutes; the dashboard should show 3 successful probes (≥99 % uptime).
- Manually trigger a 503 by temporarily revoking the Supabase anon key (or
  set `SUPABASE_SERVICE_ROLE_KEY` to garbage on a Preview deploy and point
  UptimeRobot at the preview URL); confirm an email arrives within 2 probes
  (≤ 10 minutes). Restore the key after.

---

## 6. Pilot country lock + ingestion path (plan 06-05)

Phase 6's done-condition is the 48 h pilot soak. The pilot country and
the lead-ingestion path must be locked before kickoff.

### Decisions Required

- [ ] **Pilot country** — confirm with William (default: Mozambique;
  alternative: Namibia). Lock before flipping the form-side ingestion to
  point at production.

- [ ] **Ingestion path** — choose one and document the choice in the
  06-05 SUMMARY:
  1. **Path 1 — Direct webhook**. Paratus IT wires the form `onSubmit` to
     POST `https://paratus-group-dashboards.vercel.app/api/leads/ingest`
     with the HMAC header. Cleanest end-to-end; depends on Paratus IT
     bandwidth inside the soak window.
  2. **Path 2 — n8n bridge** (RESEARCH default). Existing Sheets/email
     flows fan out to the same webhook. Lower change cost; accepted
     stop-gap.
  3. **Hybrid** — n8n bridge for the soak, direct webhook per-country
     during Phase 7 rollout.

### 48 h Soak Operations

- [ ] Confirm UptimeRobot is resumed at T+0.
- [ ] Confirm Sentry inbox is open in a tab.
- [ ] Confirm `vercel logs --since=1h --follow` is running for the
  ingest + queue + cron paths.
- [ ] Mid-soak (T+1 h): run the cross-country leakage spot-check
  documented in `06-05-PLAN.md` Task 3.
- [ ] Mid-soak (T+24 h): seed an SLA breach (or wait for organic) and
  confirm the email arrives within 60 s of the breach.
- [ ] Soak close (T+48 h):
  - Pull final metrics: leads ingested, SLA breaches alerted,
    errors thrown, uptime %.
  - Re-walk `SECURITY_CHECKLIST.md`.
  - Run `cd apps/web && npx playwright test` against production.
  - Run `mcp__supabase-paratusgroup__get_advisors --type security` —
    confirm zero new findings.
  - Update `.planning/PROJECT.md` "Validated" with the metrics.

---

**Once all items complete:** Mark status as "Complete" at the top.
