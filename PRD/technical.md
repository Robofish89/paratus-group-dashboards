# Technical Requirements

## Stack
- **Next.js 16** (App Router, Server Components by default, Server Actions for mutations)
- **React 19**, **TypeScript 5**, strict mode
- **Tailwind CSS v4** (oklch theme tokens via `@theme inline` in `packages/ui/src/styles/theme.css`)
- **Supabase**: Postgres + Auth (`@supabase/ssr`) + Realtime + RLS
- **Recharts** for line/area charts (consistent with AMA admin app)
- **Turborepo** for monorepo orchestration
- **Vercel** for hosting; pushes to `main` deploy production
- **Zod** for all input validation (Server Actions, API routes, webhook ingest)

## Repo Layout

```
paratus-group-dashboards/
├── apps/
│   └── web/                      # single Next.js app
│       ├── app/
│       │   ├── (auth)/login/
│       │   ├── (hq)/             # role-grouped routes
│       │   ├── (country-admin)/[country]/
│       │   ├── (sales-rep)/[country]/queue/
│       │   └── api/
│       │       ├── leads/ingest/route.ts
│       │       └── leads/import-csv/route.ts
│       ├── middleware.ts         # auth + role/country routing
│       └── public/logo.png
├── packages/
│   ├── ui/                       # design system (mirrored from AMA)
│   ├── supabase/                 # client/server/middleware + DAL + schemas + migrations
│   └── config/                   # shared eslint/tailwind/typescript
├── docs/design-reference/        # approved mockups (visual contract)
├── PRD/
└── .planning/                    # GSD framework
```

## Auth & Routing
- Supabase Auth: email + password (magic-link optional later)
- Custom Access Token Hook injects `user_role` and `country_code` into JWT
- `middleware.ts` reads JWT, routes:
  - `hq_admin` → `(hq)` (or wherever they came from)
  - `country_admin` → `(country-admin)/{country_code}`
  - `agent` → `(sales-rep)/{country_code}/queue`
  - Unauthenticated → `/login`
- Country admins cannot access another country's URL — middleware redirects to their own
- HQ can access any country in read-only mode (`?as_hq=1` query flag, or simply by role check in the page)

## Data Access
- All DB calls go through `packages/supabase/src/dal/*.ts`
- DAL files start with `import 'server-only'`
- Client components never import the service role
- Mutations are Server Actions; each starts with auth check + Zod parse

## Realtime
- Per-user channels: agents subscribe to `leads:assigned_to=eq.<uid>`
- Country admins subscribe to `leads:country_code=eq.<cc>`
- HQ subscribes to a digest channel (or polls views every 30s — TBD by traffic)

## Performance Budget
- LCP < 2.0s on 4G
- Queue page interactive in < 1.5s after auth
- Realtime new-lead surfacing < 2s end-to-end
- DB queries < 200ms p95 (use views, not raw joins, for dashboards)

## Security (see `SECURITY_CHECKLIST.md`)
- RLS on every table from migration 001
- HMAC + shared-secret on `/api/leads/ingest`
- Rate limiting on webhook + auth endpoints (Vercel Edge or Supabase function)
- CSP, HSTS, X-Frame-Options in `next.config.ts`
- All Server Actions: auth check, Zod validate, then act

## Observability
- Structured logs from API routes & server actions (lead_id, country_code, user_id, latency_ms)
- Vercel Analytics + Web Vitals
- Supabase logs reviewed weekly during rollout
- Synthetic check on `/api/health` every 5 min (Phase 4)

## Deployment
- `main` → production (auto-deploy via Vercel)
- Feature branches → preview URLs (password-protected)
- DB migrations: applied via Supabase CLI from `packages/supabase/migrations/` — not on every deploy, only when migration files change
- Env vars: dev / preview / production all distinct in Vercel; secrets marked Sensitive

## Testing
- Component-level: optional, prioritise visual fidelity over unit tests for dashboards
- E2E: Playwright covering 3 golden paths (sales rep handles a lead, country admin reassigns, HQ drills into a country) — phase 3
- RLS tests: scripted from client SDK with two test users in different countries — phase 2

## Browser Support
- Modern Chrome / Edge / Safari / Firefox (last 2 versions)
- Mobile: iOS Safari 16+, Chrome Android (last 2 versions) — sales rep queue MUST work on phone
- IE / legacy Edge: not supported

## Constraints from Quote
- Single Next.js app (not three) — locked
- Single Supabase project — locked
- 4–6 week build timeline — locked
- Visual congruence with AMA — locked
