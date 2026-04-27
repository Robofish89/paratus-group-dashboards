---
phase: 01-foundation
plan: 02
subsystem: auth
requires: [01-01]
provides:
  - rbac-migration
  - auth-middleware
  - role-routing
  - login-flow
affects:
  - 01-03
  - 02-*
  - all-future-phases
tags:
  - security
  - rls
  - auth
  - jwt-hook
key-decisions:
  - three-role-enum
  - country-code-enum-with-coming-soon
  - jwt-claim-hook-pattern
  - role-grouped-routes-no-path-prefix-for-hq
  - iso-alpha2-url-slugs-match-jwt-claim
key-files:
  - packages/supabase/migrations/00001_rbac_schema.sql
  - packages/supabase/migrations/00002_allow_auth_admin_read_user_roles.sql
  - apps/web/middleware.ts
  - apps/web/app/_lib/auth.ts
  - apps/web/app/(auth)/login/actions.ts
  - apps/web/app/(auth)/login/login-form.tsx
  - apps/web/app/(auth)/unauthorized/page.tsx
  - apps/web/app/(auth)/auth/callback/route.ts
  - apps/web/app/api/auth/logout/route.ts
  - apps/web/app/(hq)/layout.tsx
  - apps/web/app/(country-admin)/[country]/layout.tsx
  - apps/web/app/(sales-rep)/[country]/queue/layout.tsx
---

# 01-02 Summary — Auth + RBAC

## Accomplishments

- **Migration `00001_rbac_schema.sql`** authored, applied to the live Paratus Group Supabase project, and the Custom Access Token Hook enabled. Three test users (one per role) seeded via Gmail `+` aliases on `para.group.n8n@gmail.com`. JWTs now carry `user_role`, `country_code`, and `user_active` claims on every issuance.
- **Country-aware middleware** at `apps/web/middleware.ts`. Public allowlist (`/login`, `/unauthorized`, `/auth/callback`, `/api/health`) bypasses auth; everything else requires `supabase.auth.getUser()` (re-validates against Supabase — `getSession()` is unsafe alone) and a non-null `user_role` claim. Role-specific routing:
  - `hq_admin` — any path; no redirect.
  - `country_admin` — `/` redirects to `/<cc>`; foreign country segments redirect to `/<cc>`.
  - `agent` — anything outside `/<cc>/queue` redirects there.
