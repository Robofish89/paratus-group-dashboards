# Handoff: JWT Hook Bug — 2026-04-27

> Read this **first** in the new session. Then immediately run the diagnostic in §3 via the `supabase-paratus` MCP. Do not ask the user to do anything until you've finished the diagnostic.

## Context (read before doing anything)

**Phase 1 / Plan 01-02 — Auth + RBAC + Role Routing**
- Plan file: `.planning/phases/01-foundation/01-02-PLAN.md`
- Implementation: complete (`commits 34ba78b`, `5cc13ed`, `54dff4b`)
- Quality gates: green (`type-check`, `lint`, `build`)
- **Stuck at:** human-verify checkpoint. Login succeeds (Supabase verifies the password) but middleware bounces every user to `/unauthorized`. The JWT does not carry `user_role` / `country_code` claims even though the Custom Access Token Hook is enabled.

## What's already confirmed working

- `apps/web/.env.local` exists with `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`
- Migration `00001_rbac_schema.sql` applied to live Supabase (`para.group.n8n@gmail.com`)
- Three test users exist with role rows (Gmail `+` aliases routed to master inbox):
  - `para.group.n8n+hq@gmail.com` → `hq_admin`, `country_code = NULL`
  - `para.group.n8n+country-admin@gmail.com` → `country_admin`, `country_code = MZ`
  - `para.group.n8n+agent@gmail.com` → `agent`, `country_code = MZ`
- Hook function `public.custom_access_token_hook` exists (granted to `supabase_auth_admin`, revoked from `authenticated/anon/public`)
- User claims the **Custom Access Token (JWT) Claims** hook is **enabled** in Authentication → Hooks
- Local dev runs on **port 3012** (not 3000)
- Site URL = `http://localhost:3012`, Redirect URLs = `http://localhost:3012/**`

## What's failing

User logs in as `para.group.n8n+hq@gmail.com` and lands on `/unauthorized` instead of `/`. Browser cookie was cleared and login retried; same result.

## Hypotheses (in order of likelihood)

1. **Hook function returns claims in the wrong shape** — must return the `claims` object with new keys merged at the top level, not nested under `app_metadata` or `user_metadata`. Middleware reads `auth.jwt() ->> 'user_role'` (top-level).
2. **Hook function errors silently** — Supabase swallows hook errors in some versions and falls back to a claim-less JWT. Auth logs would show this.
3. **Hook is enabled but pointing to a different function** (typo in dashboard).
4. **Browser still has stale JWT** — confirm by reading the JWT after cookie clear (decode the `sb-*-auth-token` cookie value at jwt.io).

## §3 — Diagnostic (run FIRST in new session)

Use the `supabase-paratus` MCP. The user does NOT need to do anything yet.

### 3.1 Test the hook output directly

```sql
select public.custom_access_token_hook(
  jsonb_build_object(
    'user_id', (select id from auth.users where email = 'para.group.n8n+hq@gmail.com'),
    'claims', '{}'::jsonb
  )
);
```

**Expected:** result contains `"user_role": "hq_admin"` and `"country_code": null` at the top level of the returned `claims`.

**If wrong:** the function body needs fixing. The plan-shipped function should look like:

```sql
create or replace function public.custom_access_token_hook(event jsonb)
returns jsonb
language plpgsql
stable
as $$
declare
  claims jsonb := coalesce(event->'claims', '{}'::jsonb);
  user_role public.app_role;
  user_country public.country_code;
  user_active boolean;
begin
  select role, country_code, is_active
    into user_role, user_country, user_active
  from public.user_roles
  where user_id = (event->>'user_id')::uuid;

  if user_role is not null and user_active then
    claims := claims || jsonb_build_object(
      'user_role', user_role::text,
      'country_code', user_country,
      'is_active', user_active
    );
  end if;

  return jsonb_set(event, '{claims}', claims);
end;
$$;
```

(Read the actual current function body via `mcp__supabase-paratus__execute_sql` and compare.)

### 3.2 Read the function definition

```sql
select pg_get_functiondef('public.custom_access_token_hook'::regproc);
```

### 3.3 Check the hook is registered

