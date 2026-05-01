# Phase 2: User Setup Required

**Generated:** 2026-05-01
**Phase:** 02-data-model-ingestion
**Status:** Complete (auto-applied via vercel CLI)

Plan 02-04 introduced one secret (`PARATUS_INGEST_SECRET`) that must exist in Vercel for the production webhook ingest to work. Claude generated the secret locally and pushed it to all three Vercel environments via the CLI — no human action was strictly required, but this file documents what happened so the secret can be rotated later if needed.

## Environment Variables

| Status | Variable | Source | Targets |
|--------|----------|--------|---------|
| [x] | `PARATUS_INGEST_SECRET` | Generated locally via `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` | Vercel Production, Preview, Development + local `apps/web/.env.local` |

The secret is 64-character hex (32 bytes). It is the shared secret for HMAC-SHA256 verification of the `X-Paratus-Signature` header on every POST to `/api/leads/ingest`.

**Sensitivity flag:** Production + Preview were created with `--sensitive` (Vercel masks the value in the dashboard). Development was created without the flag — Vercel rejects `--sensitive` on the development target with `Error: You cannot set a Sensitive Environment Variable's target to development.` This is a Vercel platform constraint, not a project decision.

## Sender configuration

**This secret must also be configured on the sender side.** Whoever sends webhooks to `/api/leads/ingest` (paratus.africa form integration, n8n bridge, or any future producer) must:

1. Read the production value from Vercel: `vercel env pull` then `grep PARATUS_INGEST_SECRET .env.local` (the dev value is the same as production in this build — there's no separate prod secret yet).
2. Compute `HMAC-SHA256(body, secret)` over the **raw request body** before any JSON re-serialisation.
3. Send the hex digest as the `X-Paratus-Signature` header.

For the n8n bridge (William @ Brainstorm Projects), the workflow's HTTP Request node should use a Function node first to compute the HMAC and inject the header.

## Verification

After Phase 2 completes, verify the webhook works end-to-end:

```bash
# Local dev (port 3012)
SECRET=$(grep PARATUS_INGEST_SECRET apps/web/.env.local | cut -d= -f2)
BODY='{"form_slug":"starlink","country_code":"MZ","submitted_at":"2026-05-01T12:00:00Z","name":"Test","email":"test@example.com"}'
SIG=$(printf '%s' "$BODY" | openssl dgst -sha256 -hmac "$SECRET" | awk '{print $2}')
curl -X POST http://localhost:3012/api/leads/ingest \
  -H "Content-Type: application/json" \
  -H "X-Paratus-Signature: $SIG" \
  -d "$BODY"

# Expected: 201 with {lead_id, agent_id, duplicate:false}
# Repeat: 200 with {lead_id, duplicate:true}
# Bad signature: 401 invalid signature
```

The production webhook URL is:

```
https://paratus-group-dashboards.vercel.app/api/leads/ingest
```

Hand this URL plus the production `PARATUS_INGEST_SECRET` to William's n8n workflow when Phase 2 lands.

## Rotating the secret

If the secret ever leaks:

```bash
NEW=$(node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")
vercel env rm PARATUS_INGEST_SECRET production -y
vercel env rm PARATUS_INGEST_SECRET preview -y
vercel env rm PARATUS_INGEST_SECRET development -y
echo "$NEW" | vercel env add PARATUS_INGEST_SECRET production --sensitive
echo "$NEW" | vercel env add PARATUS_INGEST_SECRET preview --sensitive
echo "$NEW" | vercel env add PARATUS_INGEST_SECRET development
# Update local .env.local
sed -i '' "s/^PARATUS_INGEST_SECRET=.*/PARATUS_INGEST_SECRET=$NEW/" apps/web/.env.local
# Hand the new value to whoever sends webhooks
```

A redeploy is required for the new secret to take effect on existing Vercel deployments — push a no-op commit to `main`, or use `vercel --prod`.

---

**Status:** Complete — no human action outstanding.
