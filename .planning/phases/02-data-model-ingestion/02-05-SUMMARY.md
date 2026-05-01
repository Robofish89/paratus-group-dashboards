---
phase: 02-data-model-ingestion
plan: 05
status: shipped
shipped_at: 2026-05-01
subsystem: api/ingest
requires:
  - 02-03
provides:
  - csv-import-route
affects:
  - 02-06-realtime-validation
  - 04-country-admin-dashboard (upload UI consumes this endpoint)
key-files:
  - apps/web/app/api/leads/import-csv/route.ts
  - packages/supabase/src/schemas/csvImport.ts
key-decisions:
  - Service-role client comes from `@repo/supabase/admin` (`createAdminClient`) not from a new `createServiceRoleClient` in `server.ts`. Phase 1 already shipped a service-role client; introducing a second one with the same key + same options would be redundant. Plan 02-04 added `createServiceRoleClient` to `server.ts` for naming clarity in the webhook path; we deliberately did not couple to it because that file was uncommitted while this plan was building. Both are functionally identical — future phases can converge on one name in a cleanup pass.
  - Each row goes through `ingest_lead()` individually (loop), not a chunked batch. The RPC handles idempotency, validation, and assignment atomically per row — chunking would require a different RPC and lose the per-row error reporting that the importer's whole UX depends on. CSV imports are interactive (admin watches a progress bar), not bulk-pipeline.
  - Country admins cannot smuggle leads into another tenant: `country_code` on every row is overridden to the admin's own country *before* Zod validation. HQ admins keep the CSV's declared country (they have group-wide write access).
  - Empty-string optional fields collapse to null via Zod `.or(z.literal('').transform(() => null))`. Spreadsheet exports leave optional cells empty rather than absent; without the transform, `email: ''` would fail `z.string().email()` and reject otherwise-good rows.
  - `submitted_at` accepts ISO and common spreadsheet formats. The Zod preprocess feeds the raw string through `new Date()` and `.toISOString()` so Excel-style "2026-04-29 11:00:00" lands as valid ISO before the `z.string().datetime()` check.
  - Middleware bypass: added `pathname.startsWith("/api/leads/")` to skip the cookie auth gate for both `/import-csv` and `/ingest`. Without it, an unauthenticated POST to `/import-csv` returned 307 Location:/login (because the matcher catches `/api/leads/*`), which is wrong behaviour for a JSON API. Each lead-ingest route handler does its own auth — HMAC for the webhook, cookie session for the importer — exactly per the project's "validate auth inside every Route Handler, never trust middleware alone" rule. Plan 02-04's narrower bypass (`/api/leads/ingest` in PUBLIC_PATHS) covers the same ingest endpoint redundantly; both can stay until a Phase 6 cleanup pass converges on one form.
---

# Plan 02-05 — CSV Importer (`POST /api/leads/import-csv`): Closure

The Path 3 (CSV bulk import) ingest path is now live. Country admins can upload a CSV of historical leads — every row goes through `ingest_lead()` so idempotency, round-robin assignment, and realtime broadcast are inherited from the webhook path automatically. Phase 4's country-admin upload UI can build on top of this endpoint with no further server work.

## What was actually shipped

| Task | What | Commit |
|------|------|--------|
| 1 | `packages/supabase/src/schemas/csvImport.ts` — `csvRowSchema` (mirrors ingest schema, coerces submitted_at, collapses empty strings to null). `papaparse` + `@types/papaparse` installed in `apps/web`. New `./schemas/csvImport` subpath export on `@repo/supabase`. | `05b85fe` |
| 2 | `apps/web/app/api/leads/import-csv/route.ts` — multipart handler: cookie-session auth, role gate (agent → 403), country override for country_admin, papaparse → per-row Zod → per-row `ingest_lead()` RPC → `{inserted, duplicates, errors}`. | `205762d` |

## Smoke test (live, port 3012)

Three runs against the local dev server with a session minted for the MZ country admin via service-role `auth.admin.generateLink({type:'magiclink'})` + anon `verifyOtp`, cookies framed as `@supabase/ssr` v0.6.1 expects (chunked `sb-<ref>-auth-token.<n>`):

1. **10-row MZ CSV, first run**:
   `{"inserted":10,"duplicates":0,"errors":[]}`
2. **Same CSV, second run**:
   `{"inserted":0,"duplicates":10,"errors":[]}` — full idempotency end-to-end through `leads_dedupe_idx`.
3. **3-row mixed CSV** (missing email AND phone / good / unknown form slug):
   `{"inserted":1,"duplicates":0,"errors":[{"row":2,"message":"Either email or phone is required"},{"row":4,"message":"unknown_form"}]}`. Row indices are 1-indexed against the file (header counted as row 1).

