---
phase: 01-foundation
plan: 03
subsystem: deploy
requires: [01-01, 01-02]
provides:
  - vercel-deploy
  - production-url
  - security-headers
  - health-endpoint
  - phase-1-tag
affects:
  - 02-*
  - all-future-phases-deploy-pipeline
tags:
  - deploy
  - security
  - phase-gate
key-decisions:
  - vercel-region-fra1
  - single-supabase-project-across-envs
  - main-as-prod-trigger
  - cli-managed-env-vars-via-supabase-mcp
key-files:
  - apps/web/vercel.json
  - apps/web/app/api/health/route.ts
  - .planning/PROJECT.md
  - README.md
  - SECURITY_CHECKLIST.md
  - PRD/milestones.md
---

# 01-03 Summary — Vercel Deploy + Phase 1 Closure

## Accomplishments

- **Vercel project linked** under the `paratusgroup` team (owned by `para.group.n8n@gmail.com`, project name `paratus-group-dashboards`). `.vercel/project.json` written locally and confirmed gitignored. Project ID `prj_OOxhqZfGMXtBaLtlGqu6dB5SV0qe` / org `team_MhNrKgfTjhNjaGWj8iQcUiq1`.
- **Nine env vars set** across production / preview / development for `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`. Public values pulled directly via the `supabase-paratusgroup` MCP (`get_project_url`, `get_publishable_keys`); the service-role key was piped into `vercel env add` from the local `.env.local` via a one-shot script (`/tmp/paratus-setvars.sh`) — no secret values ever crossed chat.
- **`apps/web/vercel.json`** in place: `framework: nextjs`, `regions: ["fra1"]` (Frankfurt — closest to African users at v1; revisit per-country edge optimisation in Phase 6).
- **`/api/health` endpoint** shipped at `apps/web/app/api/health/route.ts`. Public, `server-only` import guard, returns `{ status, commit, ts }`. Verified live: returns commit SHA `7682698c1b449323e28e4321e29a04a4c95f5953` matching the head of `main`.
- **GitHub → Vercel git integration** wired (Robofish89/paratus-group-dashboards repo connected to the `paratus-group-dashboards` Vercel project, root directory `apps/web`, "include files outside root" enabled for the monorepo workspaces). Push to `main` triggers production builds.
- **First production deploy green.** Build duration ~6 min, status Ready, lambdas generated for `[country]`, `[country]/queue`, `(hq)`, etc. Aliased to `https://paratus-group-dashboards.vercel.app` (the Phase-1 production URL).
- **Production smoke test passed** against the prod URL with all three Gmail+ alias test users:
  - HQ user → lands on `/` ✓
  - Country-admin (MZ) → lands on `/mz`; cross-country `/zm` blocked ✓
  - Agent (MZ) → lands on `/mz/queue`; admin `/mz` redirects back to queue ✓
  - Anonymous `/` → 307 → `/login?redirectTo=%2F` ✓
- **Security headers verified live** via `curl -sSI`. All five required headers present: `content-security-policy`, `strict-transport-security`, `x-frame-options: DENY`, `x-content-type-options: nosniff`, `referrer-policy: strict-origin-when-cross-origin`.
- **`SECURITY_CHECKLIST.md` re-run** with the Phase-1 results inline. Items beyond Phase 1's surface (cross-tenant client-SDK tests, webhook HMAC, rate limiting) explicitly marked as Phase 2/6.
- **Docs closure:** `.planning/PROJECT.md` Phase 1 moved to Validated; `README.md` got a Live URL block plus an honest dev quickstart (port 3012, env-var copy step); `PRD/milestones.md` Phase 1 fully ticked with the 2026-04-28 validation stamp.

## Issues Encountered

- **Vercel CLI started authenticated as the user's personal Vercel account (`robofish89`).** Per `CREDENTIALS.md` the project must live under `para.group.n8n@gmail.com`. Resolved by running `vercel logout && vercel login` interactively — the CLI stores one logged-in account globally, not per-project.
- **The `paratusgroup` Vercel team had no GitHub login connection.** First `vercel link --yes` succeeded at creating the project but failed to auto-attach the GitHub repo (`Failed to link Robofish89/paratus-group-dashboards. You need to add a Login Connection to your GitHub account first. (400)`). Resolved by the user installing the Vercel GitHub app on `Robofish89` and connecting the repo via Project Settings → Git in the Vercel dashboard.
- **Repeated paste-mangling of multi-line bash commands in the `!`-prompt.** zsh kept fragmenting `for env in production …` loops on copy-paste. Resolved by writing a single-purpose script (`/tmp/paratus-setvars.sh`) and asking the user to run `bash /tmp/paratus-setvars.sh` — bypassed the paste-quoting issue and let the script also defensively `vercel env rm` any partial entries from earlier garbled attempts.
- **`apps/web/.env.local` was permission-blocked** from the assistant's Read/Bash tools (correct behaviour — secrets are protected by hooks). The 6 non-secret values (URL × 3 envs, anon key × 3 envs) were retrieved through the `supabase-paratusgroup` MCP instead. The 3 service-role entries needed the user to run the helper script.

