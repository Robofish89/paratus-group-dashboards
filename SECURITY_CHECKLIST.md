# Security Checklist — Paratus Group Dashboards

Multi-tenant system across 13 countries. RLS misconfiguration = cross-country data leak. Treat every checkbox as a hard gate.

## Phase 3 — Sales Rep Queue (re-run 2026-05-02)

> Verified live against Supabase project `tgswsdfaszvztbpczfve` and production deploy `https://paratus-group-dashboards.vercel.app`. Migrations 00009 + 00010 applied.

- [x] **Five queue RPCs are SECURITY DEFINER with inside-function auth guards** — `mark_lead_contacted`, `complete_call`, `schedule_callback`, `record_no_answer`, `agent_stats_in_range`. Every one of them gates `auth.uid() = leads.assigned_to AND auth.jwt() ->> 'country_code' = leads.country_code` inside the function body before any mutation or select. Definer rights bypass RLS, so the inside-function check is the only enforcement on writes — defence in depth.
- [x] **EXECUTE granted to `authenticated` only on the five queue RPCs** — `REVOKE ALL ON FUNCTION ... FROM PUBLIC, anon` then `GRANT EXECUTE ... TO authenticated`. Verified by `\df+` against the live project: ACL string is `postgres=X|authenticated=X|service_role=X` for all five. Anon callers (no JWT) get the explicit revoke; authenticated callers without `assigned_to` match get `forbidden` (42501) from inside the function.
- [x] **`record_no_answer(p_lead_id uuid)` follows the same security stance as the other queue RPCs** — SECURITY DEFINER, `SET search_path = public`, `auth.uid() = leads.assigned_to` + country guard, EXECUTE on authenticated only, REVOKE FROM PUBLIC + anon. Status is NEVER mutated by this RPC; only `call_attempts++` and `last_outcome='no_answer'` plus a `lead_events` audit row.
- [x] **`agent_stats_in_range(p_from, p_to)` scopes by `auth.uid()` implicitly** — the WHERE clause filters `assigned_to = auth.uid()`, so the returned counts reflect only the calling agent's leads. SECURITY DEFINER, `SET search_path = public`, EXECUTE on authenticated only.
- [x] **Defence-in-depth on terminal leads** — `mark_lead_contacted` RAISEs `invalid_status` (errcode `P0001`) when called against a lead whose status is `converted` or `lost`. The UI hides the Call button on those cards; the RPC backstops it. Two layers must fail to expose the plan-03-03 dead-button crash.
- [x] **Narrowed `complete_call` outcome enum** — drops `'qualified'`. Zod `callOutcomeEnum` rejects it at the route layer (`/api/queue/complete` returns 400); `complete_call` IF-validation RAISEs `invalid_outcome` if anything bypasses Zod. Two-layer rejection.
- [x] **`/api/queue/no-answer` route auth posture** — `runtime='nodejs'`, cookie session via `supabase.auth.getUser()` → 401 if missing; role gate (`agent | hq_admin`) → 403 if not; Zod-validated body (`recordNoAnswerInput = z.object({ lead_id: uuid })`) → 400 on schema fail; calls `recordNoAnswer(lead_id)` from `@repo/supabase/dal` (server-only). Errors mapped: `forbidden` → 403, `lead_not_found` → 404. Same posture as `/api/queue/contact` and `/api/queue/complete`.
- [x] **`/api/queue/complete` route auth posture (Phase 3-04 re-verified)** — Zod schema (`completeCallInput`) now rejects `'qualified'` at validation; route returns 400. Cookie session + role gate identical to other queue routes.
- [x] **`agent_today_stats` view v2 still uses `security_invoker = true`** — per-agent counters (`to_call_count`, `follow_ups_count`, `done_today`, `converted_today`, `lost_today`) inherit the underlying tables' RLS. SELECT granted to `authenticated`. Verified: a different agent's session SELECTing the view sees only their own row.
- [x] **No `console.log` / no TODOs / no `any` shortcuts in shipped Phase 3 code** — `git grep -n 'console.log\|TODO' apps/web/app/\(sales-rep\)/` returns zero hits in shipped files; project quality hook flags both at write time.
- [x] **Modal-free surface — no orphan import paths** — `git grep -n 'CallOutcomeModal' packages/ apps/` returns zero hits after plan 03-04 deleted `packages/ui/src/components/call-outcome-modal.tsx` and removed the index export.
- [x] **`/api/e2e-login` route gated by env flag** — only mounts when `E2E_AUTH_ENABLED=true`. Production has the variable unset, so the route returns 404. Used exclusively by Playwright (`apps/web/e2e/sales-rep-golden-path.spec.ts`); rejects requests without the matching `E2E_AUTH_SECRET` even when enabled.
- [x] **All Phase 3 RLS policies wrap `auth.jwt()` / `auth.uid()`** in `(SELECT …)` for InitPlan caching — verified in migrations `00009_queue_rpcs.sql` and `00010_queue_ux_redesign.sql`. (Phase 1 user_roles unwrapped — Phase 6 cleanup carry-over.)

