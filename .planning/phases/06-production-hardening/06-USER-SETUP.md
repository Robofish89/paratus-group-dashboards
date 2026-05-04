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

**Once all items complete:** Mark status as "Complete" at the top.