Auth-gate matrix verified:

| Caller | Result |
|--------|--------|
| Anonymous (no cookie) | 401 `{"error":"unauthorized"}` |
| Agent (MZ) | 403 `{"error":"forbidden"}` |
| Country admin (MZ) | 200; `country_code` override to MZ regardless of CSV value |
| HQ admin | 200; multi-country CSV (BW + ZA rows) both inserted |

After the smoke run, all 13 smoke leads were deleted via service-role and `user_roles.last_assigned_at` reset to NULL on every MZ user so 02-06's fairness assertions start from a clean slate.

## Verification

- `npm run type-check` clean
- `npm run lint` clean
- `npm run build` clean — both `/api/leads/import-csv` and `/api/leads/ingest` listed in the route manifest
- No `any` types, no `console.log`, no TODO comments in shipped code
- Service-role client import flagged with an RLS-bypass comment per the project's hook-enforced quality check

## Issues encountered

**Middleware redirected API calls to /login.** First run of the unauth test returned 307 redirecting to `/login?redirectTo=/api/leads/import-csv`. The `/(?!_next/static…).*` matcher in `middleware.ts` catches every API path that isn't in `PUBLIC_PATHS`, and the auth gate's redirect-to-login behaviour is wrong for an API endpoint (a JSON caller wants a JSON 401, not an HTML redirect). Added a `pathname.startsWith("/api/leads/")` short-circuit before the auth gate. Plan 02-04 independently added the narrower `/api/leads/ingest` to `PUBLIC_PATHS` for the same reason; both forms coexist (the broader prefix block runs after the narrower set lookup, so the webhook hits the set first and exits early — no functional overlap, just light redundancy).

**Service-role client name collision with parallel plan 02-04.** Plan 02-05 was instructed to use `createServiceRoleClient()` from `packages/supabase/src/server.ts`, which plan 02-04 was supposed to add. While 02-05 was building, that change was uncommitted in 02-04's working tree — importing it would have produced a "from a stable path" violation. Stuck with the existing `createAdminClient` from `@repo/supabase/admin` (Phase 1 — same key, same options), documented at the import site that this is a deliberate choice. Both names now exist in the codebase; convergence to one is a 30-second cleanup for Phase 6.

**Zod + empty string optionals.** First test of the bad-CSV case rejected the "good" row because Zod's `z.string().email().optional()` doesn't tolerate empty string — it tolerates absent, not empty. Spreadsheet exports almost always emit empty strings for unset cells. Patched the schema with `.or(z.literal('').transform(() => null))` on every optional string field. The transform runs only when the input matches an empty literal, so non-empty values still go through the appropriate validator.

**Variable shadowing in the smoke script.** The first attempt at the smoke script used `const URL = env.NEXT_PUBLIC_SUPABASE_URL`, which shadowed the global `URL` constructor and broke `new URL(...)` parsing the Supabase host for the cookie name. Renamed to `SUPABASE_URL`. Smoke artifacts (`_smoke-csv.mjs`, `_smoke-cleanup.mjs`, `/tmp/smoke-*.csv`) were deleted after the verification pass; nothing in `apps/web/` outside the route handler is part of this plan's diff.

## Files changed

- Created `packages/supabase/src/schemas/csvImport.ts`
- Modified `packages/supabase/src/schemas/index.ts` (added barrel export — plan 02-04 also touched this file in a separate hunk)
- Modified `packages/supabase/package.json` (added `./schemas/csvImport` subpath export)
- Modified `apps/web/package.json` + `package-lock.json` (added `papaparse` + `@types/papaparse`)
- Created `apps/web/app/api/leads/import-csv/route.ts`
- Modified `apps/web/middleware.ts` (added `/api/leads/*` prefix bypass — committed as part of plan 02-04 alongside their narrower `PUBLIC_PATHS` add for the webhook)

## Next-phase readiness

Plan 02-06 can:
- Treat the importer as a tested, idempotent way to seed 50–500 historical leads for a country during the realtime + RLS validation tests.
- Reuse the magiclink-cookie technique from this plan's smoke script for the `rls.cross-tenant.test.ts` integration test (no need to bake real test passwords into env).

Phase 4 (country-admin dashboard) can build the upload UI directly on top of this endpoint:
- Single `<input type="file" accept=".csv">` posting `multipart/form-data` to `/api/leads/import-csv`.
- Response payload is already shaped for a "X imported, Y duplicates, Z errors" results panel with row-level error drill-down.

---

*Plan 02-05 closed 2026-05-01. Two commits on `main`. Ready for plan 02-06 (realtime + RLS validation tests).*
