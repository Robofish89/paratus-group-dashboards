# Project: Paratus Group Dashboards

## Type
- Client work — **Paratus Group** (standalone, group-wide initiative)
- ⚠️ This project is NOT for Paratus Namibia and is NOT a derivative of the AMA / AMA Care work. Visual design is inherited for brand congruence; everything else is independent.
- Middleman: William @ Brainstorm Projects
- Provider: DigimountAI (footnote in deliverables only)
- Service accounts: master Google account is **`para.group.n8n@gmail.com`** — Supabase + Vercel already created under this account. GitHub: new account/org under the same email recommended (decision pending). See `CREDENTIALS.md`.

## Build & Run
- Dev: `npm run dev` (turborepo runs all apps in parallel)
- Build: `npm run build`
- Lint: `npm run lint`
- Type-check: `npm run type-check`

## Tech Stack
- Next.js 16 + React 19 + TypeScript
- Tailwind CSS v4 (theme tokens in `packages/ui/src/styles/theme.css`)
- shadcn-style UI in `packages/ui` (mirrored from AMA project for brand congruence)
- Supabase: project ref TBD — single "Paratus Group" project, multi-tenant via RLS by `country_code`
- Vercel: project name TBD — deploys from `main`
- Single Next.js app under `apps/web` with role-grouped routes

## Architecture
Monorepo (Turborepo). Single Next.js app with role-grouped routes:
- `apps/web/app/(hq)/...`            — group-wide HQ overview
- `apps/web/app/(country-admin)/[country]/...`  — per-country admin
- `apps/web/app/(sales-rep)/[country]/queue/...` — agent call queue
- `packages/ui` — design system + layouts (DashboardLayout, AuthLayout)
- `packages/supabase` — client/server/middleware + DAL + Zod schemas + migrations
- `packages/config` — shared eslint/tailwind/typescript

## Brand
- Primary `#2B479B` · Secondary `#3B5FC0` · Accent orange `#F7941D` · Sidebar `#0F172A`
- Typography: DM Sans (legacy mockups) — verify against AMA's current font stack before locking
- Source of truth for visuals: `docs/design-reference/` + `packages/ui` from AMA

## Security
- Follow ALL rules in global ~/.claude/CLAUDE.md security section
- RLS: must be enabled on EVERY table from migration 001 onwards
- All policies must scope by `country_code` from JWT custom claims (multi-tenancy)
- Service role key never in `NEXT_PUBLIC_*`
- Data Access Layer at `packages/supabase/src/dal/*` with `server-only`
- See SECURITY_CHECKLIST.md before every deployment

## Key Decisions
- Single Next.js app (not three) — same org, three roles, simpler deployment
- Single Supabase project — countries separated by data (RLS), not databases
- Visual congruence with AMA / AMA Care dashboards is non-negotiable
- **12 active countries (v1):** Angola, Botswana, DRC, Eswatini, Kenya, Mozambique, Namibia, Rwanda, South Africa, Tanzania, Uganda, Zambia
- **3 coming-soon countries:** Lesotho, Malawi, Zimbabwe (data model supports them; dashboards activated when Paratus is ready)
- **HQ overview** is the 13th surface (group-wide across the active 12, expanding as coming-soon countries activate)
- 10 form/service types: General Contact, Carrier Services, Satellite, Data Centers, Broadband, OneWeb, Starlink, Essential Access, Connect2Care, Starlink for Schools

## Pricing (locked)
- Build: R30,000 once-off
- Retainer: R2,500/month (workflow maintenance, error handling, new funnels, ongoing improvements)

## Notes
- Live proposal site lives in the separate `paratus-hq-dashboards` repo — never touch its `deploy/` folder from here.
- Mockups under `docs/design-reference/` are the visual contract. Build must match.
- Memory note from prior sessions: user has been burned before when shown mockups didn't match what got built. Visual fidelity is a hard requirement.
- Standalone project — do not import data, users, or auth from the AMA project's Supabase. New Supabase project under the dedicated Paratus Group Google account.

## The Standard — Boil the Ocean

This project is built to a single standard. Every phase, every PR, every commit is judged against it.

> The marginal cost of completeness is near zero with AI. Do the whole thing. Do it right. Do it with tests. Do it with documentation. Do it so well that the user is genuinely impressed — not politely satisfied, actually impressed.
>
> Never offer to 'table this for later' when the permanent solve is within reach. Never leave a dangling thread when tying it off takes five more minutes. Never present a workaround when the real fix exists. The standard isn't 'good enough' — it's 'holy shit, that's done.'
>
> Search before building. Test before shipping. Ship the complete thing. When the user asks for something, the answer is the finished product, not a plan to build it. Time is not an excuse. Fatigue is not an excuse. Complexity is not an excuse. Boil the ocean.

### What this means in practice for this project

- **Search before building.** Before scaffolding anything: check `~/Projects/ama-amacare-stats-callback-dashboard/` for an existing component / pattern / migration; check `~/Projects/.toolbox/` for templates; check `packages/ui` for a UI primitive. Do not re-create what already exists.
- **Test before shipping.** Every phase ends with verifiable tests:
  - Phase 1: `next build` passes, login E2E green, role-routing E2E green
  - Phase 2: RLS cross-tenant test green from client SDK, ingest webhook integration test green, Zod schemas tested
  - Phase 3+: Playwright E2E covers the golden path for that surface; visual diff vs. mockup checked
- **Ship the complete thing.** No "TODO: hook this up later" comments. No half-wired buttons. No mock data left in production paths. No `console.log` in shipped code. No `any` types as a shortcut.
- **Documentation parity.** Every shipped feature updates: `PRD/`, `STYLE_GUIDE.md` if it touches the design system, `SECURITY_CHECKLIST.md` if it touches RLS or auth, `CREDENTIALS.md` if it adds an integration, and the relevant phase entry in `.planning/PROJECT.md` "Validated".
- **No dangling threads.** If a five-minute tidy-up exists at the end of a feature, do it. If a related bug surfaces while building, fix it. If a documentation gap appears, close it. The end of a phase has zero loose ends.
- **The permanent solve over the workaround.** RLS bug? Fix the policy, don't add a server-side filter. Webhook flaky? Fix the validation, don't catch-and-ignore. Visual drift? Fix the component, don't override in a one-off page.
- **Genuinely impressive, not politely satisfactory.** The bar for "phase done" is the user's reaction, not a checklist tick. If a phase ships and the user's response is "yeah, looks fine," that's a failure. The target is: "holy shit, that's done."

### Operational rules (no exceptions)

1. **Before any non-trivial change**, run the working-agreement checklist from global CLAUDE.md (assumptions stated, simplest approach, surgical diff, success criteria named).
2. **Every phase ends with all of:** code shipped, tests written and green, docs updated, security checklist re-run, commit on `main`, short demo / Loom optional.
3. **No phase is "complete" with known broken paths.** Either it works end-to-end or it isn't done.
4. **No "phase 1 lite" / "MVP first then iterate" carve-outs without explicit user approval.** Default is the complete phase.
5. **If a five-more-minutes tidy is visible, take it.** Naming, formatting, dead imports, missing types, half-finished JSDoc — close it now, not later.
