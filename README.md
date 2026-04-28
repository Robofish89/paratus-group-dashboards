# Paratus Group Dashboards

Lead management dashboard system for **Paratus Group** across 12 active African countries (Lesotho, Malawi, Zimbabwe coming soon).

> Standalone project for Paratus Group — not a Paratus Namibia / AMA derivative. Visual design is inherited from the AMA dashboards for brand congruence; everything else (data, auth, infra, billing) is independent and lives under a dedicated Paratus Group Google account.

Three role-based dashboards built as a single Next.js app with country-scoped routing:

- **HQ Overview** — group-wide lead pipeline, country leaderboard, speed-to-lead, conversion analytics
- **Country Admin** — per-country lead management, agent performance, funnel breakdown
- **Sales Rep Call Queue** — agent's prioritised call list with outcome capture

## Stack

- **Next.js 16** + React 19 + TypeScript (single app under `apps/web`)
- **Tailwind CSS v4** + shadcn-style components in `packages/ui`
- **Supabase** (auth, DB, RLS, realtime) — schema and DAL in `packages/supabase`
- **Turborepo** monorepo
- **Vercel** deploy

## Live URL

Production: <https://paratus-group-dashboards.vercel.app>

`main` deploys to production via Vercel's GitHub integration. Health check: <https://paratus-group-dashboards.vercel.app/api/health>.

## Brand

Design system mirrors the AMA / AMA Care dashboards for visual congruence across Paratus properties.

- Primary `#2B479B` · Secondary `#3B5FC0` · Accent `#F7941D` · Sidebar `#0F172A`
- DM Sans (legacy mockups) → matched against system tokens in `packages/ui/src/styles/theme.css`

## Layout

```
apps/
  web/                  # single Next.js app, role-grouped routes
packages/
  ui/                   # design system (theme + components + layouts)
  supabase/             # client/server/middleware + DAL + Zod schemas + migrations
  config/               # shared eslint, tailwind, typescript configs
docs/
  design-reference/     # approved quote mockups + screenshots (visual source of truth)
PRD/                    # product requirements (overview, features, data model, …)
.planning/              # GSD framework — PROJECT.md, roadmap, phase plans
```

## Getting Started

```bash
npm install
cp apps/web/.env.local.example apps/web/.env.local   # then fill in Supabase keys
npm run dev
```

Local dev runs on **<http://localhost:3012>** (not 3000 — collision with other DigimountAI projects). See `CREDENTIALS.md` for env-var sources.

See `PRD/overview.md` for product context, `.planning/PROJECT.md` for current state, and `.planning/roadmap.md` for phases.
