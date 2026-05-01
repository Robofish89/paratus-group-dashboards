---
phase: 02-data-model-ingestion
status: validated
validated_at: 2026-05-01
production_url: https://paratus-group-dashboards.vercel.app
phase_tag: phase-2-complete
plans:
  - 02-01-SUMMARY.md
  - 02-02-SUMMARY.md
  - 02-03-SUMMARY.md
  - 02-04-SUMMARY.md
  - 02-05-SUMMARY.md
  - 02-06-SUMMARY.md
provides:
  - rbac-v2 (last_assigned_at, display_name)
  - reference-data (countries, forms)
  - leads-schema (leads, lead_events, callbacks)
  - country-scoped-rls
  - dashboard-views (5, security_invoker)
  - dedupe-index
  - assign-lead-rpc
  - ingest-lead-rpc
  - realtime-broadcast-from-db
  - private-channel-rls
  - webhook-ingest-route
  - csv-importer-route
  - integration-test-suite
acceptance:
  cross_country_rls: "country_admin@MZ querying country_code='BW' returns 0 rows (no error)"
  webhook_idempotency: "duplicate POST returns same lead_id with status 200"
  realtime_broadcast: "agent receives broadcast on agent:<uid> within 5s of an assigned ingest"
---

# Phase 2 — Data Model & Ingestion: Closure

**Validated:** 2026-05-01 against Supabase project `tgswsdfaszvztbpczfve` and `https://paratus-group-dashboards.vercel.app/api/leads/ingest`.

The product spine is in place. Every lead-bearing path runs through one atomic Postgres RPC (`ingest_lead`) that dedupes, inserts, logs, and round-robin-assigns under concurrent load. Cross-tenant access is impossible from a client SDK: every Phase 2 table has RLS on, every policy wraps `auth.jwt()` for InitPlan caching, and the integration suite proves a country admin in MZ cannot see BW leads — full stop. Realtime fan-out uses Broadcast-from-Database (not `postgres_changes`) and authorizes private-channel subscriptions via three RLS policies on `realtime.messages`. Two HTTP ingest paths are live in production: the n8n-fed HMAC webhook and the country-admin CSV importer.

## Plan rollup

| Plan | Subsystem | Summary |
|---|---|---|
| [02-01](02-01-SUMMARY.md) | RBAC v2 + reference data | `00003_rbac_v2.sql` adds `last_assigned_at` + `display_name` on `user_roles`; `00004_reference_data.sql` seeds 15 countries (12 active + 3 coming-soon) and 10 forms. |
| [02-02](02-02-SUMMARY.md) | Leads schema | `00005_leads_schema.sql` ships `leads` + `lead_events` + `callbacks` with the full RLS policy set (HQ all / country admin scoped / agent own assignments / agent update own); `00006_views.sql` ships five `security_invoker = true` dashboard views. |
| [02-03](02-03-SUMMARY.md) | Assignment + realtime | `00007_assignment_function.sql` adds `leads_dedupe_idx` (partial unique on form/contact/5-min bucket using `date_bin`), `assign_lead(uuid, text)` (round-robin with `FOR UPDATE SKIP LOCKED`), and the atomic `ingest_lead(jsonb)` RPC; `00008_realtime_broadcast.sql` wires triggers on `leads` to `realtime.broadcast_changes()` for `agent:<uid>` + `country:<code>` topics, with three RLS policies on `realtime.messages`. |
| [02-04](02-04-SUMMARY.md) | Webhook ingest | `POST /api/leads/ingest` — Node runtime, HMAC-SHA256 with `crypto.timingSafeEqual`, Zod-validated body via `ingestSchema`, calls the `ingest_lead` RPC through a service-role DAL. `PARATUS_INGEST_SECRET` provisioned in Vercel for prod/preview/dev. |
| [02-05](02-05-SUMMARY.md) | CSV importer | `POST /api/leads/import-csv` — multipart, papaparse, cookie-session auth, country-admin role gate, `country_code` overridden to admin's own country before validation (no cross-tenant smuggling), each row through `ingest_lead`. Same idempotency + assignment + broadcast guarantees as the webhook path. |
| [02-06](02-06-SUMMARY.md) | Realtime + RLS validation | Vitest suite under `apps/web/tests/`: 4 cross-tenant RLS assertions, 4 webhook idempotency / signature assertions, 1 realtime broadcast assertion. All 9 green against the live project. Middleware tidied (redundant `PUBLIC_PATHS` entry removed). |