## Phase 2 — Data Model & Ingestion (re-run 2026-05-01)

> Verified live against Supabase project `tgswsdfaszvztbpczfve` and production deploy `https://paratus-group-dashboards.vercel.app`.

- [x] **RLS enabled on every Phase 2 table** — `leads`, `lead_events`, `callbacks`, `countries`, `forms`, `user_roles`. Verified via `pg_tables` query: all six rows return `rowsecurity=true`.
- [x] **RLS policies tested from client SDK** with country-A and country-B test users — `apps/web/tests/rls.cross-tenant.test.ts` proves 4 boundaries: `country_admin@MZ` cannot read `country_code='BW'` (returns 0 rows, no error), can read own country, agent sees only `assigned_to=self`, hq_admin sees all countries. Run via `npm run test`.
- [x] **All Phase 2 RLS policies wrap `auth.jwt()` / `auth.uid()`** in `(SELECT …)` for InitPlan caching — verified in migrations `00005_leads_schema.sql`, `00007_assignment_function.sql`, `00008_realtime_broadcast.sql`. (Phase-1 `00001_rbac_schema.sql` policies on `user_roles` are unwrapped — small table, low cost; flagged for Phase 6 cleanup.)
- [x] **Realtime private-channel authorization** — `realtime.messages` has three RLS policies (`agent_own_topic`, `country_admin_country_topic`, `hq_country_topic`) gating subscriptions to `agent:<uid>` and `country:<code>` topics. Verified by `apps/web/tests/realtime.broadcast.test.ts` opening a private channel as the agent test user and receiving a broadcast for their own ingest.
- [x] **HMAC + shared secret on lead ingest webhook** — `/api/leads/ingest` enforces `crypto.timingSafeEqual` against `PARATUS_INGEST_SECRET`. `apps/web/tests/ingest.idempotency.test.ts` proves: 201 fresh / 200 duplicate (same `lead_id`) / 401 tampered signature / 400 malformed JSON.
- [x] **Webhook idempotency** — partial unique index `leads_dedupe_idx` on `(form_slug, COALESCE(lower(email), phone, ''), date_bin('5 minutes', submitted_at, '2000-01-01Z'::timestamptz))` makes duplicate POSTs collide on `ON CONFLICT DO NOTHING` and return the existing `lead_id`.
- [x] **`PARATUS_INGEST_SECRET` is Sensitive in Vercel** — verified via `vercel env ls`: Production + Preview marked Encrypted (Sensitive). Development is Encrypted but not Sensitive (Vercel platform constraint — rejects `--sensitive` on the development target).
- [x] **No service-role key in any `NEXT_PUBLIC_*` var** — `grep -r 'NEXT_PUBLIC' packages apps` clean: every match is `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` (safe) or an error-message string in `admin.ts` / `server.ts`.
- [x] **DAL files start with `import 'server-only'`** — `packages/supabase/src/dal/{events,leads,users}.ts` + `server.ts` + `admin.ts` all verified.
- [x] **Service-role-only RPC grants** — `ingest_lead(jsonb)` and `assign_lead(uuid, text)` both have `REVOKE ALL FROM public, anon, authenticated` + `GRANT EXECUTE TO service_role`. Anon and authenticated callers cannot invoke them, even with a valid session.
- [x] **Country admins cannot smuggle leads into another tenant** — `/api/leads/import-csv` overrides `country_code` to the admin's own country before Zod validation (CSV importer test matrix: see plan 02-05 SUMMARY).
- [x] **Webhook bypass narrowly scoped** — middleware bypasses cookie auth only for `/api/leads/*`; each route does its own auth (HMAC for the webhook, cookie session for the importer). Plan 02-06 removed the redundant per-path `PUBLIC_PATHS` entry left over from the parallel agents in Wave 4.
- [ ] **Rate limit on `/api/leads/ingest` and CSV importer** — deferred to Phase 6 (production hardening). Mitigation today: HMAC gate rejects unsigned payloads at 401 before any DB work; importer requires admin cookie session.

## Auth & RLS — current state (Plan 01-02)

- Migration `packages/supabase/migrations/00001_rbac_schema.sql` is **applied to the live Paratus Group Supabase project**:
  - `app_role` enum (`hq_admin`, `country_admin`, `agent`)
  - `country_code` enum (12 active + 3 coming-soon ISO 3166-1 alpha-2 codes)
  - `user_roles` table with RLS enabled and three policies (HQ read all, users read own, HQ manage all)
  - `custom_access_token_hook(event)` — injects `user_role`, `country_code`, `user_active` into every JWT
