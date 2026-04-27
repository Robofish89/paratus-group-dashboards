# Credentials & Services — Paratus Group Dashboards

Which accounts/services are connected and who owns them.
**No actual secrets here** — those go in `.env.local` only.

## Ownership

This is a **standalone project for Paratus Group**, not a Paratus Namibia / AMA initiative. A dedicated Google account is being created specifically for this product. All third-party integrations (Supabase, Vercel, GitHub, n8n, etc.) will live under that Google account — separate from any DigimountAI or AMA accounts.

| Layer | Owner | Notes |
|-------|-------|-------|
| Master Google account | Paratus Group (created for this project) | Single sign-in seed for all integrated services |
| Integrated services | All registered via the Paratus Group Google account | Promotes a clean handover to client and isolates blast radius from DigimountAI's other clients |
| Codebase / build | DigimountAI (during build) → handover at completion | Footnote-only branding |

## Services to Connect

| Service | Account Owner | Project/Ref | Status |
|---------|--------------|-------------|--------|
| Google (master) | Paratus Group | **`para.group.n8n@gmail.com`** | ✅ created |
| Supabase | Paratus Group (Google SSO via `para.group.n8n@gmail.com`) | project ref TBD — confirm at Phase 1 wiring | ✅ created — needs URL + keys captured into `.env.local` |
| Vercel | Paratus Group (Google SSO via `para.group.n8n@gmail.com`) | `paratus-group-dashboards` | ✅ created — needs CLI link to repo at Phase 1 |
| GitHub | **Decision: new GitHub account or organisation under the same Google email — recommended for clean handover** (alternative: user's personal account, transfer at handover) | repo URL TBD | pending |
| Domain | Paratus (subdomain on `paratus.africa` preferred) or temp domain via Vercel | TBD | pending |

## APIs & Integrations

| Service | Purpose | Account Owner | Status |
|---------|---------|--------------|--------|
| n8n (self-hosted or cloud) | Lead ingestion bridge from existing form/sheet flows (see `PRD/lead-ingestion.md`) | Paratus Group account if needed | pending |
| Resend (or similar) | Internal SLA breach alerts | Paratus Group account | defer to phase 6 |
| Google Sheets API | Read existing leadsheets during transition (only if backfill needed) | Paratus Group Google | pending |

## Environment Variables Needed
```
# Supabase
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=

# Lead ingestion webhook
LEAD_INGEST_SECRET=

# (phase 6+) Email alerts
RESEND_API_KEY=
ALERT_FROM_EMAIL=
```

## Access Notes

- Do **not** use `mcp__supabase-digimount` (that's the DigimountAI workspace) for this project's data. The Paratus Group Supabase project sits under `para.group.n8n@gmail.com`; once the project ref + service-role key are captured, we'll add an MCP entry under tentative name `mcp__supabase-paratus-group` so this session can talk to it.
- During build, DigimountAI may have collaborator access; at handover, transfer ownership entirely to the `para.group.n8n@gmail.com` account.
- Vercel: ✅ Vercel plugin installed via `npx plugins add vercel/vercel-plugin` on 2026-04-27 (25 skills, 6 commands, 3 agents, hooks, MCP). Claude Code must be restarted for the plugin to load. Once loaded, `vercel link` from `apps/web` against the project created under `para.group.n8n@gmail.com`.
- Client onboarding flow (admin invites, country admin role assignment) — separate doc to be created near launch.

## When credentials get wired

- **Now (before Phase 1 starts):**
  1. ✅ Vercel plugin installed (2026-04-27) — restart Claude Code to load it
  2. Capture the Supabase project URL + anon key + service-role key from the Supabase dashboard → I'll write them into `apps/web/.env.local` (gitignored) once `apps/web` is scaffolded
  3. Decide GitHub host (see below) and create the empty repo
- **During Phase 1 scaffolding:**
  4. `vercel link` from `apps/web` → connects local repo to the Vercel project
  5. Vercel env vars set for dev / preview / production (separate values where applicable, mark service-role key as Sensitive)
  6. Supabase Allowed Hosts restricted to localhost (dev) + the eventual production domain
- **End of Phase 1:**
  7. First push to `main` → Vercel auto-deploys → smoke test the placeholder pages live

## GitHub — recommendation

Create a **new GitHub account under `para.group.n8n@gmail.com`** (or a GitHub Organisation owned by that account). Reasons:
- Matches the Supabase / Vercel ownership model — one Google account owns the entire stack
- Handover at completion = a single email + password transfer, not a per-service migration
- Personal repos held by you become a coupling that has to be unwound later

If you'd rather move faster: use your personal GitHub temporarily and **transfer the repo** at handover. GitHub's repo transfer preserves history, issues, and PRs. Either path works; the new-account path is cleaner.

My default unless you say otherwise: new GitHub account / org under `para.group.n8n@gmail.com`.

## Boundary

This project shares **only** these things with the AMA / AMA Care work:
- Visual design tokens (`packages/ui/src/styles/theme.css`) and component shapes for brand congruence
- Architectural patterns (Turborepo layout, RBAC migration shape, JWT custom claim hook)

It shares **none** of the following:
- Data, users, auth, Supabase project, Vercel project, domain, GitHub repo, billing
