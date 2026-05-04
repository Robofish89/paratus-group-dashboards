# Operational Runbook — Paratus Group Dashboards

**Last reviewed:** 2026-05-04 (plan 06-05)
**Audience:** DigimountAI on-call + William @ Brainstorm Projects
**Production URL:** <https://paratus-group-dashboards.vercel.app>

This is the first-five-minutes guide when something breaks. Every step is
copy-pasteable. If a step here doesn't work, fix the runbook before fixing
the next thing.

---

## 1. On-call contacts

| Role | Name | Contact | When to page |
|------|------|---------|---------------|
| Primary on-call | DigimountAI | recoverykingsco@gmail.com | Any production incident |
| Escalation | William @ Brainstorm Projects | (William to provide) | Multi-hour outage, customer-facing miscount |
| Ingestion-side | Paratus form admin | (William to introduce before pilot) | Webhook signature failures, form-side bugs |

---

## 2. Live infrastructure cheat sheet

| Surface | URL / Identifier |
|---------|------------------|
| Production | <https://paratus-group-dashboards.vercel.app> |
| Webhook ingest | `POST /api/leads/ingest` (HMAC + Upstash rate-limited) |
| CSV importer | `POST /api/leads/import-csv` (cookie-authed, hq_admin) |
| Health probe | `GET /api/health` (public, no auth) |
| SLA cron | `POST /api/cron/sla-check` (Vercel cron `* * * * *`, bearer-auth) |
| E2E bridge | `POST /api/e2e-login` (404 unless `E2E_AUTH_ENABLED=true`) |
| Supabase project | `tgswsdfaszvztbpczfve` (eu-west-1, Postgres 17.6) |
| Supabase tier | **Free** (no PITR; daily backups only) |
| Vercel project | `paratusgroup` / `paratus-group-dashboards` |
| GitHub | <https://github.com/Robofish89/paratus-group-dashboards> |
| Sentry | (project to be created — see `06-USER-SETUP.md` section 4) |
| UptimeRobot | HTTP(s) monitor on `/api/health`, 5-min interval |
| Upstash Redis | `paratus-ratelimit` in eu-west-1 |
| Resend | DKIM + SPF + DMARC verified for the SLA-alert sender domain |

---

## 3. Common alerts and remediation

### 3.1 UptimeRobot 503 on `/api/health`

The health probe returns 503 when (a) the Supabase round-trip errors or
(b) round-trip exceeds 500 ms.

```bash
# 1. Look at the actual response body
curl -sS https://paratus-group-dashboards.vercel.app/api/health | jq .
# Expect: { status: 'ok'|'fail', supabase: 'ok'|'fail', db_ms?: number, commit, ts }

# 2. If supabase: 'fail' → check the Supabase status page first
open https://status.supabase.com/

# 3. If supabase: 'ok' but db_ms > 500 → DB under load
#    Check pg_stat_activity for long-running queries
#    Check Supabase dashboard → Database → Reports for slow query log

# 4. If status is 'fail' or no response at all → check Vercel
vercel logs --since=10m
```

If a deploy went out within the last hour and the failure correlates with
it, **roll back first, diagnose second:**

```bash
vercel rollback
```

### 3.2 SLA breach storm (>50/hour)

This usually means a webhook misroute or a country mass-import bypassing
the cron's per-country fan-out. Signs: Sentry shows hundreds of
`event=sla_cron, alerted=N` lines per minute, country admins flood your
inbox demanding to know what's happening.

```sql
-- Step 1: identify the actor / country / form
SELECT
  l.country_code,
  l.form_slug,
  count(*) AS leads_breaching,
  min(l.submitted_at) AS oldest_unanswered
FROM leads l
WHERE l.status = 'new'
  AND l.first_contacted_at IS NULL
  AND l.submitted_at < now() - interval '5 minutes'
  AND l.sla_breach_alerted_at IS NULL
GROUP BY 1, 2
ORDER BY leads_breaching DESC
LIMIT 10;

-- Step 2: peek at recent ingest audits (which webhook calls are landing?)
SELECT created_at, action, actor_user_id, target_country_code, ip_hash
FROM audit_log
WHERE action LIKE 'lead_%'
  AND created_at > now() - interval '15 minutes'
ORDER BY created_at DESC
LIMIT 30;
```

If the storm is from a single sender (one `ip_hash` dominates), **rotate
`PARATUS_INGEST_SECRET`** to lock them out:

```bash
# 1. Generate new secret
NEW_SECRET=$(openssl rand -hex 32)
# 2. Push to Vercel for ALL three environments — the value must match across
#    sender + Vercel or every webhook returns 401.
echo "$NEW_SECRET" | vercel env add PARATUS_INGEST_SECRET production --sensitive --force
echo "$NEW_SECRET" | vercel env add PARATUS_INGEST_SECRET preview    --sensitive --force
echo "$NEW_SECRET" | vercel env add PARATUS_INGEST_SECRET development --force
# 3. Trigger redeploy so the new env lands
vercel --prod
# 4. Update the n8n bridge / Paratus IT with the new value (out-of-band).
```