## Deviations from Plan

- **Project did not pre-exist under `para.group.n8n@gmail.com`** as the plan assumed — `vercel link --yes --project paratus-group-dashboards --scope paratusgroup` created it. Functionally identical to the plan's "select existing" step.
- **Root directory set to `apps/web`** (not the monorepo root that the plan suggested). The "Include files outside root directory in Build Step" toggle is enabled so workspace packages still resolve — but the build runs against the Next.js app's directory, which is what Vercel's Next.js preset expects.

## Production URL

- **Production:** <https://paratus-group-dashboards.vercel.app>
- **Health:** <https://paratus-group-dashboards.vercel.app/api/health> → `{ status: 'ok', commit: '7682698…', ts: '…' }`
- **Aliases active:** `paratus-group-dashboards-paratusgroup.vercel.app`, `paratus-group-dashboards-git-main-paratusgroup.vercel.app`
- **Build region:** `fra1`

## Phase 1 Gate Closure

| Gate | Evidence |
|---|---|
| `vercel ls --prod` shows latest deploy Ready from `main` | `dpl_Eo5y7h6Bj6NjN8axEA3AeedzivQR` — status Ready, target production, deployed by `paragroupn8n-9569` |
| Production URL responds with all security headers | `curl -sSI` shows all 5 (CSP / HSTS / X-Frame-Options / X-Content-Type-Options / Referrer-Policy) |
| All three test users complete role-routing on prod | Smoke test 2026-04-28: HQ → `/`, country-admin → `/mz`, agent → `/mz/queue`. Cross-country and cross-role redirects verified. |
| Cross-country redirects work in production | Country-admin (MZ) → `/zm` blocked; agent → `/mz` admin path bounced to `/mz/queue` |
| `/api/health` returns 200 with commit sha | `{"status":"ok","commit":"7682698c1b449323e28e4321e29a04a4c95f5953","ts":"…"}` |
| No secrets in git | `git ls-files \| grep -E '\.env\|\.vercel'` returns only `.env.local.example` (template, no secrets) |
| No `NEXT_PUBLIC_*SERVICE*` in committed code | `grep` clean — sole match is an error-message string in `packages/supabase/src/admin.ts`, not an env-var assignment |
| `.planning/PROJECT.md` shows Phase 1 in Validated | Updated this commit |
| `PRD/milestones.md` Phase 1 fully ticked | All 12 checkboxes ticked, `Validated 2026-04-28` stamp on header |
| `SECURITY_CHECKLIST.md` re-run end-to-end | Phase-1 items ticked with evidence; Phase 2/6 items left explicitly unticked with deferred notes |
| `README.md` quickstart matches as-built reality | Port `3012`, env copy step, Live URL block added |
| `phase-1-complete` tag on `main` | Tag created + pushed in this closure commit |
| No `console.log`, no `any`, no TODOs, no half-wired UI | Verified via lint + type-check + grep on the diff |

### Outstanding user-side items (non-blocking)

- **Supabase Site URL** still set to `http://localhost:3012` — should be flipped to `https://paratus-group-dashboards.vercel.app` so password-reset / email-confirmation links point to prod. Redirect URLs are already correct.
- **Vercel Preview Deployment Protection** — recommended (Settings → Deployment Protection → Vercel Authentication, Preview only). Production stays public so the dashboard's own login can gate it.

## Next Phase Readiness — Phase 2 Handoff

Phase 2 (Data Model & Ingestion) inherits a clean foundation:

- **Tenant key:** `country_code` JWT claim, populated by `custom_access_token_hook(event)`. Phase 2 RLS policies on `leads` / `lead_events` / `callbacks` should use `(auth.jwt() ->> 'country_code') = <table>.country_code` for country-scoped reads, plus `(auth.jwt() ->> 'user_role') = 'hq_admin'` for the HQ override pattern. Confirmed live in production JWTs.
- **Ingest endpoint home:** `apps/web/app/api/leads/ingest/route.ts` — already on the middleware public allowlist precedent (`/api/health`), so Phase 2 just needs to add it to the same list. HMAC + shared-secret pattern documented in `PRD/lead-ingestion.md`.
- **DAL convention:** all server-only helpers under `packages/supabase/src/dal/*` with `import 'server-only'`. Phase 2 should add `dal/leads.ts`, `dal/lead-events.ts`, `dal/callbacks.ts`, `dal/dashboard-views.ts`.
- **Migration sequence:** `00001` (RBAC) and `00002` (auth-admin read on `user_roles`) shipped. Phase 2 starts at `00003_reference_data.sql` for countries + forms seed, then `00004_leads_and_events.sql`, then `00005_views.sql`.
- **Cross-tenant leak test** (deferred from Phase 1) is the first Phase-2 verification gate: client-SDK reads as country-A user against country-B rows must return 0 rows.
