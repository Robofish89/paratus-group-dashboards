---
phase: 01-foundation
status: validated
validated_at: 2026-04-28
production_url: https://paratus-group-dashboards.vercel.app
phase_tag: phase-1-complete
plans:
  - 01-01-SUMMARY.md
  - 01-02-SUMMARY.md
  - 01-03-SUMMARY.md
provides:
  - nextjs-app
  - design-system-wired
  - route-shell
  - rbac-migration
  - auth-middleware
  - role-routing
  - login-flow
  - vercel-deploy
  - production-url
  - security-headers
  - health-endpoint
---

# Phase 1 — Foundation: Closure

**Validated:** 2026-04-28 against <https://paratus-group-dashboards.vercel.app>

Three placeholder dashboards live on Vercel, three test users land on the right route after login, full security header stack present, RLS-ready RBAC schema migrated, JWT custom-claim hook live, deploy pipeline armed from `main`.

## Plan rollup

| Plan | Subsystem | Summary |
|---|---|---|
| [01-01](01-01-SUMMARY.md) | App shell | `apps/web` Next.js 16 app scaffolded; `@repo/ui`, `@repo/supabase`, `@repo/config` wired through Turborepo; theme tokens and DashboardLayout integrated; three role-grouped placeholder pages render with the AMA design system. |
| [01-02](01-02-SUMMARY.md) | Auth + RBAC | Migration `00001_rbac_schema.sql` + auth-admin grant migration `00002` applied; Custom Access Token Hook live with `user_role` / `country_code` / `user_active` claims; country-aware middleware with role-based routing; defense-in-depth `requireRole` / `requireCountry` in route-group layouts; POST-only logout; Gmail+ alias test users seeded. |
| [01-03](01-03-SUMMARY.md) | Deploy | Vercel project `paratusgroup/paratus-group-dashboards` linked; nine env vars set (3 keys × 3 envs); GitHub auto-deploy from `main` armed; `/api/health` shipped; first prod deploy Ready; all security headers verified live; smoke test green; Phase 1 docs closed. |

## Milestones — all green

From `PRD/milestones.md` § Phase 1:

- [x] Scaffold `apps/web` Next.js app with shared packages wired
- [x] Wire `@repo/ui`, `@repo/supabase`, `@repo/config`
- [x] `apps/web/app/globals.css` imports `@repo/ui/theme.css`
- [x] Supabase project created; env vars set in Vercel (production / preview / development)
- [x] Auth: login page (`AuthLayout`), Supabase Auth wired, logout
- [x] Middleware: redirect on auth, on role
- [x] DashboardLayout integrated with Paratus sidebar variant
- [x] Logo + favicon in place
- [x] Vercel deploy from `main` working
- [x] RBAC migration (00001) applied; JWT hook enabled
- [x] Three placeholder pages render: `(hq)`, `(country-admin)/[country]`, `(sales-rep)/[country]/queue`
- [x] Visual smoke check: matches AMA aesthetic

## Production fingerprint

- URL: <https://paratus-group-dashboards.vercel.app>
- Health: <https://paratus-group-dashboards.vercel.app/api/health>
- Deployment ID: `dpl_Eo5y7h6Bj6NjN8axEA3AeedzivQR`
- Tag SHA: see `git rev-parse phase-1-complete`
- Build region: `fra1`

## Outstanding user-side polish (Phase 2 won't be blocked by these)

- Flip Supabase Site URL from `http://localhost:3012` → `https://paratus-group-dashboards.vercel.app`
- Enable Vercel Preview Deployment Protection (Vercel Authentication, Preview only)

## Next: Phase 2 — Data Model & Ingestion

See `01-03-SUMMARY.md` § "Next Phase Readiness — Phase 2 Handoff" for the tenant-key contract, ingest endpoint location, DAL conventions, and migration sequence Phase 2 starts from.