If the storm is from a legitimate mass-import, **temporarily pause the cron**
(disable in `apps/web/vercel.json`, redeploy) until the import is digested.

### 3.3 Upstash rate-limit floods on `/api/leads/ingest`

A flood here returns `429` to the sender (good — by design). But sustained
429s mean the sender is misconfigured. Check Upstash dashboard → your DB →
Metrics for the `paratus:ingest` prefix; investigate the IP / secret-hash.

If abuse is confirmed, **rotate `PARATUS_INGEST_SECRET`** as in 3.2 and
update the legitimate sender configuration.

### 3.4 Sentry issue spike

Triage by frequency × users (Sentry → Issues → sort by Events).

- Spike correlates with a recent deploy → `vercel rollback` first, then triage.
- Spike is one new issue, low user count → standard fix-and-deploy loop.
- Spike across many issues, distributed → look at Sentry Performance for an
  upstream culprit (Supabase outage, Upstash hiccup).

### 3.5 Supabase auth provider down

Symptom: every login redirects to `/unauthorized` or magiclinks fail.

1. Check the Supabase status page first (3.1 link).
2. Post in the client Slack with current ETA.
3. The dashboard itself is read-mostly — country admins on existing sessions
   keep working; the impact is new sign-ins.
4. There is no app-side workaround for an auth-provider outage. Wait for
   Supabase resolution.

### 3.6 SLA cron not firing

Symptom: breaches sit in `v_sla_breaches` for >5 minutes without alert.

```bash
# 1. Hit the cron manually with the bearer secret — confirm it works
CRON_SECRET=$(vercel env pull --plaintext production | grep CRON_SECRET | cut -d= -f2)
curl -sS -X POST https://paratus-group-dashboards.vercel.app/api/cron/sla-check \
  -H "Authorization: Bearer $CRON_SECRET" | jq .
# Expect: { checked: N, alerted: N, errors: [] }

# 2. If 401 → CRON_SECRET drifted between Vercel cron config and the env var
# 3. If 500 → check Sentry / vercel logs for the route handler

# 4. Check Vercel cron schedule
vercel crons ls 2>/dev/null || vercel logs --since=15m | grep cron
```

### 3.7 `.next` dev cache stale (developer-side)

After env-var toggles, `proxy.ts` changes, or middleware → proxy migrations,
`npm run dev` HMR does NOT re-evaluate route-handler env reads or middleware
decisions. Symptoms: old auth flow, old rate-limit behaviour, old role
routing.

```bash
# Kill the dev server, then:
rm -rf apps/web/.next
npm run dev
```

This is also true after toggling `E2E_AUTH_ENABLED=true` / `false`.

---

## 4. Secret rotation

Rotate quarterly, after any incident, or any time a token leaks. All values
live in Vercel; the canonical procedure is the same shape for every secret:

```text
1. Generate new value (per-service generator below)
2. vercel env add <NAME> <env_target> [--sensitive] [--force]
3. vercel --prod (or wait for next push to main)
4. (Optional) update sender / consumer side if the secret is shared
   (PARATUS_INGEST_SECRET, RESEND_API_KEY)
5. Verify via the smoke test in this section
```