## Verifiable outcome — proven

> **Roadmap:** "POST to `/api/leads/ingest` creates a lead, fires events, realtime emits to assigned agent, cross-country RLS read returns 0."

| Criterion | Test file | Status |
|---|---|---|
| Lead created end-to-end via webhook | `apps/web/tests/ingest.idempotency.test.ts` (first POST → 201, lead_id returned, agent_id non-null) | green |
| Events fired on insert | `lead_events.created` row written by `ingest_lead`; `lead_events.assigned` row written by `assign_lead`. Verified in DB. | green |
| Realtime emits to assigned agent | `apps/web/tests/realtime.broadcast.test.ts` (agent receives broadcast within 5 s on `agent:<uid>` private channel) | green |
| Cross-country RLS read returns 0 | `apps/web/tests/rls.cross-tenant.test.ts` (`country_admin@MZ` querying `country_code='BW'` → `data.length === 0`, `error === null`) | green |
| Webhook idempotency | `apps/web/tests/ingest.idempotency.test.ts` (duplicate POST → 200 with `duplicate:true` + same `lead_id`) | green |
| Bad signature rejected | `apps/web/tests/ingest.idempotency.test.ts` (tampered signature → 401) | green |

`npm run test` from `apps/web` reports 3 files, 9 tests, ~9 s.

## Migrations applied (live on tgswsdfaszvztbpczfve)

| # | File | Plan |
|---|---|---|
| 00003 | `rbac_v2.sql` | 02-01 |
| 00004 | `reference_data.sql` | 02-01 |
| 00005 | `leads_schema.sql` | 02-02 |
| 00006 | `views.sql` | 02-02 |
| 00007 | `assignment_function.sql` | 02-03 |
| 00008 | `realtime_broadcast.sql` | 02-03 |

(Phase 1 owned `00001_rbac_schema.sql` + `00002_allow_auth_admin_read_user_roles.sql`.)

## Files added / modified across the phase

**Backend (Postgres):** 6 migrations (above).

**Backend (TypeScript):**
- `packages/supabase/src/server.ts` — added `createServiceRoleClient()`
- `packages/supabase/src/dal/leads.ts` — `ingestLead()` RPC wrapper, `IngestLeadResult` envelope, `isIngestLeadError()` guard
- `packages/supabase/src/dal/events.ts` — `appendEvent()` stub for Phase 3 call-outcome path
- `packages/supabase/src/dal/index.ts` — barrel exports
- `packages/supabase/src/schemas/ingest.ts` — `ingestSchema` (Zod) + `IngestInput`
- `packages/supabase/src/schemas/csvImport.ts` — `csvRowSchema` (Zod) coercing spreadsheet quirks
- `packages/supabase/src/schemas/index.ts` — barrel exports
- `packages/supabase/package.json` — `./schemas/csvImport` subpath export
- `packages/supabase/src/types/database.ts` — regenerated post-migrations for `leads` + views

**Routes:**
- `apps/web/app/api/leads/ingest/route.ts` — HMAC webhook
- `apps/web/app/api/leads/import-csv/route.ts` — multipart importer
- `apps/web/middleware.ts` — `/api/leads/*` prefix bypass; redundant per-path entry removed in 02-06

**Tests:**
- `apps/web/vitest.config.ts`
- `apps/web/tests/_helpers.ts` — magiclink-cookie auth, env getters, service-role/anon factories
- `apps/web/tests/rls.cross-tenant.test.ts`
- `apps/web/tests/ingest.idempotency.test.ts`
- `apps/web/tests/realtime.broadcast.test.ts`
- `apps/web/package.json` — `vitest@3` + `dotenv` devDeps; `npm run test` script

