# Security Checklist — Paratus Group Dashboards

Multi-tenant system across 13 countries. RLS misconfiguration = cross-country data leak. Treat every checkbox as a hard gate.

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
