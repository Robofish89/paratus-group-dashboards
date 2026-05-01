---
phase: 02-data-model-ingestion
plan: 04
status: shipped
shipped_at: 2026-05-01
subsystem: api/ingest
tags: [webhook, hmac, zod, supabase, service-role, nextjs-route-handler]

requires:
  - phase: 02-03
    provides: ingest-lead-rpc, assign-lead-fn, leads-dedupe-index
provides:
  - webhook-ingest-route
  - service-role-dal
  - ingest-zod-schema
  - leads-events-dal-stubs
affects:
  - 02-06-realtime-validation
  - 03-sales-rep-queue
  - 07-rollout

tech-stack:
  added:
    - node:crypto.timingSafeEqual (stdlib, no new dep)
  patterns:
    - "HMAC webhook order: text() → timingSafeEqual → JSON.parse → Zod"
    - "Service-role client gated by import 'server-only' + RPC EXECUTE grant"
    - "Discriminated success|error envelope from Postgres RPCs"

key-files:
  created:
    - packages/supabase/src/schemas/ingest.ts
    - packages/supabase/src/dal/leads.ts
    - packages/supabase/src/dal/events.ts
    - apps/web/app/api/leads/ingest/route.ts
    - .planning/phases/02-data-model-ingestion/02-USER-SETUP.md
  modified:
    - packages/supabase/src/server.ts
    - packages/supabase/src/dal/index.ts
    - packages/supabase/src/schemas/index.ts
    - apps/web/middleware.ts
    - apps/web/.env.local.example

key-decisions:
  - createServiceRoleClient lives alongside the existing cookies-based createClient in server.ts (not duplicated into a new file). Same key as createAdminClient in admin.ts but a more truthful name for the webhook path.
  - Untyped supabase.rpc('ingest_lead' as never, ...) until end-of-Phase-2 type regen — the generated Database type was emitted from migrations 00001–00006 and pre-dates 00007's ingest_lead. Discriminated IngestLeadSuccess | IngestLeadError envelope keeps the call-site type-safe.
  - middleware.ts PUBLIC_PATHS gained /api/leads/ingest because the webhook is HMAC-authenticated, not session-authenticated. The middleware was Phase-1 strict — every non-public path requires a Supabase session — and would 307 the webhook to /login.
  - Vercel rejected --sensitive on the development environment ("You cannot set a Sensitive Environment Variable's target to development"). Production + preview are Sensitive; development is plain. Same secret value across all three.

patterns-established:
  - "/api/<webhook>/route.ts pattern: runtime='nodejs', read raw text, HMAC, Zod, RPC, structured stderr logging"
  - "PUBLIC_PATHS allow-list extension: any HMAC- or signature-authenticated route belongs here"
  - "DAL stub for Phase 3 (events.ts) ships now to anchor types and barrel exports — used in Phase 3's call-outcome path"

duration: 12 min
completed: 2026-05-01
---

# Phase 2 Plan 4: Webhook ingest endpoint — `/api/leads/ingest`

**HMAC-verified Next.js Route Handler that turns a signed JSON POST into a Postgres row via the `ingest_lead()` RPC, end-to-end smoke-tested at 201 fresh / 200 duplicate / 401 bad-sig / 400 bad-json.**

## Performance

- **Duration:** 12 min
- **Started:** 2026-05-01T09:21:22Z
- **Completed:** 2026-05-01T09:33:41Z
- **Tasks:** 2
- **Files created:** 5
- **Files modified:** 5

## Accomplishments

- `POST /api/leads/ingest` live behind HMAC verification with `crypto.timingSafeEqual`, returning the right status code on every branch (201/200/400/401/422/500).
- `ingestSchema` Zod contract authoritative for both this route and any future producer (CSV importer plan 02-05 also imports from `@repo/supabase/schemas`).
- `createServiceRoleClient()` factory + `ingestLead()` DAL wrap the Phase-2-03 `ingest_lead(jsonb)` RPC and surface a typed success|error envelope.
- `appendEvent()` placeholder DAL ready for Phase 3 (call outcomes) — types and barrel exports already wired.
- `PARATUS_INGEST_SECRET` provisioned in Vercel for production / preview / development plus local `.env.local`.
- Production webhook URL ready to hand off: **https://paratus-group-dashboards.vercel.app/api/leads/ingest**

