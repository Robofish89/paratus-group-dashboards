# Handoff: Plan 01-03 Vercel Deploy — paused for the night, 2026-04-27

> Read this first. Then run the steps in §"Resume sequence" without asking the user to repeat context.

## Where we are

**Phase 1 / Plan 01-02 — auth + RBAC + role routing — COMPLETE.**
- All six verification matrix scenarios green against `localhost:3012`.
- Commit `b4439eb` shipped the JWT-hook RLS fix + middleware/layout cleanups + 01-02 SUMMARY.

**Phase 1 / Plan 01-03 — Vercel deploy — IN PROGRESS, paused mid-Task-1.**
- Plan: `.planning/phases/01-foundation/01-03-PLAN.md`
- Local-only pieces of Task 1 already shipped on `main` (commit `b771540`):
  - `apps/web/vercel.json` (framework: nextjs, region: fra1)
  - `apps/web/app/api/health/route.ts` (public health endpoint, `server-only` guard, returns `{ status, commit, ts }`)
- Verified: `curl localhost:3012/api/health` returns `{"status":"ok","commit":"local","ts":"..."}`. `type-check` + `lint` both green.

## Why we paused

The Vercel CLI is authenticated as `robofish89` (the user's personal account). Plan 01-03 + `CREDENTIALS.md` require `para.group.n8n@gmail.com` (the dedicated Paratus Group account that owns the existing `paratus-group-dashboards` Vercel project). The switch is interactive (browser flow) and the user was going to bed.

Local commits are NOT pushed yet — pushing to `main` triggers the prod deploy and env vars aren't set yet.

## Resume sequence (when user says "go" or "ready")

1. **Confirm CLI account.**
   ```
   vercel whoami
   ```
   Must return the para.group.n8n email/handle. If it's still `robofish89`:
   - Tell the user: `! vercel logout && vercel login` and pick "Continue with Google" → `para.group.n8n@gmail.com`.
   - Wait for confirmation, then re-run `vercel whoami`.

2. **Link the project.**
   ```
   cd /Users/gerhardvandenheever/Projects/paratus-group-dashboards
   vercel link
   ```
   - Scope: para.group.n8n account
   - Project: select existing `paratus-group-dashboards` (do NOT create a new one)
   - Root directory: monorepo root
   - If Vercel asks for build overrides — Build Command: `npm run build`, Output: `apps/web/.next`, Install: `npm install`. Otherwise let auto-detect handle it.

3. **Verify `.vercel/project.json` is gitignored.**
   ```
   git check-ignore .vercel/project.json
   ```
   Should print `.vercel/project.json`. The `.gitignore` already covers `.vercel` from Plan 01.

4. **Set env vars across Production / Preview / Development.**
   For each of `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`:
   ```
   vercel env add <NAME> production
   vercel env add <NAME> preview
   vercel env add <NAME> development
   ```
   - **DO NOT echo values in chat.** The CLI prompts for the value — user pastes directly into the terminal.
   - Source: same values currently in `apps/web/.env.local`.
   - After adding `SUPABASE_SERVICE_ROLE_KEY`, mark it Sensitive in the Vercel dashboard if the CLI didn't set that flag.
   - Verify with `vercel env ls` — three keys × three environments = nine rows.

5. **Push to main → triggers prod deploy.**
   ```
   git push origin main
   ```
   The previous commits already include vercel.json + health route + auth fixes. No new code commit needed at this step.

6. **Wait for deploy.** Poll until Ready:
   ```
   vercel ls --prod
   ```
   If it errors, read `vercel logs <deployment-url>`, fix root cause (no `--no-verify` shortcuts), re-commit, re-push.

7. **Capture production URL** (likely `https://paratus-group-dashboards.vercel.app`).

8. **Update Supabase Allowed Hosts.** Two-stage:
   - User does this manually in Supabase Dashboard → Authentication → URL Configuration:
     - Add the Vercel production URL to Site URL + Redirect URLs.
     - Optionally add `https://*.vercel.app/**` for previews, OR a specific preview alias.
   - OR script via the supabase-paratusgroup MCP if there's an admin endpoint for it (verify before assuming).

9. **Enable Vercel Preview Deployment Protection.** User does this in Vercel Dashboard → Settings → Deployment Protection → Vercel Authentication or Password Protection (Preview only, Production stays public).

10. **Production smoke test.** Walk the user through the verification matrix from `01-03-PLAN.md` § human-verify against the production URL. Don't proceed until they type "approved".

11. **Update docs (Task 2 step 5):** PROJECT.md / Validated, README "Live URL", SECURITY_CHECKLIST re-run, PRD/milestones.md Phase 1 ticked. Verification commands listed in the plan.

12. **Tag.** `git tag phase-1-complete && git push origin phase-1-complete`.

13. **Write summaries.** `01-03-SUMMARY.md` and `PHASE-SUMMARY.md` per the plan's `<output>` block.

## Test users (Gmail+ aliases route to `para.group.n8n@gmail.com`)

| Email | Role | Expected landing |
|---|---|---|
| `para.group.n8n+hq@gmail.com` | hq_admin | `/` |
| `para.group.n8n+country-admin@gmail.com` | country_admin (MZ) | `/mz` |
| `para.group.n8n+agent@gmail.com` | agent (MZ) | `/mz/queue` |

Password: whatever the user set during Plan 01-02 seeding.

## Things to NOT do

- Do NOT push to main while a deploy is mid-flight.
- Do NOT run `vercel --prod` from CLI for the first prod deploy — main push is the trigger per CLAUDE.md.
- Do NOT bypass `vercel env add` and write secrets into a committed file.
- Do NOT mark Phase 1 Validated in PROJECT.md until the user approves the production smoke test.
- Do NOT use `--no-verify` or skip hooks if the deploy fails. Fix root cause.

## State of the repo

- Branch: `main`, 12 commits ahead of `origin/main`.
- Working tree clean.
- Latest commits:
  - `b771540` feat(01-03): add vercel.json + /api/health endpoint
  - `b4439eb` fix(01-02): unblock JWT hook + tighten role routing for 404s and logout
  - earlier 01-02 work (`bd38a38`, `54dff4b`, `5cc13ed`, `647dc1b`, `34ba78b`)
