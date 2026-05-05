# Plan 07-01 — Bulk-invite engine — SUMMARY

**Status:** shipped 2026-05-05
**Commits:**
- `b0ecc94` — feat(07-01): React Email invite template + sendInviteEmail wrapper
- `c5241e2` — feat(07-01): provision-users.ts bulk-invite script + tsx + CSV example
- `0c2367c` — test(07-01): provision-users.ts integration tests against hermetic stack

## What landed

### Code

```
packages/supabase/src/lib/
├── email.ts                          MOD — sendInviteEmail() + __resetEmailClientForTests
└── emails/invite.tsx                 NEW — paratus-blue + accent-orange React Email template
packages/supabase/
└── package.json                      MOD — exports map: ./lib/emails/invite + ./lib/emails/sla-breach

apps/web/scripts/
├── provision-users.ts                NEW — bulk-invite runner (main(argv, overrides))
├── _server-only-preload.cjs          NEW — tsx require-hook intercepting `server-only`
├── _server-only-shim.cjs             NEW — empty CJS module the preloader substitutes
└── __tests__/provision-users.test.ts NEW — 5 vitest cases (happy / idempotent / order / 2× CSV reject)

apps/web/
├── package.json                      MOD — tsx@^4.21 added as devDep
└── vitest.config.ts                  MOD — include also scripts/__tests__/

.planning/
└── rollout-contacts.csv.example      NEW — three-row schema example (no real PII)

.gitignore                            MOD — .planning/rollout-contacts.csv (real CSV ignored)
```

### Behavioural contract

`provision-users.ts` per-row flow (load-bearing order — 07-RESEARCH pitfall 1):

1. `admin.auth.admin.createUser({ email, email_confirm: false, user_metadata: { full_name } })`
   — gets the auth UUID, sends nothing. On `email_exists` (or "already registered" message), fall back to `listUsers` lookup.