## Task Commits

1. **Task 1: Zod schema + DAL + service-role client** — `65adf79` (feat)
2. **Task 2: Ingest route handler + env wiring** — `0254343` (feat)

Plan metadata commit lands after this SUMMARY is written.

## Files Created/Modified

**Created:**
- `packages/supabase/src/schemas/ingest.ts` — Zod `ingestSchema` + `IngestInput` type, mirrors `ingest_lead(jsonb)` payload contract.
- `packages/supabase/src/dal/leads.ts` — `ingestLead()` RPC wrapper + `IngestLeadResult` discriminated envelope + `isIngestLeadError()` type guard.
- `packages/supabase/src/dal/events.ts` — `appendEvent()` stub for Phase 3 call-outcome events; barrel-exported now to anchor types.
- `apps/web/app/api/leads/ingest/route.ts` — the HMAC-verified webhook handler.
- `.planning/phases/02-data-model-ingestion/02-USER-SETUP.md` — documents the auto-applied Vercel env var setup + sender-side HMAC requirement + rotation runbook.

**Modified:**
- `packages/supabase/src/server.ts` — added `createServiceRoleClient()` alongside the existing cookies-based `createClient()`. Two RLS-bypass comments (one on the function header, one on the actual `createSupabaseClient()` call) per quality-check guidance.
- `packages/supabase/src/dal/index.ts` — exports `ingestLead`, `isIngestLeadError`, `appendEvent` and their types.
- `packages/supabase/src/schemas/index.ts` — exports `ingestSchema` + `IngestInput`. Coexists with plan 02-05's `csvImport` exports (parallel agent committed `05b85fe` first; my edit is purely additive).
- `apps/web/middleware.ts` — `/api/leads/ingest` added to `PUBLIC_PATHS` so the webhook bypasses the Supabase session gate.
- `apps/web/.env.local.example` — new `PARATUS_INGEST_SECRET=` placeholder with comment.

## Decisions Made

- **`createServiceRoleClient` lives in `server.ts`, not a new file.** It's the same key as `createAdminClient` in `admin.ts`, but the route handler reads more honestly when the import says "service role" rather than "admin" — the webhook isn't an admin operation, it's a privileged platform path. Both factories now coexist; pick by intent at the call site.
- **Untyped RPC call (`'ingest_lead' as never`).** The generated `Database` type at `packages/supabase/src/types/database.ts` was emitted after migration 00006 (plan 02-02). `ingest_lead` shipped in migration 00007 (plan 02-03). Regenerating the type mid-plan would have spilled into 02-05's CSV importer work, so the call site uses a narrowed `IngestLeadResult` envelope; the end-of-Phase-2 type regen will close the loop.
- **`runtime = 'nodejs'`.** Edge runtime doesn't expose `node:crypto.timingSafeEqual`. Documented inline.
- **No `dynamic = 'force-dynamic'`.** Route Handlers are dynamic by default; the export would be redundant noise.
- **Vercel `--sensitive` flag dropped on development.** Vercel rejects it: `Error: You cannot set a Sensitive Environment Variable's target to development.` Production + preview are Sensitive; development is plain. Same secret value across all three.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 — Blocking] Added `/api/leads/ingest` to middleware `PUBLIC_PATHS`**

