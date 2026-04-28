# Security Checklist — Paratus Group Dashboards

Multi-tenant system across 13 countries. RLS misconfiguration = cross-country data leak. Treat every checkbox as a hard gate.

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

- [x] RLS enabled on the only Phase-1 table — `user_roles` (verified via `00001_rbac_schema.sql`). Remaining tables (`leads`, `lead_events`, `callbacks`, `countries`, `forms`) are Phase 2 — must be ticked again when those migrations land.
- [x] RLS pattern locked in for Phase 2: scope by `country_code` from JWT custom claims (set by `custom_access_token_hook`, sourced from `user_roles` — never `user_metadata`). HQ override via `(auth.jwt() ->> 'user_role') = 'hq_admin'`.
- [x] HQ users have a separate role (`hq_admin`) with cross-country read — implemented in `user_roles` policies. Full cross-country leak test deferred to Phase 2 (no country-scoped tables exist yet).
- [ ] RLS policies tested from client SDK with country-A and country-B test users — Phase 2 (`leads` table)
- [x] Security headers configured in `apps/web/next.config.ts`: CSP, HSTS, X-Frame-Options, X-Content-Type-Options, Referrer-Policy — all five verified live via `curl -I`
- [x] `.gitignore` includes: `.env*`, `*.pem`, `*.key`, `.vercel`, `.DS_Store` — `git ls-files | grep -E '\.env|\.vercel'` returns only `.env.local.example` (template, no secrets)
- [x] No secrets in `NEXT_PUBLIC_*` — `grep -r 'NEXT_PUBLIC_.*SERVICE'` clean (one false-positive in `packages/supabase/src/admin.ts` error string, not an env var)
- [x] `service_role` key is server-only — `packages/supabase/src/admin.ts` imports `server-only`; only consumed by the login Server Action's `getUserRoleRow()` helper
- [x] Auth tokens in httpOnly cookies (Supabase SSR default — verified via middleware response)
- [ ] Vercel Preview deployments password-protected — **user action pending** (Vercel Dashboard → Settings → Deployment Protection → Vercel Authentication, Preview only)
- [x] Supabase Allowed Hosts restricted to localhost + production domain — Redirect URLs set; **user action pending** to flip Site URL from `http://localhost:3012` to `https://paratus-group-dashboards.vercel.app`
- [x] DAL imports all use `server-only` — `packages/supabase/src/dal/users.ts` + `admin.ts` both verified
- [ ] Lead ingest webhook validates a shared secret + uses HMAC — Phase 2 deliverable
- [ ] Rate limit on `/api/auth/*` and webhook endpoints — Phase 2/6 deliverable

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
