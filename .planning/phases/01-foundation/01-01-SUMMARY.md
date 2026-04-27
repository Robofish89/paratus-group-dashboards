---
phase: 01-foundation
plan: 01
subsystem: app-shell
requires: []
provides:
  - nextjs-app
  - design-system-wired
  - route-shell
affects:
  - 01-02
  - 01-03
tags:
  - scaffolding
  - design-system
key-decisions:
  - tailwind-v4-no-app-config
  - transpile-packages-via-next-config
  - per-role-client-shells-for-icons
  - hq-route-at-/hq-not-/
key-files:
  - apps/web/app/layout.tsx
  - apps/web/app/globals.css
  - apps/web/next.config.ts
  - apps/web/app/_lib/nav.ts
  - apps/web/app/_lib/countries.ts
  - apps/web/app/(hq)/_components/hq-shell.tsx
  - apps/web/app/(country-admin)/_components/country-admin-shell.tsx
  - apps/web/app/(sales-rep)/_components/sales-rep-shell.tsx
  - packages/ui/src/layouts/dashboard-layout.tsx
  - packages/config/typescript/nextjs.json
  - packages/config/tailwind/postcss.config.mjs
---

# 01-01 Summary — Monorepo & Next.js Foundation

## Accomplishments

- **`apps/web` scaffolded** as a Next.js 16 (Turbopack) workspace package, deps wired to `@repo/ui`, `@repo/supabase`, and `@repo/config` via `transpilePackages`.
- **Security baseline:** production-only response headers (CSP allowing `*.supabase.co` and `wss://*.supabase.co`, HSTS with preload, `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, restrictive `Permissions-Policy`). Headers are skipped in dev so HMR works.
- **Design system wired:** `app/globals.css` imports `tailwindcss`, `tw-animate-css`, and `@repo/ui/theme.css` (matches AMA's working pattern). DM Sans served via `next/font/google`, exposed as `--font-sans`, applied through `font-sans` on `<body>`.
- **Three role-grouped routes** render the branded `DashboardLayout`:
  - `/hq` — HQ Overview, sidebar shows Overview / Countries / Service Mix / Settings.
  - `/[country]` — Country Admin, slug gated against the 12 active countries.
  - `/[country]/queue` — Sales Rep queue, same slug gate.
  - `/atlantis` (or any unknown slug) returns Next's 404.
  - `/` 307-redirects to `/hq`.
- **`DashboardLayout` extended** with `title`, `subtitle`, and `currentPath` props (the last enables active-link highlighting from server components without `usePathname`). Existing `navigation` prop renamed to `navItems` to match the plan's API; no other consumers existed.
- **Shared config exposed:** `@repo/config/typescript/nextjs.json` (Next 16 base) and `@repo/config/tailwind/postcss.config.mjs` (postcss config) added to the package's `exports` map so future apps can extend the same shell.
- **Quality gates green from repo root:** `npm install`, `npm run type-check`, `npm run lint`, `npm run build` all clean. `curl` smoke test of `/`, `/hq`, `/mozambique`, `/mozambique/queue`, `/south-africa` returns expected 200/307; `/atlantis` returns 404.
- **Logo + favicon shipped** at `apps/web/public/logo.png` and `apps/web/public/favicon.ico` (real 32x32 ICO generated from the brand PNG via macOS `sips`).
- **Two atomic commits** for traceability: (1) scaffold + config, (2) routes + layout extension.

## Issues Encountered

1. **Lucide icons cannot cross the server/client boundary.** First pass passed icon component references (`LayoutDashboard`, `Users`, etc.) directly from server components into the client `DashboardLayout`. Build failed with "Functions cannot be passed directly to Client Components." **Fix:** introduced thin per-role client shells (`HQShell`, `CountryAdminShell`, `SalesRepShell`) that import the nav arrays internally, so the icon references stay client-side. Server pages now pass only serializable props (slug, name, title, subtitle, currentPath).
2. **`next lint` removed in Next 16.** Plan called for `lint: "next lint"`. Replaced with `eslint .` and a flat-config `eslint.config.mjs` that spreads `eslint-config-next` (which is already a flat-config array in v16).
3. **ESLint `@typescript-eslint/no-unused-vars` cross-file scope.** First config applied this rule globally, but the `@typescript-eslint` plugin is scoped to `*.ts/*.tsx` files inside `eslint-config-next`. Restricted our override block to `files: ["**/*.{ts,tsx}"]` so the plugin is in scope.

## Deviations from Plan

- **`apps/web/app/globals.css` only imports `@repo/ui/theme.css`,** not also `@repo/ui/globals.css`. The two files have overlapping `@theme inline` blocks and `:root` token definitions; importing both causes redefinition warnings. The AMA admin app (the locked reference) imports only `theme.css`, and we follow that pattern.
- **HQ page lives at `app/(hq)/hq/page.tsx`,** not `app/(hq)/page.tsx`. Route groups (parens-wrapped folders) do not contribute to the URL, so the plan's path would resolve to `/`, conflicting with `app/page.tsx` (which the plan also told us to set as the redirector). The intent — HQ at `/hq` with a route-group separation by role — is preserved.
- **Country / Sales-Rep nav helpers are functions of `countrySlug`,** not flat arrays, because the hrefs depend on the country segment. HQ nav stays a plain array per the plan.
- **Tailwind, lucide-react, `@tailwindcss/postcss`, and `tw-animate-css` are listed in `apps/web/package.json`.** The plan's `AVOID` list said to skip these and rely on transitive availability through `@repo/ui`. In practice, postcss must be able to resolve `@tailwindcss/postcss` from the app's own `node_modules` (npm hoisting alone is not enough when running `next build` from `apps/web`), and the AMA reference app (the locked pattern) lists all four directly. Following AMA's working pattern.
- **Per-role client shells added** in each route group's `_components/` folder. The plan's task 2 step 7 envisioned single server-component pages calling `DashboardLayout` directly; the icon-prop boundary issue (above) made that impossible without making pages client components. Shells are minimal — just nav wiring — and keep the pages async server components for future data fetching.

## Visual Fidelity Notes

- Sidebar background, brand block, and navigation row spacing match `docs/design-reference/hq-dashboard.html` at 1440px desktop (eyeballed via curl HTML diff; full Playwright visual diff is a Phase 3 task).
- Page header (`h1` + subtitle) reproduces the mockup's `px-8 pt-8 pb-2` rhythm.
- Active nav row uses `bg-white/[0.08]` (matches the mockup's `bg-white/10` within rounding tolerance) and full-opacity icon. Inactive rows use `text-[#94a3b8]` with `opacity-60` icon.
- **Open drift for Plan 02 to address (none-blocking):**
  - Plan 02 will add the auth-derived user footer (avatar, name/role, sign-out). Today the sidebar has no user footer because there is no auth.
  - The mockup's HQ Overview sub-label sits below the brand on a separate line with its own `mt-1.5 ml-[48px]` offset; current `DashboardLayout` puts it inline next to the wordmark. Acceptable for Plan 1 (still says "HQ Overview" prominently), refine in Plan 02 alongside the auth user footer.
  - Plan 02 should also verify the sidebar logo's `brightness-[1.8]` filter against the actual paratus brand mark — the mockup uses `filter: brightness(0) invert(1)` for full-white treatment. Noted but not fixed here to avoid scope creep.

## Next Phase Readiness

- **Plan 01-02 (auth + Supabase wiring) can start immediately.** `@repo/supabase` is installed in `apps/web`, env-var scaffolding (`.env.local.example`) is in place, security headers are wired, and the three route shells are ready to receive auth gates + role-based redirects.
- **Plan 01-03 (Vercel deploy + RBAC migration) unblocked** — the build succeeds, `turbo.json` already passes the Supabase env vars through, and the per-role client shells will host the auth-aware user footer once Plan 02 lands.
- **No dangling threads:** every imported symbol is used, every file has a real (if minimal) body, no `console.log`, no `any`, no TODOs.