- **Found during:** Task 2 smoke test.
- **Issue:** First curl POST returned `307 → /login?redirectTo=%2Fapi%2Fleads%2Fingest`. The Phase-1 middleware is strict — every path not in `PUBLIC_PATHS` requires a Supabase session. The webhook is HMAC-authenticated; it has no cookies, so it never gets past the session gate.
- **Fix:** Added `/api/leads/ingest` to the `PUBLIC_PATHS` set in `apps/web/middleware.ts` with a comment documenting why (HMAC, not cookies). Same as the `/api/health` and `/api/auth/logout` carve-outs already present.
- **Files modified:** `apps/web/middleware.ts`.
- **Verification:** Smoke test re-run: 201 fresh / 200 duplicate / 401 bad-sig / 400 bad-json — all four codes correct.
- **Committed in:** `0254343` (Task 2 commit).

**2. [Rule 3 — Blocking] Extra `// RLS BYPASS` comments demanded by quality-check hook**

- **Found during:** Task 1 (server.ts edit + leads.ts write).
- **Issue:** A post-tool quality-check hook flagged that any file mentioning `createServiceRoleClient` (declaration or import) must carry an explicit `// RLS BYPASS` comment on the line that introduces the bypass. Initial JSDoc-only comments weren't enough.
- **Fix:** Added inline `// RLS BYPASS:` comments at three call sites — the `createServiceRoleClient` function declaration line, the `createSupabaseClient(...)` line inside it, and the `import { createServiceRoleClient }` line in `dal/leads.ts`.
- **Files modified:** `packages/supabase/src/server.ts`, `packages/supabase/src/dal/leads.ts`.
- **Verification:** Quality-check hook stopped firing; both files compile clean.
- **Committed in:** `65adf79` (Task 1 commit).

---

**Total deviations:** 2 auto-fixed (both Rule 3 — blocking).
**Impact on plan:** Both deviations were enforcement of project standards (auth gate strictness, RLS-bypass docs). Neither changed scope. Smoke test verified the corrections.

## Issues Encountered

- **Port 3012 was already bound** by the parallel plan 02-05 agent's dev server. Tried to start a second `npm run dev` and got `EADDRINUSE`. Reused the existing dev server (PID 88122, running `next-server (v16.2.4)`) for the smoke test. No code conflict.
- **`apps/web/_smoke-csv.mjs`** is a leftover untracked file from plan 02-05's CSV smoke test. Left in place — not mine to delete; plan 02-05's SUMMARY will own its cleanup.

## User Setup Required

**External services were configured automatically.** See [02-USER-SETUP.md](./02-USER-SETUP.md) for:

- The `PARATUS_INGEST_SECRET` value (auto-generated locally + pushed to Vercel for prod/preview/dev).
- The sender-side HMAC requirement (whoever POSTs to `/api/leads/ingest` must compute `HMAC-SHA256(body, secret)` and send it as `X-Paratus-Signature`).
- The rotation runbook if the secret ever leaks.

Status: Complete — no human action outstanding.

## Next-Phase Readiness

Plan 02-05 (CSV importer) is running concurrently and depends on the same `ingest_lead()` RPC + `@repo/supabase/dal` barrel — the `ingestLead()` export from this plan is what their per-row loop will call.

Plan 02-06 (cross-tenant RLS + realtime validation) can use this endpoint as the lead-creation entry point for its tests:

- Sign in as `country-admin@MZ` via the client SDK, POST a webhook with `country_code: BW` (the lead lands), then `select * from leads where country_code = 'BW'` returns 0 rows under the MZ admin's session — RLS enforced.
- Subscribe to `agent:<MZ-agent-uid>` on a private realtime channel, POST a webhook with `country_code: MZ`, observe the broadcast in <1 s.

Production webhook URL ready for William's n8n workflow:

```
https://paratus-group-dashboards.vercel.app/api/leads/ingest
```

Hand this URL plus the `PARATUS_INGEST_SECRET` (read from Vercel Production env) to him when Phase 2 closes.

---

*Plan 02-04 closed 2026-05-01. Two task commits + one metadata commit on `main`. Phase 2 verifiable outcome "POST to /api/leads/ingest creates a lead" is achieved.*