**Env:**
- `apps/web/.env.local.example` — `PARATUS_INGEST_SECRET` placeholder
- Vercel env: `PARATUS_INGEST_SECRET` set Sensitive on Production + Preview, plain on Development (platform constraint)

**Docs:**
- `SECURITY_CHECKLIST.md` — Phase 2 section added; Phase 1 entries promoted from "Phase 2 deliverable" to verified.
- `PRD/data-model.md` — migration order rewritten to match what shipped.
- `.planning/PROJECT.md` — Phase 2 added to Validated; phase pointer advanced to Phase 3.
- `README.md` — Testing section added.

## Risks mitigated

| Risk | Mitigation |
|---|---|
| Cross-country data leak via mis-scoped RLS | Every Phase 2 policy wraps `(SELECT auth.jwt() …)`. Integration test exercises the boundary from a real client SDK session. |
| Concurrent ingest races assigning same agent twice | `assign_lead` uses `FOR UPDATE … SKIP LOCKED` on the agent pool. Concurrent producers automatically pick different agents. |
| Webhook retries duplicating leads | Partial unique index on `(form_slug, contact, 5-min bucket)` using IMMUTABLE `date_bin` overload. `ON CONFLICT DO NOTHING` returns the existing `lead_id`. Verified by integration test. |
| Realtime fan-out scaling on `postgres_changes` | Switched to Broadcast-from-Database; private channels gated by RLS on `realtime.messages`. |
| HMAC timing-attack on webhook | `crypto.timingSafeEqual` against equal-length buffers. Bytes are read with `req.text()` before any JSON parse so the hash matches the sender. |
| Country admin smuggling rows into another tenant via CSV | `country_code` overridden to admin's own country *before* Zod validation. HQ keeps the CSV value. |
| Webhook hitting Supabase auth gate (307→/login) | Middleware bypasses `/api/leads/*` for cookie-session checks. Each route still runs its own auth (HMAC vs cookie). |

## Carry-forward to Phase 3

- **Phase 3 (Sales Rep Queue) starts with all the data primitives green:** `leads.assigned_to`, `lead_events`, `callbacks`, the `agent_queue_view` (in `00006_views.sql`), and the agent's private realtime channel are all live.
- **Frontend hook for the queue** can subscribe to `agent:${userId}` (private:true) — see `tests/realtime.broadcast.test.ts` for the exact shape, including the `event:'*'` listener that catches both INSERT and UPDATE-of-assigned_to.
- **Call-outcome events** plug into the `appendEvent()` stub in `packages/supabase/src/dal/events.ts` — types and barrel exports already wired.
- **Cleanup carry-overs (small, Phase 6 candidates):**
  - `createServiceRoleClient` (server.ts) and `createAdminClient` (admin.ts) are functionally identical — same key, same options. Converge to one name.
  - Phase 1's `user_roles` policies in `00001_rbac_schema.sql` use unwrapped `auth.jwt()` — small table, low cost, but trivially wrappable.
  - `ingest_lead` is called via `'ingest_lead' as never` because the generated `Database` type pre-dates migration 00007. Regenerate the type with the live schema and drop the cast.

## Production fingerprint

- Webhook: <https://paratus-group-dashboards.vercel.app/api/leads/ingest>
- CSV importer: <https://paratus-group-dashboards.vercel.app/api/leads/import-csv>
- Health: <https://paratus-group-dashboards.vercel.app/api/health>
- Supabase: project `tgswsdfaszvztbpczfve` (West EU / Ireland), Postgres 17.6
- Tag SHA: `git rev-parse phase-2-complete`

## Next: Phase 3 — Sales Rep Queue

The realtime broadcast, the assignment RPC, and the agent-scoped RLS are all proven. Phase 3 builds the agent UI on top: queue list, call action, outcome capture modal, callback scheduling, mobile responsive layout.
