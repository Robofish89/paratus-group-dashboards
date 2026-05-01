---
phase: 02-data-model-ingestion
plan: 06
status: shipped
shipped_at: 2026-05-01
subsystem: integration-tests
tags: [vitest, integration, rls, realtime, idempotency, hmac, supabase]

requires:
  - phase: 02-04
    provides: webhook-ingest-route, ingest-zod-schema
  - phase: 02-05
    provides: csv-importer-route
  - phase: 02-03
    provides: ingest-lead-rpc, assign-lead-fn, realtime-broadcast-from-db, private-channel-rls
provides:
  - integration-test-suite
  - cross-tenant-rls-test
  - webhook-idempotency-test
  - realtime-broadcast-test
  - phase-2-complete-tag (staged, push pending user approval)
affects:
  - 03-sales-rep-queue (test patterns reusable for queue tests)

tech-stack:
  added:
    - vitest@^3.2.4 (devDep)
    - dotenv@^17.4.2 (devDep, loads .env.local at vitest config time)
  patterns:
    - "Magiclink-cookie auth in tests: admin.generateLink → anon.verifyOtp (no passwords in env)"
    - "fileParallelism:false so the live Supabase project sees one file at a time"
    - "broadcast event listener uses event:'*' (trigger emits TG_OP — webhook path produces UPDATE not INSERT because round-robin happens after the lead row is inserted)"

key-files:
  created:
    - apps/web/vitest.config.ts
    - apps/web/tests/_helpers.ts
    - apps/web/tests/rls.cross-tenant.test.ts
    - apps/web/tests/ingest.idempotency.test.ts
    - apps/web/tests/realtime.broadcast.test.ts
    - .planning/phases/02-data-model-ingestion/PHASE-SUMMARY.md
    - .planning/phases/02-data-model-ingestion/02-06-SUMMARY.md
  modified:
    - apps/web/package.json (vitest + dotenv devDeps; "test": "vitest run")
    - apps/web/middleware.ts (removed redundant /api/leads/ingest from PUBLIC_PATHS)
    - SECURITY_CHECKLIST.md (Phase 2 section, items promoted from "deferred" to verified)
    - PRD/data-model.md (migration order rewritten to match what shipped)
    - .planning/PROJECT.md (Phase 2 added to Validated; pointer advanced to Phase 3)
    - README.md (Testing section)
    - .planning/STATE.md (Phase 2 closed, Phase 3 active)

key-decisions:
  - "Magiclink-cookie auth (admin.generateLink → anon.verifyOtp), reused from plan 02-05's CSV smoke. Test passwords are NOT in env. Three Gmail+ alias users seeded in plan 01-02 are the test identities."
  - "Service-role client is setup-only — every assertion runs from createAnonClient() + signInAs() so RLS is the thing under test, not the thing under bypass."
  - "fileParallelism:false in vitest.config — 3 files share one live Supabase project; running serially keeps cleanup hooks from racing the next file's setup."
  - "Realtime test listens on event:'*' not 'INSERT'. The leads_broadcast_agent trigger fires on (INSERT with assigned_to set) OR (UPDATE OF assigned_to). The webhook path inserts assigned_to=NULL then UPDATEs via assign_lead — natural broadcast event is UPDATE. Listening on '*' catches whichever the trigger emits and keeps the test honest against the real production code path."
  - "Middleware tidy: removed the redundant /api/leads/ingest entry from PUBLIC_PATHS. The broader pathname.startsWith('/api/leads/') block (added by plan 02-05) already covered it; two parallel agents in Wave 4 each added a bypass and the per-path Set entry was dead code."
  - "phase-2-complete tag staged locally only. Push pending explicit user approval at the checkpoint per global CLAUDE.md ('Do NOT push to main unless I explicitly say so')."

duration: ~30 min
---

# Plan 02-06 — Realtime + RLS validation tests: Closure

The Phase 2 verifiable outcome is now a green test, not a claim. Three vitest files run against the live Supabase project; together they cover every acceptance criterion the roadmap names.

## What was actually shipped