- The Custom Access Token Hook is **enabled** in the dashboard (Authentication → Hooks). JWTs issued by Supabase Auth now include the three claims every middleware / RLS policy depends on.
- Three test users (one per role) seeded with role rows — see `CREDENTIALS.md` for the Gmail `+` aliases.
- **Auth gate (middleware):** every non-public path is gated by `apps/web/middleware.ts`. The middleware calls `supabase.auth.getUser()` (re-validates against Supabase — `getSession()` is unsafe alone), then decodes the access token to read `user_role` + `country_code` for routing. Public paths: `/login`, `/unauthorized`, `/auth/callback`, `/api/health`.
- **Defense-in-depth:** route group layouts (`(hq)`, `(country-admin)/[country]`, `(sales-rep)/[country]/queue`) call `requireRole` and `requireCountry` from `apps/web/app/_lib/auth.ts`. A future middleware mis-config cannot leak data into a layout.
- **Open-redirect protection:** the login Server Action only honours `redirectTo` values that start with `/` and not `//`. The `/auth/callback` handler applies the same guard to its `next` param.
- **Logout:** `POST /api/auth/logout` only — GET-based logout endpoints are CSRF-vulnerable. Sidebar renders the control as a real `<form method="POST">` so it works without JS.
- Cross-country leakage tests are deferred to Phase 2, when leads/lead_events/callbacks tables (the actual tenant-scoped data) ship. The pattern Phase 2 RLS will use is `(auth.jwt() ->> 'country_code') = <table>.country_code` plus `(auth.jwt() ->> 'user_role') = 'hq_admin'` for HQ override.
- DAL helpers (`packages/supabase/src/dal/users.ts`) import `server-only`. The service-role client is used in exactly one place — `getUserRoleRow()` during the login Server Action, scoped by `user_id` — and the rationale is documented inline.
- Authorization always reads from JWT claims set by the hook, never from `auth.users.raw_user_meta_data` (that's user-controlled and unsafe).

## Pre-Launch (do once)

> **Phase 1 re-run — 2026-04-28 against `https://paratus-group-dashboards.vercel.app`:** items below ticked are verified in production. Items left unticked are Phase 2+ deliverables (no tenant-scoped data tables exist yet) or pending user dashboard config.

- [x] RLS enabled on the only Phase-1 table — `user_roles` (verified via `00001_rbac_schema.sql`). Phase 2 has since added `leads`, `lead_events`, `callbacks`, `countries`, `forms` — all six confirmed `rowsecurity=true` via `pg_tables` (see Phase 2 section above).
- [x] RLS pattern locked in for Phase 2: scope by `country_code` from JWT custom claims (set by `custom_access_token_hook`, sourced from `user_roles` — never `user_metadata`). HQ override via `(auth.jwt() ->> 'user_role') = 'hq_admin'`.
- [x] HQ users have a separate role (`hq_admin`) with cross-country read — implemented in `user_roles` policies. Cross-country leak test now green via Phase 2 (`apps/web/tests/rls.cross-tenant.test.ts`).
- [x] RLS policies tested from client SDK with country-A and country-B test users — `apps/web/tests/rls.cross-tenant.test.ts` (Phase 2).
- [x] Security headers configured in `apps/web/next.config.ts`: CSP, HSTS, X-Frame-Options, X-Content-Type-Options, Referrer-Policy — all five verified live via `curl -I`
- [x] `.gitignore` includes: `.env*`, `*.pem`, `*.key`, `.vercel`, `.DS_Store` — `git ls-files | grep -E '\.env|\.vercel'` returns only `.env.local.example` (template, no secrets)
- [x] No secrets in `NEXT_PUBLIC_*` — `grep -r 'NEXT_PUBLIC_.*SERVICE'` clean (one false-positive in `packages/supabase/src/admin.ts` error string, not an env var)
- [x] `service_role` key is server-only — `packages/supabase/src/admin.ts` imports `server-only`; only consumed by the login Server Action's `getUserRoleRow()` helper
- [x] Auth tokens in httpOnly cookies (Supabase SSR default — verified via middleware response)
- [ ] Vercel Preview deployments password-protected — **user action pending** (Vercel Dashboard → Settings → Deployment Protection → Vercel Authentication, Preview only)
- [x] Supabase Allowed Hosts restricted to localhost + production domain — Redirect URLs set; **user action pending** to flip Site URL from `http://localhost:3012` to `https://paratus-group-dashboards.vercel.app`
- [x] DAL imports all use `server-only` — `packages/supabase/src/dal/users.ts` + `admin.ts` both verified
- [x] Lead ingest webhook validates a shared secret + uses HMAC — `crypto.timingSafeEqual` against `PARATUS_INGEST_SECRET`; integration test green (Phase 2).
- [ ] Rate limit on `/api/auth/*` and webhook endpoints — deferred to Phase 6 hardening.

## Every Deployment
- [ ] `npm audit` — no high/critical
- [ ] All Server Actions validate auth at the top of the function (don't trust middleware alone)
- [ ] All inputs Zod-validated
- [ ] No hardcoded secrets
- [ ] New tables have RLS policies in their migration file
- [ ] Env vars set in Vercel for dev / preview / production (separate values)

## Periodic Review
- [ ] Rotate API keys quarterly
- [ ] Review Supabase + Vercel access lists
- [ ] `npm update` + check changelogs
- [ ] `npx depcheck` for unused deps
- [ ] Audit JWT custom claims still match expected role/country format