In Supabase, the `auth.hooks` table or `auth.config` records the wired hooks. Try:

```sql
select * from auth.hook_registry;        -- newer projects
-- if that errors:
select id, hook_name, hook_function_name, enabled
from supabase_functions.hooks
where hook_name like '%token%';
-- if that errors, fall back to the dashboard UI
```

### 3.4 Check Auth logs for hook errors

```sql
select id, event_message, timestamp
from auth_logs
where event_message ilike '%hook%' or event_message ilike '%error%'
order by timestamp desc
limit 50;
```

(May need a different table name — `mcp__supabase-paratus__get_logs` may be cleaner; pass `service: "auth"`.)

### 3.5 Inspect the auth.users row for the hq user

```sql
select id, email, email_confirmed_at, aud, role, raw_app_meta_data, raw_user_meta_data
from auth.users
where email = 'para.group.n8n+hq@gmail.com';
```

`email_confirmed_at` must be non-null. If null, run:

```sql
update auth.users
set email_confirmed_at = now()
where email like 'para.group.n8n+%@gmail.com'
  and email_confirmed_at is null;
```

### 3.6 Inspect user_roles rows

```sql
select u.email, ur.role, ur.country_code, ur.is_active
from auth.users u
left join public.user_roles ur on ur.user_id = u.id
where u.email like 'para.group.n8n+%@gmail.com'
order by u.email;
```

Expect 3 rows, no NULL roles.

## Likely fix

90% probability the function body returns claims under the wrong key. Compare §3.2 output to the canonical body in §3.1. If different, `apply_migration` a fix as `00002_fix_custom_access_token_hook.sql`. Then have the user log out + log back in.

## After fixing

1. Tell user to:
   - Hard-clear cookies for `localhost:3012` in DevTools → Application → Cookies → Clear
   - Log in fresh as each of the three test users
   - Walk through the verification matrix below
2. If all six scenarios pass, write `.planning/phases/01-foundation/01-02-SUMMARY.md`, commit per `<commit_rules>` from the original execute-phase prompt, and report `## PLAN COMPLETE` to the orchestrator.
3. Then proceed to **Wave 3 / Plan 01-03** (Vercel deploy + Phase 1 gate close).

## Verification matrix (after fix)

| User | Expected landing | Cross-country test | Sign-out test |
|---|---|---|---|
| `+hq` | `/` (HQ) | `/mz` and `/mz/queue` both render (HQ has cross-country read) | back to `/login` |
| `+country-admin` | `/mz` | `/ke` bounces to `/mz`; `/` bounces to `/mz` | back to `/login` |
| `+agent` | `/mz/queue` | `/ke/queue` bounces to `/mz/queue`; `/mz` bounces to `/mz/queue` | back to `/login` |

`/atlantis` → 404 in all cases.

## Key files (for context)

- `apps/web/middleware.ts` — reads `user_role` and `country_code` from `auth.jwt()`
- `apps/web/app/_lib/auth.ts` — `requireRole`, `requireCountry` server helpers
- `packages/supabase/migrations/00001_rbac_schema.sql` — original RBAC + hook
- `packages/supabase/src/dal/users.ts` — DAL for user_roles
- `apps/web/app/(auth)/login/{page.tsx,actions.ts}` — login surface
- `apps/web/app/(auth)/unauthorized/page.tsx` — where users currently land

## Orchestration state

- Plan 01-01: ✓ complete (`82f744b`)
- Plan 01-02: 🔧 mid-execution, paused at human-verify
- Plan 01-03: ⏳ pending
- Phase 1 commit (ROADMAP/STATE/REQUIREMENTS): ⏳ pending all three plans

When the user opens the new session and types something like "ready" or "go", you (the new agent) should:
1. Read this file
2. Verify the `supabase-paratus` MCP is loaded by listing tables or running a trivial `select 1`
3. Run §3 diagnostics autonomously
4. Either propose a one-line fix migration OR explain the actual root cause
5. Apply the fix via `mcp__supabase-paratus__apply_migration`
6. Have the user log out + log back in
7. Walk verification matrix
8. Close out plan 01-02

Do **not** repeat the back-and-forth that happened in this session. The MCP gives you direct database access — use it.