2. `admin.from('user_roles').upsert({...}, { onConflict: 'user_id' })` — closes the JWT-hook race.
3. `admin.auth.admin.generateLink({ type: 'invite', email, options: { redirectTo: ${APP_URL}/auth/accept-invite } })` — re-issues OTP without sending (works on re-runs; bypasses supabase/auth#2180).
4. `sendInviteEmail({ to, fullName, role, countryName, actionUrl, userId, supportEmail })` via Resend.

CLI:
- positional CSV path (default `.planning/rollout-contacts.csv`)
- `--dry-run` parses + validates without any Supabase / Resend call
- `--country=<CC>` filters to one country (used by 07-03)

Logging: one JSON line per row (`event: 'user_provisioned'` or `event: 'user_provision_failed'` with structured `step`); single `event: 'provision_summary'` at end. Exit 0 when every row succeeded, 1 when any failed.

## Verification (against the plan's checks)

| Check | Expected | Observed |
|-------|----------|----------|
| `npm run type-check` | passes | ✓ |
| `npm run lint` | passes | ✓ |
| `npx tsx --require ./apps/web/scripts/_server-only-preload.cjs apps/web/scripts/provision-users.ts --dry-run .planning/rollout-contacts.csv.example` | exits 0; 3× `csv_row_validated` + `provision_summary`; offline | ✓ |
| `git grep -n 'inviteUserByEmail' apps/web packages/` returns zero in code | only matches inside the avoidance comment in `email.ts` | ✓ (intentional) |
| `cat .gitignore | grep -E '^\.planning/rollout-contacts\.csv$'` | matches | ✓ |
| 5 vitest cases pass on the hermetic stack | cannot run in this environment — Docker not installed | **deferred to next dev box with Docker** |

## Deviations from the plan + why

| Plan said | We shipped | Why |
|-----------|------------|-----|
| Use `csv-parse/sync` | Use `papaparse` | `papaparse` is already an `apps/web` dep (the CSV importer at `/api/leads/import-csv` uses it). Adding a parallel `csv-parse` would duplicate surface for zero gain. |
| Add `sendInviteEmail` + `InviteEmail` to `packages/supabase/src/index.ts` | Did NOT add to index.ts | The package barrel comment explicitly bans re-exporting anything that imports `server-only`. `email.ts` is server-only; the React template lives behind it via internal relative import. Consumers reach for `@repo/supabase/lib/email` (server) or `@repo/supabase/lib/emails/invite` (client-safe template) directly — same pattern the SLA template uses today. |
| Verify entry: `cat .../package.json | grep '\"./lib/emails/invite\"'` | Added the entry as planned, AND back-filled `./lib/emails/sla-breach` (the plan author claimed it was already there but it wasn't) | The barrel `lib/email.ts` already imports the templates via relative paths so this is for symmetry / future direct-template imports. |
| Run script via `npx tsx apps/web/scripts/provision-users.ts ...` | Run via `npx tsx --require ./apps/web/scripts/_server-only-preload.cjs apps/web/scripts/provision-users.ts ...` | The script transitively imports `@repo/supabase/admin` and `@repo/supabase/lib/email` which both `import 'server-only'`. Plain tsx crashes at import (the `server-only` module throws on Node, intentionally). The preloader is a tiny CJS require-hook that aliases `server-only` to an empty module — same posture vitest's resolve.alias entry already takes. Production Next builds enforce the boundary unchanged (Webpack/Turbopack still bind `server-only` to its real implementation). |
| `apps/web/package.json` adds `tsx` "without bumping version, no new dependencies" | Added `tsx@^4.21` as devDep | The plan explicitly asked for tsx — quoted phrasing was about the supabase package, not apps/web. |
| Country slug → name lookup imported from `(country-admin)/[country]/_lib/country.ts` | Imported `ACTIVE_COUNTRIES` from `apps/web/app/_lib/countries.ts` | That's the actual location of the project's country lookup; the path the plan named doesn't exist. |
| Test 4 / 5 expect `step: 'csv_validation'` in the failure log | Implemented exactly that | — |

## Test count + outcomes

5 vitest cases authored in `apps/web/scripts/__tests__/provision-users.test.ts`:

1. **Happy path** — single agent CSV → `auth.users` row + `user_roles` row + 1× `sendInviteEmail` call with the invite OTP URL containing `${APP_URL}/auth/accept-invite` URL-encoded.
2. **Idempotency** — two consecutive runs leave `auth.users` at one row, `user_roles` at one row, but `sendInviteEmail` called twice (the documented re-send-for-lost-email posture).
3. **JWT-hook ordering** — spies on the user_roles upsert resolution and `generateLink` invocation; asserts upsert resolves BEFORE generateLink fires. **The load-bearing test of the file** — flip the script's per-row flow and this goes red.
4. **CSV rejection — hq_admin with country_code** — exit 1; createUser spy never called; `sendInviteEmail` never called; user does not appear in `auth.users`.
5. **CSV rejection — country_admin with empty country_code** — same posture as case 4.

The integration suite was authored and type-checked + lint-clean in this environment, but **could not be executed** because Docker isn't installed on this box (the hermetic stack requires it). Verification deferred to the next dev box that has Docker; the test file follows the established `apps/web/tests/sla.cron.test.ts` pattern, so no integration-shape surprises are expected.

`VITEST_USE_CLOUD=1` opt-out is unchanged from plan 06-05; bypasses `supabase start` and runs against the cloud project.

## Decision rationale — script-not-route layout

The plan asked (and we shipped) the bulk-invite engine as a CLI script under `apps/web/scripts/`, not as a Next.js route handler. Reasons:

1. **One-time use.** Phase 7 has one rollout. Building an in-app admin invite UI for a single ceremony is exactly the "infra for a thing that happens once" anti-pattern from 07-RESEARCH "Don't Hand-Roll".
2. **Service-role boundary.** The script needs `SUPABASE_SERVICE_ROLE_KEY` for `auth.admin.*`. Putting that behind a route would mean either (a) provisioning the secret to Vercel runtime (more attack surface) or (b) running the route only locally (defeats the route layer's purpose). The script gates on the operator possessing the key on their dev machine, which is the same posture as the existing `/api/e2e-login` test bridge.
3. **Test boundary alignment.** Tests live at `apps/web/scripts/__tests__/` (not `apps/web/tests/`) — the build-tool lane. Future bulk migration tools belong in the same lane and inherit the same vitest config seam.
4. **Retainer escape.** When Paratus needs ongoing onboarding (probably never; their user base is fixed), the retainer can wrap this exact script behind a `/<country>/admin/users` route. The script's `main(argv, overrides)` shape already accepts an injected admin client — the route would supply it via the cookie session and re-use the per-row flow.

## Follow-ons surfaced for plan 07-03 (real CSV provisioning)

- **The 8 open questions in 07-RESEARCH q1–q8 must be settled with William BEFORE Plan 07-03 runs.** Most critical:
  - Group Sales role (`hq_admin` vs per-country `agent`)
  - Martin Cox dual-role
  - Pilot ingestion path (Path 1 webhook vs Path 2 n8n bridge)
- **Real `.planning/rollout-contacts.csv`** to be assembled from William's contact list (already gitignored).
- **`INVITE_FROM_EMAIL` provisioning decision.** Optional override of `SLA_ALERT_FROM_EMAIL`. If William wants `welcome@` vs `alerts@` segmentation, set it in Vercel + .env.local before running.
- **Resend free-tier ratelimit posture.** Sequential per-row keeps us well under (10 req/sec ceiling); a 30-row first run is ~30 s.
- **Local-stack Docker requirement** for hermetic vitest. Test 3 (JWT-hook ordering) is the load-bearing assertion of the file; running it before 07-03 fires gives confidence the per-row order hasn't drifted. Pre-check: `docker ps && npm --workspace=apps/web run test scripts/__tests__/provision-users.test.ts`.

## File layout (final)

```
packages/supabase/
├── package.json                              exports: + ./lib/emails/invite, + ./lib/emails/sla-breach
└── src/lib/
    ├── email.ts                              + sendInviteEmail, + __resetEmailClientForTests
    └── emails/
        ├── sla-breach.tsx                    (unchanged from 06-01)
        └── invite.tsx                        NEW

apps/web/
├── package.json                              + devDep tsx@^4.21
├── vitest.config.ts                          + scripts/__tests__/ in include
└── scripts/
    ├── provision-users.ts                    NEW
    ├── _server-only-preload.cjs              NEW (tsx-only shim)
    ├── _server-only-shim.cjs                 NEW (tsx-only shim)
    └── __tests__/provision-users.test.ts     NEW

.planning/
└── rollout-contacts.csv.example              NEW
.gitignore                                    + .planning/rollout-contacts.csv
```

## Net new env vars

`INVITE_FROM_EMAIL` — **optional** override for invite sender. Falls back to `SLA_ALERT_FROM_EMAIL` if absent. No new required env beyond the Phase 6 set.
