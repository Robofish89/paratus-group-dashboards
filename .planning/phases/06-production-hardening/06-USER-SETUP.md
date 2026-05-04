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

**Once all items complete:** Mark status as "Complete" at the top.