- **Login surface** under `(auth)/login`. Server Action validates input via Zod (`loginSchema`), calls `signInWithPassword`, looks up the user_roles row via the admin client (race-safe — JWT claims haven't refreshed yet), and redirects to the role-correct landing page. Errors are generic (`invalid_input`, `invalid_credentials`, `no_role`) — no Supabase raw messages echoed. Light open-redirect guard on `redirectTo`.
- **Defense-in-depth route layouts:** `requireRole` and `requireCountry` helpers in `apps/web/app/_lib/auth.ts` re-check claims at the Server Component boundary. A future middleware mis-config cannot leak data into a layout.
- **Auth callback** route handler shipped (`/auth/callback`) — exchanges `code` for session for password-reset / magic-link flows. Phase 1 doesn't expose these flows but Phase 6 will, so it's wired now.
- **Logout** at `POST /api/auth/logout` (POST-only — GET-based logout is CSRF-vulnerable). `DashboardLayout` gained a `signOutHref` prop so the sidebar renders a real `<form method="POST">` sign-out that works without JS.
- **Country slug switch:** `_lib/countries.ts` rekeyed from long names (`mozambique`, `kenya`) to ISO 3166-1 alpha-2 slugs (`mz`, `ke`). URLs now match the JWT `country_code` claim 1:1 — middleware compares them with a single lower-case, no translation table needed.
- **HQ root moved from `/hq` to `/`.** Plan 01 placed HQ at `/hq` because of a route group conflict with the temporary root redirect. Plan 02 removes the root redirect (HQ is now the natural `/` resolution from the `(hq)` group), and the HQ nav points at `/`, `/countries`, etc.
- **`SECURITY_CHECKLIST.md`** §"Auth & RLS" rewritten to reflect the live state: migration applied, hook enabled, three users seeded, defense-in-depth, open-redirect protection, POST-only logout, and the deferred Phase-2 cross-tenant tests.
- **Quality gates green from repo root:** `npm run type-check`, `npm run lint`, `npm run build` all clean.

## Issues Encountered

1. **`@repo/supabase` barrel imports used `.js` extensions.** The Plan 01-02 Task 1 commit (`34ba78b`) added explicit `.js` extensions to relative imports in the `@repo/supabase` barrels (e.g., `from './auth.js'`). `tsc` resolved them correctly under NodeNext + CJS resolution (no `"type": "module"` in package.json), so Task 1's quality gate passed. But Next.js / Turbopack treats them as literal filenames and failed at build time once the barrels were actually imported by the web app. **Fix:** dropped the extensions across the package barrels — see commit `5cc13ed`. Realigns with the rest of the package (e.g., `realtime.ts` already imported without extensions).
2. **Stale `.next/types` referenced deleted pages** (`(hq)/hq/page.js`, `app/page.js`) on the first type-check after the file restructure. Resolved by running `next build` once, which regenerates the typed-routes validator from the current file tree.
3. **Next.js 16 deprecation warning:** `"middleware" file convention is deprecated. Please use "proxy" instead.` The convention still works in 16.x; migration is a one-line rename. Logged as a follow-up — does not block Phase 1.
4. **`.env.local.example` could not be rewritten.** The harness's permission rules block Write/Edit on filenames matching `.env*`, even for the explicitly-allowed `*.example` variant. The Plan 01 version of the file shipped with the three keys present (`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`), which is sufficient for the plan's requirements. The richer comment block envisioned by Plan 02's `<action>` block is logged as a tidy-up — file content is functionally complete.
5. **Custom Access Token hook returned null claims (RLS bug).** Login succeeded but every user landed on `/unauthorized` because the JWT carried `user_role: null`. Root cause: `public.user_roles` had RLS enabled with all policies scoped to the `authenticated` role; the hook executes as `supabase_auth_admin`, which has the table grant but no matching policy and is not a superuser. Its `SELECT` returned zero rows during token issue. **Fix:** migration `00002_allow_auth_admin_read_user_roles.sql` adds a permissive `SELECT` policy on `user_roles` for `supabase_auth_admin` only. Direct testing as `postgres` had hidden the bug (postgres bypasses RLS).
6. **Agent sign-out was a no-op.** The agent middleware branch redirected anything outside `/<cc>/queue` back to the queue, including the `POST /api/auth/logout` form submission — so the logout route never ran. **Fix:** added `/api/auth/logout` to `PUBLIC_PATHS` in `middleware.ts` so role-routing redirects don't intercept logout.
7. **`/atlantis` did not 404 for agent / country_admin.** The `[country]` dynamic segment captured `atlantis`, so the country-admin / sales-rep layout fired `requireRole` and `requireCountry` first — agents got bounced to `/unauthorized`, country admins to `/mz`. The page-level `isActiveCountry` check never ran because the layout redirected first. **Fix:** moved the `isActiveCountry` short-circuit (calling `notFound()`) into both `(country-admin)/[country]/layout.tsx` and `(sales-rep)/[country]/queue/layout.tsx`, ahead of the role/country guards. Unknown countries now 404 cleanly for every role.
8. **Agent middleware over-redirect.** The original "anything not under `/<cc>/queue` → bounce to queue" rule swallowed `/atlantis` (no country prefix). Tightened the rule to only redirect on (a) cross-country prefixes, (b) the root `/`, and (c) within-own-country non-queue paths. Paths without a country prefix now fall through so Next.js can render its 404.

## Deviations from Plan

- **HQ index moved to `/`** rather than staying at `/hq`. The plan signaled this as the intent ("decision: keep group naming as `(hq)` and place HQ index at `apps/web/app/(hq)/page.tsx` resolving to `/`; no rewrite needed for HQ"). Plan 01 had blocked it because of the `app/page.tsx` redirect; Plan 02 removes that redirect, freeing `/` for the HQ route group.
- **Country URL slugs flipped to ISO alpha-2** (`/mz` instead of `/mozambique`). The plan's middleware specification used `/${cc}` patterns implicitly — long names would have required a slug↔ISO translation map throughout the routing layer. ISO slugs match the JWT claim 1:1 and read better in URLs (consistent with Cloudflare, GitHub Issues, etc.).
- **`DashboardLayout.signOutHref` prop added** instead of using `onSignOut` callback for the sidebar logout. The callback path requires the entire shell to be wired into a client component with a form-action handler; `signOutHref` lets the existing per-role shells just thread a string through, and the underlying `<form method="POST">` works without JS (zero added attack surface vs. a callback that calls `fetch`).
- **Login form is a separate Client Component** (`login-form.tsx`) rather than the page itself being a Client Component. `useActionState` requires `'use client'`, but `AuthLayout` is fine as a Server Component, so the page stays server-rendered and only the form hydrates. Cleaner SEO + smaller hydration payload.
- **No HQ-specific drill-in routes beyond `/`** added in this plan. The middleware allows HQ admins to visit `/<any-country>` and `/<any-country>/queue` (which render the country-admin and sales-rep layouts respectively) — that satisfies the human-verify checklist. Dedicated HQ-scoped variants of those views ship in Phase 5.

## Security Notes

- **Authorization is JWT-claim-driven, never `user_metadata`.** The Custom Access Token Hook is the single source of truth: it reads `user_roles` (server-side, with `supabase_auth_admin` privileges) and writes `user_role` / `country_code` / `user_active` into the JWT. Middleware and Server Component helpers consume only those claims.
- **`getUser()` everywhere, never `getSession()` alone for the auth gate.** `getSession()` trusts the cookie and returns whatever's stored client-side; `getUser()` round-trips to Supabase to re-validate the access token.
- **`supabase_auth_admin` grants are scoped:** `EXECUTE` on the hook, `SELECT` on `user_roles`, `USAGE` on `public`. `EXECUTE` on the hook is `REVOKE`d from `authenticated`, `anon`, and `public` so no client can invoke it directly.
- **Service-role usage is documented inline** and confined to one place (`getUserRoleRow` in the login flow, scoped by `user_id`). This is the only RLS-bypass in the auth surface.
- **Open-redirect protection on `redirectTo`:** must start with `/`, must not start with `//`. Same guard on the `/auth/callback` `next` parameter.
- **POST-only logout** at `/api/auth/logout` — GET endpoints can be triggered by image tags / link previews / prefetchers, which is a CSRF vector for sign-out.
- **Defense-in-depth in route group layouts** means a regression in middleware (matcher mis-config, accidental allowlist entry, etc.) cannot leak a layout. The Server Component bail happens before any data fetches.

## Next Phase Readiness

- **Plan 01-03 (Vercel deploy)** unblocked. The auth surface is the last functional piece Phase 1 needed before a real domain stands up. `apps/web/.env.local.example` ships the three keys Vercel needs. Allowed Hosts in Supabase (currently `localhost:3012` only) gets the production Vercel URL added during 01-03's deploy step.
- **Phase 2 (data model + RLS)** can use `(auth.jwt() ->> 'country_code') = <table>.country_code` as the baseline tenant predicate, with `(auth.jwt() ->> 'user_role') = 'hq_admin'` as the cross-country override. The hook + claims + middleware established here are the foundation that pattern depends on. Cross-country tests (`country-admin-test@…` cannot read country-A data while their JWT scopes them to `MZ`) become feasible the moment the first leads table ships.
- **Phase 3 (realtime queue)** consumes the agent role + country claim directly: a Realtime channel subscription scoped by `country_code = (auth.jwt() ->> 'country_code')` will Just Work because the JWT hook already populates it.
- **No dangling threads:** every imported symbol is used, every file has a real (if minimal) body, no `console.log`, no `any`, no TODOs. The middleware deprecation warning and the env example file content tweak are the only known follow-ups, both logged here.