| Task | What | Commit |
|------|------|--------|
| 1 | Vitest + dotenv installed; `vitest.config.ts`; `_helpers.ts` (magiclink auth, env getters); `rls.cross-tenant.test.ts` (4 assertions: BW=0 / MZ≥1 / agent=own / hq=both). `npm run test` script wired. | `49d0a63` |
| 2 | `ingest.idempotency.test.ts` (4 assertions: 201 fresh / 200 duplicate same lead_id / 401 tampered / 400 malformed); `realtime.broadcast.test.ts` (1 assertion: agent receives broadcast within 5s on `agent:<uid>` for an assigned MZ ingest); middleware redundant-bypass removed. | `b683ba2` |
| 3 | Docs + tag (this commit + the `phase-2-complete` tag). | _(pending)_ |

## Test run

```
$ cd apps/web && npm test

 ✓ tests/rls.cross-tenant.test.ts (4 tests)
   ✓ country_admin@MZ cannot read leads from country_code='BW'
   ✓ country_admin@MZ can read leads from their own country
   ✓ agent@MZ only sees leads where assigned_to = their uid
   ✓ hq_admin sees leads from both MZ and BW
 ✓ tests/realtime.broadcast.test.ts (1 test)
   ✓ agent receives broadcast within 5s of an assigned ingest
 ✓ tests/ingest.idempotency.test.ts (4 tests)
   ✓ first POST → 201 with duplicate=false
   ✓ second POST with identical body → 200 with duplicate=true and same lead_id
   ✓ tampered signature → 401
   ✓ malformed JSON → 400

 Test Files  3 passed (3)
      Tests  9 passed (9)
   Duration  ~9 s
```

## Verification

- `npm run type-check` — clean
- `npm run lint` — clean
- `npm run build` — clean (route manifest lists `/api/leads/ingest` and `/api/leads/import-csv`)
- `npm run test` — 9/9 green
- `pg_tables` query confirms `rowsecurity=true` on `leads`, `lead_events`, `callbacks`, `countries`, `forms`, `user_roles`
- `vercel env ls` confirms `PARATUS_INGEST_SECRET` Sensitive on Production + Preview
- No `console.log`, no `any` types, no TODO comments in shipped code

## Issues encountered

- **Realtime test missed the broadcast on first run.** Test was listening on `event:'INSERT'`; trigger emits `TG_OP` which is `UPDATE` for the assignment path (lead row is inserted with `assigned_to=NULL`, then `assign_lead` UPDATEs it to set the agent — that UPDATE is what crosses the trigger threshold and broadcasts). Switched to `event:'*'`. One re-run, green in 1.7 s.
- **Quality-check hook required RLS-bypass comments on test helper.** Both `getServiceRoleKey()` and `createServiceClient()` got explicit `// RLS BYPASS:` comments per the project standard (same convention as `server.ts` and `admin.ts`).

## Boil-the-Ocean tidy taken

Removed the redundant `/api/leads/ingest` entry from `middleware.ts` `PUBLIC_PATHS`. Two parallel agents in Wave 4 (plans 02-04 and 02-05) each added a bypass: 02-04 added the per-path Set entry, 02-05 added the broader `pathname.startsWith("/api/leads/")` prefix block. The prefix block runs second but already covers every lead-ingest API path, so the Set entry was dead code. Single-line diff, full test suite still green afterwards.

## Next-phase readiness

Plan 03 (Sales Rep Queue) starts here:

- **Realtime contract for the queue UI:** subscribe with `supabase.channel('agent:' + userId, { config: { private: true } })` and listen on `event:'*'` (not `INSERT`) — see the realtime test for the exact shape and assertion of `payload.record.country_code`.
- **Assigned-leads list:** the agent's RLS policy already returns only `assigned_to=self` rows, so a plain `from('leads').select(…)` from the browser client does the right thing.
- **Test patterns:** `_helpers.ts` magiclink-cookie auth + the `signInAs(email)` helper transfer 1:1 to Phase 3 queue tests (call action, outcome modal, callback scheduling).
- **Carry-over cleanup (Phase 6):** converge `createServiceRoleClient` ↔ `createAdminClient`; wrap `auth.jwt()` in the Phase-1 `user_roles` policies; regen `Database` type to drop the `'ingest_lead' as never` cast.

---

*Plan 02-06 closed 2026-05-01. Two task commits + one docs commit on `main`. `phase-2-complete` tag staged, push awaiting checkpoint approval.*