| Secret | Generator | Targets | Sensitive? | Sender-side update? |
|--------|-----------|---------|------------|---------------------|
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase Dashboard → Project Settings → API → Reset | Production, Preview | Yes | No |
| `PARATUS_INGEST_SECRET` | `openssl rand -hex 32` | Production, Preview, Development | Yes (Production + Preview only — Vercel rejects --sensitive on Development) | **Yes** — n8n / Paratus form integration must be updated atomically |
| `CRON_SECRET` | `openssl rand -hex 32` | Production, Preview | Yes | No (Vercel cron picks up new value on next deploy) |
| `RESEND_API_KEY` | Resend Dashboard → API Keys → Create | Production, Preview | Yes | No |
| `UPSTASH_REDIS_REST_TOKEN` | Upstash Console → Redis DB → Reset Token | Production, Preview | Yes | No |
| `IP_HASH_SALT` | `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` | Production, Preview | Yes | No (intentionally breaks audit-log IP correlation across rotations — that's the privacy posture) |
| `SENTRY_AUTH_TOKEN` | Sentry → Settings → Account → API → Auth Tokens | Production, Preview (Build env scope) | Yes | No |
| `NEXT_PUBLIC_SENTRY_DSN` / `SENTRY_DSN` | Sentry → Project Settings → Client Keys → Rotate | Production, Preview | DSN itself is public-safe; SENTRY_DSN can stay non-Sensitive | No |

### 4.1 Verifying a rotation

Smoke tests after every rotation:

```bash
# Health probe must still return 200 — proves Supabase keys are intact
curl -sS https://paratus-group-dashboards.vercel.app/api/health | jq .

# SLA cron must still respond — proves CRON_SECRET landed
curl -sS -X POST https://paratus-group-dashboards.vercel.app/api/cron/sla-check \
  -H "Authorization: Bearer $NEW_CRON_SECRET" | jq .

# Webhook must still accept signed payloads — proves PARATUS_INGEST_SECRET
# matches across Vercel + sender. (See 06-USER-SETUP.md section 1 for the
# full curl recipe.)
```

---

## 5. Cron debug recipe

To invoke the SLA breach cron manually from a developer machine without
waiting for the next minute boundary:

```bash
# Pull the production CRON_SECRET into a local var (do NOT commit)
CRON_SECRET=$(vercel env pull --plaintext production 2>/dev/null \
  | grep '^CRON_SECRET=' | cut -d= -f2)

# Hit production
curl -sS -X POST https://paratus-group-dashboards.vercel.app/api/cron/sla-check \
  -H "Authorization: Bearer $CRON_SECRET" | jq .

# Or, hit local dev (must have CRON_SECRET in apps/web/.env.local)
curl -sS -X POST http://localhost:3012/api/cron/sla-check \
  -H "Authorization: Bearer $CRON_SECRET" | jq .

# Expected response shape (no PII):
#   { "checked": N, "alerted": N, "errors": [] }
```

To seed an SLA breach for end-to-end testing:

```sql
-- 1. Pick a country admin recipient (and confirm their JWT custom-claim
--    country_code matches the lead).
-- 2. Insert a lead 6 minutes in the past with status='new', first_contacted_at IS NULL.
INSERT INTO leads (country_code, form_slug, name, email, phone, submitted_at)
VALUES ('MZ', 'general-contact', 'SLA test', 'sla-test@example.com', '+1', now() - interval '6 minutes');
-- 3. Wait one cron tick (≤60 s) — the email should land in the country admin's inbox.
-- 4. After alert, the lead's sla_breach_alerted_at column is set; subsequent ticks skip it.
-- 5. Clean up: DELETE FROM leads WHERE email = 'sla-test@example.com';
```

---

## 6. `.next` cache restart cadence (developer-side)

The `apps/web/.next` dev cache holds compiled middleware decisions and
route-handler env reads. Nuke it after any of the following:

| Trigger | Why |
|---------|-----|
| Toggling `E2E_AUTH_ENABLED` in `.env.local` | The `/api/e2e-login` route's 404 vs 200 is decided at module load |
| Adding / removing env vars consumed by route handlers | Cached compilation reads stale `process.env` references |
| Editing `proxy.ts` or `apps/web/middleware.ts` (post-06-03 codemod = `proxy.ts`) | Edge-runtime module is cached separately |
| Updating `next.config.ts` (e.g. CSP changes) | Webpack/Turbopack config baking |
| Updating Sentry config files | `withSentryConfig(...)` wrap is baked at build time |

Standard reset:

```bash
# Stop dev server first (Ctrl+C in the terminal running `npm run dev`)
rm -rf apps/web/.next
npm run dev
```

---

## 7. Pilot incident triage cheat sheet — first five minutes

Something just broke during the 48 h pilot soak. Work through this list in
order; don't skip steps:

```text
[ ] 0:00  Read the alert. Note: source (UptimeRobot / Sentry / customer
          email), surface (URL or component), time of first detection.
[ ] 0:30  Check production status:
            curl -sS https://paratus-group-dashboards.vercel.app/api/health | jq .
[ ] 1:00  Check Supabase status page; check Vercel status page.
            open https://status.supabase.com/  https://www.vercel-status.com/
[ ] 2:00  Tail recent logs:
            vercel logs --since=15m
[ ] 3:00  If a deploy went out within 60 minutes of detection:
            vercel rollback   # then continue triage
[ ] 4:00  Open Sentry → Issues → Filter by today; look for the matching
          stack trace.
[ ] 5:00  Decide: rollback / hot-fix / wait-for-supabase. Communicate to
          William + para.group.n8n@gmail.com with current ETA.
```

Common five-minute resolutions:

- **Webhook 401**: `PARATUS_INGEST_SECRET` drift between Vercel and sender
  → re-sync the sender side.
- **Auth cookies failing locally**: clear `apps/web/.next`, restart `npm run dev`.
- **SLA emails not landing**: check Resend Dashboard → Logs; if domain
  unverified, redo DKIM + SPF + DMARC in registrar.
- **Cross-country leak suspected**: STOP, page DigimountAI primary
  immediately. Run `cd apps/web && npx vitest run tests/rls.cross-tenant.test.ts`.

---

## 8. Pre-deploy security checklist hook

Before every push to `main`:

- [ ] `npm run type-check` clean across the workspace
- [ ] `npm run lint` clean across the workspace
- [ ] `npm run build` clean (Sentry source-map upload prints `Successfully uploaded source maps to Sentry` if `SENTRY_AUTH_TOKEN` was in the build env)
- [ ] `cd apps/web && npx vitest run` green (hermetic; uses local Supabase)
- [ ] `cd apps/web && npx playwright test` green (against `npm run dev` on port 3012)
- [ ] `mcp__supabase-paratusgroup__get_advisors --type security` returns no new findings
- [ ] If any of the above fails, **do not push** — fix locally first.

The `SECURITY_CHECKLIST.md` at the repo root is the longer-form sibling of
this list; re-walk it before every Phase boundary, not every push.
