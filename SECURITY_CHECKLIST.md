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
- [ ] RLS enabled on ALL Supabase tables (`leads`, `lead_events`, `users`, `user_roles`, `countries`, `forms`, etc.)
- [ ] RLS policies scope by `country_code` from JWT custom claims (use `app_metadata`, never `user_metadata`)
- [ ] HQ users have a separate role with cross-country read; tested that country admins cannot see other countries
- [ ] RLS policies tested from client SDK with country-A and country-B test users (not SQL Editor)
- [ ] Security headers configured in `apps/web/next.config.ts`: CSP, HSTS, X-Frame-Options, X-Content-Type-Options, Referrer-Policy
- [ ] `.gitignore` includes: `.env*`, `*.pem`, `*.key`, `.vercel`, `.DS_Store`
- [ ] No secrets in `NEXT_PUBLIC_*`
- [ ] `service_role` key is server-only (never imported into client components)
- [ ] Auth tokens in httpOnly cookies (Supabase SSR default)
- [ ] Vercel Preview deployments password-protected
- [ ] Supabase Allowed Hosts restricted to production domain
- [ ] DAL imports all use `server-only`
- [ ] Lead ingest webhook validates a shared secret + uses HMAC if reachable from public internet
- [ ] Rate limit on `/api/auth/*` and webhook endpoints

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
