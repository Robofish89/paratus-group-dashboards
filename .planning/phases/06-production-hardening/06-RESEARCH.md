# Phase 6: Production Hardening — Research

**Researched:** 2026-05-04
**Domain:** Next.js 16 + Supabase production hardening — RLS audit, observability, real ingestion path, SLA alerts, hermetic testing, carry-over backlog
**Confidence:** HIGH (Context7 + official Vercel/Supabase docs); MEDIUM on observability vendor choice (multiple viable options)

<research_summary>
## Summary

Phase 6 has two halves: (a) the original "production hardening" scope from `PRD/milestones.md` — wire real form ingestion for the pilot country, add SLA breach email alerts, audit log, security headers, rate limiting, performance budget, synthetic monitoring, runbooks, 48h pilot soak; and (b) the carry-over backlog accumulated through phases 3–5 (RLS InitPlan caching sweep on `00001`, vitest hermeticity, stat-tile component consolidation, Next.js 16 `middleware → proxy` rename, `createServiceRoleClient`/`createAdminClient` convergence, offset → cursor pagination on the lead list, sales-rep no-answer flake, range-picker UI, HQ sidebar real surfaces, conversion-rate comparator window).

Key research finding: **the existing 06-01/06-02/06-03 PLAN.md drafts are stale** — written 2026-04-27 before phases 2–5 actually shipped, they reference env-var names (`LEAD_INGEST_SHARED_SECRET`, `LEAD_INGEST_HMAC_SECRET`) and migration numbers (`006_*`, `007_*`) that no longer match reality (now `PARATUS_INGEST_SECRET`, migrations `00001`–`00013`). They also duplicate work already shipped: Phase 2 plan 02-06 already built `apps/web/tests/rls.cross-tenant.test.ts` (expanded by the 2026-05-04 self-seed-BW commit `38e3074`); Phase 1 already wired the five required security headers in `next.config.ts`. Plan iteration in `/gsd:plan-phase 6` should treat the existing drafts as input ideas, not starting points.

**Primary recommendations:**
1. **Trim Phase 6 to actually-needed work.** The original three-plan structure (ingest hardening / security hardening / ops hardening) collapses to roughly two plans once duplicate-with-shipped is stripped: (a) production data path + alerts, (b) hardening sweep + ops/runbook + 48h pilot.
2. **Use the official Next.js 16 codemod for the proxy rename** — `npx @next/codemod@latest middleware-to-proxy .` does the file rename + named-export rename + `next.config` property rename atomically.
3. **For SLA alerts: vercel-cron + Resend SDK + idempotent dedupe column.** Standard pattern; nothing to invent.
4. **For RLS InitPlan caching: wrap `auth.jwt()`/`auth.uid()` in `(SELECT …)` AND add `TO authenticated` clause.** The latter is the bigger perf win (Supabase docs cite up to 99.78% improvement when narrowing the role).
5. **For vitest hermeticity: `supabase start` + `supabase/seed.sql` via `globalSetup`.** Don't go down the testcontainers-node path unless we need parallel DB-per-test isolation — for our scale, sequential against one local instance is fine.
6. **Observability: Vercel Observability (built-in) + UptimeRobot free tier (5-min synthetic) + Sentry free tier (error tracking).** Vercel's native observability covers logs/perf/throughput but does NOT include synthetic uptime or application error tracking — those still need external tools.
</research_summary>

<standard_stack>
## Standard Stack

The 2026 production-hardening stack on Vercel + Supabase, scoped to *what we actually need* (no ceremonial additions).

### Core (already installed; phase 6 just configures or wires)
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| next | ^16.2 | App Router framework | Already in use; phase 6 needs `proxy.ts` rename |
| @supabase/supabase-js | ^2.x | Auth + Postgres client | Already in use; SLA cron + audit log lean on the same client patterns |
| @supabase/ssr | ^0.x | Server cookie session | Already in use; no changes |
| zod | ^3.x | Runtime validation | Already in use; SLA email payload + audit log diff stay zod-typed |

### Phase 6 additions
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| resend | ^4.x | Transactional email SDK | SLA breach alerts (single-recipient transactional, low volume) |
| @upstash/ratelimit | ^2.x | Sliding-window rate limiter | `/api/auth/*` (5 req/60s/IP) + `/api/leads/ingest` (60 req/60s/secret-hash) |
| @upstash/redis | ^1.x | HTTP Redis transport for the limiter | Fluid Compute compatible (HTTP, no persistent connections) |
| @sentry/nextjs | ^9.x | Application error tracking | Server + client error capture, source maps, release tracking |
| @next/codemod | latest (CLI-only) | One-shot migration runner | `middleware-to-proxy` codemod for the Next.js 16 rename |
| react-email (`@react-email/components`) | ^0.x | Email template authoring | One template (`SlaBreachEmail`) — overkill for two emails but the JSX-to-HTML pipeline beats string-templating |

### NOT adding (rejected with reason)
| Considered | Rejected because |
|------------|------------------|
| Vercel BotID (Deep Analysis) | $1/1000 calls; we already have HMAC-gated ingest, our auth is a small known user set, and the audience isn't a bot-scraping target. Basic mode is free and could be wired to `/api/leads/ingest` as a future hardening if abuse appears, but Phase 6 doesn't need it. |
| Vercel Queues | Public beta; SLA email path is a single fire-and-forget cron, no queueing semantics needed. |
| Vercel WAF custom rules | Default WAF is on for all projects. Adding custom rules is over-engineering for the pilot. |
| testcontainers-node + supabase | Adds 6+ second container spin-up per test file. For our scale (sequential vitest runs against one local stack via `supabase start`), the simpler pattern is enough. |
| BetterStack / Pingdom paid tiers | UptimeRobot free covers 50 monitors at 5-min intervals — fits the pilot exactly. Upgrade decision deferred until v2 monitoring needs (Playwright transaction monitoring is the typical reason to pay). |
| Vercel Cache Components / `'use cache'` | Phase 5 already shipped the HQ overview without it; no perf-budget violation today. Future optimization, not Phase 6 scope. |
| `@vercel/firewall` | Same trade-off as WAF custom rules — Vercel applies default WAF protection without us configuring anything. |

**Installation (when planning lands):**
```bash
# In apps/web
npm i resend @upstash/ratelimit @upstash/redis @sentry/nextjs @react-email/components

# Phase 6 codemod (run once, commit the result)
npx @next/codemod@latest middleware-to-proxy .
```
</standard_stack>

<architecture_patterns>
## Architecture Patterns

### Pattern 1: RLS InitPlan caching + role narrowing (the *two*-part fix)
**What:** Two changes per RLS policy — (a) wrap volatile session functions in `(SELECT …)` so Postgres caches the result via initPlan; (b) add `TO authenticated` so anon callers short-circuit before the policy body runs.
**When to use:** Every RLS policy on every table. Phase 1's `00001_rbac_schema.sql` `user_roles` policies are the carry-over target — they predate the convention.
**Example:**
```sql
-- Before (00001_rbac_schema.sql current state)
CREATE POLICY "HQ admins can read all user_roles"
  ON user_roles FOR SELECT
  USING ((auth.jwt() ->> 'user_role') = 'hq_admin');

-- After (Phase 6 sweep)
CREATE POLICY "HQ admins can read all user_roles"
  ON user_roles FOR SELECT
  TO authenticated                                    -- (b) role narrowing
  USING ((SELECT auth.jwt() ->> 'user_role') = 'hq_admin');  -- (a) initPlan cache
```
Source: <https://supabase.com/docs/guides/database/postgres/row-level-security> + Context7 `/supabase/supabase` "RLS performance and best practices".

### Pattern 2: Realtime private-channel auth via `realtime.topic()`
**What:** RLS on `realtime.messages` with `realtime.topic()` + JWT claim. Already correct in `00008` and `00013`; documented here for the Phase 6 audit reference.
**When to use:** Already in use; no rewrite needed. Carry-over is the **trigger function lockdown** — `broadcast_lead_to_agent`, `broadcast_lead_to_country`, `broadcast_lead_to_group` are SECURITY DEFINER but missing explicit `REVOKE EXECUTE FROM PUBLIC, anon, authenticated`.
**Example:**
```sql
-- Already in 00008 (correct)
CREATE POLICY "agent_own_topic" ON realtime.messages FOR SELECT
  TO authenticated
  USING (
    realtime.topic() = 'agent:' || (SELECT auth.uid())::text
    OR (SELECT auth.jwt() ->> 'user_role') = 'hq_admin'
  );

-- New in Phase 6 — lock down the trigger functions
REVOKE EXECUTE ON FUNCTION public.broadcast_lead_to_agent()   FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.broadcast_lead_to_country() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.broadcast_lead_to_group()   FROM PUBLIC, anon, authenticated;
-- Trigger context runs as the table owner; no GRANT to authenticated needed.
```
Source: Context7 `/supabase/realtime` "Join Private Channels with RLS" + WebFetch `supabase.com/docs/guides/realtime/authorization`.

### Pattern 3: Vercel Cron + `CRON_SECRET` (canonical)
**What:** Vercel auto-injects `Authorization: Bearer ${CRON_SECRET}` when invoking the scheduled URL. Route handler compares against env. Hobby plan caps at one execution per day; Pro+ is per-minute precision.
**When to use:** SLA breach checker (`/api/cron/sla-check`, `* * * * *` on Pro plan). Idempotency required because Vercel "can occasionally deliver the same cron event more than once."
**Example:**
```ts
// apps/web/app/api/cron/sla-check/route.ts
import { NextRequest } from 'next/server';

export const runtime = 'nodejs';            // SDK uses node:crypto; explicit
export const maxDuration = 60;              // SLA check is bounded; default 300 is fine

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return new Response('Unauthorized', { status: 401 });
  }
  // ... fetch breaches, send emails, mark alerted
  return Response.json({ checked, alerted });
}
```
```json
// apps/web/vercel.json (note: `vercel.ts` is the new way per platform knowledge update,
//  but `vercel.json` still works and matches what the rest of the codebase uses today)
{
  "$schema": "https://openapi.vercel.sh/vercel.json",
  "crons": [{ "path": "/api/cron/sla-check", "schedule": "* * * * *" }]
}
```
Source: <https://vercel.com/docs/cron-jobs/manage-cron-jobs> (last_updated: 2026-02-27).

### Pattern 4: Resend transactional email (one wrapper, fail-fast on env)
**What:** Wrap the Resend SDK once, throw on missing env at module init (no silent no-op), use the `react` field with React Email components for templates.
**When to use:** SLA breach alert is the only Phase 6 consumer; pattern stays cheap.
**Example:**
```ts
// packages/supabase/src/lib/email.ts
import 'server-only';
import { Resend } from 'resend';
import { SlaBreachEmail } from './emails/sla-breach';

if (!process.env.RESEND_API_KEY) throw new Error('RESEND_API_KEY missing');
if (!process.env.SLA_ALERT_FROM_EMAIL) throw new Error('SLA_ALERT_FROM_EMAIL missing');

const resend = new Resend(process.env.RESEND_API_KEY);

export async function sendSlaBreachEmail(input: {
  to: string; lead: BreachLead; ageMinutes: number;
}) {
  const { error } = await resend.emails.send({
    from: process.env.SLA_ALERT_FROM_EMAIL!,
    to: [input.to],
    subject: `Lead unanswered for ${input.ageMinutes} min — ${input.lead.country_code}`,
    react: SlaBreachEmail(input),
    headers: { 'X-Entity-Ref-ID': input.lead.id },  // prevent Gmail threading
  });
  if (error) throw new Error(`Resend send failed: ${error.message}`);
}
```
Source: Context7 `/resend/resend-examples` "Next.js API Route for Sending Emails".

### Pattern 5: Upstash Ratelimit with sliding window
**What:** HTTP-only Redis transport (Fluid Compute friendly), sliding-window algorithm, identifier-based, optional analytics.
**When to use:** `/api/auth/*` (IP key, 5/60s) and `/api/leads/ingest` (sha256(secret) key, 60/60s). Fail-open in dev (no Upstash creds), fail-closed in prod (throw on missing env).
**Example:**
```ts
// packages/supabase/src/lib/rate-limit.ts
import 'server-only';
import { Ratelimit } from '@upstash/ratelimit';
import { Redis } from '@upstash/redis';

const inProd = process.env.NODE_ENV === 'production';

function makeRedis() {
  if (!process.env.UPSTASH_REDIS_REST_URL) {
    if (inProd) throw new Error('UPSTASH_REDIS_REST_URL missing in production');
    return null;  // fail-open in dev
  }
  return Redis.fromEnv();
}

const redis = makeRedis();

export const authLimiter = redis
  ? new Ratelimit({ redis, limiter: Ratelimit.slidingWindow(5, '60 s'), analytics: true, prefix: 'paratus:auth' })
  : { limit: async () => ({ success: true, limit: 5, remaining: 5, reset: 0 }) };

export const ingestLimiter = redis
  ? new Ratelimit({ redis, limiter: Ratelimit.slidingWindow(60, '60 s'), analytics: true, prefix: 'paratus:ingest' })
  : { limit: async () => ({ success: true, limit: 60, remaining: 60, reset: 0 }) };
```
Source: Context7 `/websites/upstash_redis_sdks_ratelimit-` "Initialize and Use Ratelimit" + "Initialize Sliding Window Ratelimiter".

### Pattern 6: Next.js 16 `middleware → proxy` (codemod-driven)
**What:** Rename `middleware.ts` → `proxy.ts`, named export `middleware` → `proxy`, related `next.config` properties (matcher behavior unchanged). The `proxy` runtime is **Node.js only** — no edge configuration. If we need edge runtime, keep `middleware.ts`.
**When to use:** Now. The deprecation warning fires on every build; codemod is a one-shot fix.
**Example:**
```bash
# From the apps/web directory
npx @next/codemod@latest middleware-to-proxy .
```
```ts
// Before — apps/web/middleware.ts
export async function middleware(request: NextRequest) { … }
export const config = { matcher: [ … ] };

// After — apps/web/proxy.ts
export async function proxy(request: NextRequest) { … }
export const config = { matcher: [ … ] };
```
Source: Context7 `/vercel/next.js/v16.2.2` "Middleware to Proxy > Migration".

### Pattern 7: Cursor (keyset) pagination for the country-admin lead list
**What:** Replace offset pagination with `(created_at, id)` tuple cursor. Composite index on `(created_at DESC, id DESC)` matches the sort, lets Postgres skip-scan instead of materialising the offset.
**When to use:** `apps/web/app/(country-admin)/[country]/leads/page.tsx` — current offset works at our scale (~5k leads/country) but the Phase 6 carry-over is to migrate before scale becomes a problem.
**Example:**
```ts
// Cursor encodes the last-row's (created_at, id) as base64
type LeadCursor = { created_at: string; id: string };
const decode = (s: string | null): LeadCursor | null =>
  s ? JSON.parse(Buffer.from(s, 'base64').toString()) : null;

let q = supabase.from('leads').select('*').order('created_at', { ascending: false }).order('id', { ascending: false }).limit(50);
const cursor = decode(searchParams.cursor ?? null);
if (cursor) {
  // Postgres tuple compare: (created_at, id) < (cursor.created_at, cursor.id)
  q = q.or(
    `created_at.lt.${cursor.created_at},and(created_at.eq.${cursor.created_at},id.lt.${cursor.id})`
  );
}
```
```sql
-- Migration: composite index matching the sort
CREATE INDEX leads_created_at_id_desc_idx ON leads (created_at DESC, id DESC);
```
Source: GitHub Discussion `supabase/supabase #21330` "Multi-column cursor pagination using the JS Client"; supabase Postgres docs "keyset pagination is generally preferred for efficiency".

### Pattern 8: Hermetic vitest via `supabase start` + seed
**What:** Local Supabase stack via Docker (one process for the whole `vitest run`); `supabase/seed.sql` provisions test users + reference data after migrations apply; vitest `globalSetup` brings the stack up and points env vars at it.
**When to use:** All Phase 3+ integration tests that authenticate. Solves the cloud auth rate-limit (4/hr) that breaks chained suites today.
**Example:**
```ts
// apps/web/vitest.global-setup.ts
import { execSync } from 'node:child_process';

export async function setup() {
  execSync('npx supabase start', { stdio: 'inherit' });
  // The CLI prints DB URL + anon key + service-role key on stdout;
  // overwrite env so tests hit local instead of cloud.
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'http://127.0.0.1:54321';
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = '<from supabase status>';
  process.env.SUPABASE_SERVICE_ROLE_KEY = '<from supabase status>';
}

export async function teardown() {
  execSync('npx supabase stop --no-backup', { stdio: 'inherit' });
}
```
```toml
# supabase/config.toml — already exists; add seed configuration
[db.seed]
enabled = true
sql_paths = ['./seed/01_test_users.sql', './seed/02_test_leads.sql']
```
Source: <https://supabase.com/docs/guides/local-development> + <https://supabase.com/docs/guides/local-development/seeding-your-database>.

### Project structure additions for Phase 6
```
apps/web/
├── proxy.ts                       # renamed from middleware.ts
├── vitest.global-setup.ts         # NEW — supabase start/stop
├── app/
│   ├── api/
│   │   ├── cron/sla-check/route.ts          # NEW — vercel cron
│   │   ├── health/route.ts                  # NEW — synthetic monitoring target
│   │   └── leads/ingest/route.ts            # PATCHED — ratelimit prepend
│   └── (country-admin)/[country]/
│       ├── audit/page.tsx                   # NEW — audit log viewer
│       └── leads/page.tsx                   # PATCHED — cursor pagination
├── instrumentation.ts             # NEW — Sentry server bootstrap
├── instrumentation-client.ts      # NEW — Sentry client bootstrap
└── vercel.json                    # PATCHED — crons + maxDuration where needed
packages/supabase/
├── migrations/
│   ├── 00014_user_roles_initplan_caching.sql   # NEW — Phase 1 sweep
│   ├── 00015_audit_log.sql                     # NEW — audit_log table + RLS + record_audit RPC
│   ├── 00016_sla_alerts.sql                    # NEW — sla_breach_alerted_at + v_sla_breaches
│   └── 00017_broadcast_function_lockdown.sql   # NEW — REVOKE on broadcast_*
├── src/
│   ├── lib/
│   │   ├── email.ts                  # NEW — Resend wrapper
│   │   └── rate-limit.ts             # NEW — Upstash limiters
│   └── dal/
│       ├── audit.ts                  # NEW
│       └── sla.ts                    # NEW
supabase/
├── config.toml                     # PATCHED — [db.seed] enabled
└── seed/                           # NEW — split seed files
    ├── 01_test_users.sql
    └── 02_test_reference.sql
docs/
├── RUNBOOK.md                      # NEW
└── BACKUP_RESTORE.md               # NEW
```
</architecture_patterns>

<dont_hand_roll>
## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Sliding-window rate limiter | In-memory Map keyed by IP | `@upstash/ratelimit` | In-memory resets per Vercel cold start (= effectively no limit). Upstash is HTTP-transport so works in Fluid Compute without persistent connections. |
| Email send + retry + DKIM | Raw SMTP via `nodemailer` from a serverless function | `resend` SDK | Serverless functions can't hold SMTP connections cleanly; deliverability requires DKIM/SPF/DMARC; Resend handles all three + bounce webhooks. |
| Cron scheduler | Self-hosted scheduler / Heroku Scheduler / external service | Vercel `crons` in vercel.json | Free, native, Authorization header auto-injected. Idempotency we still own (Vercel can deliver duplicates). |
| Synthetic uptime ping | Cron-driven self-check from inside the app | UptimeRobot / Better Stack free tier | Self-pings can't detect when the *cron itself* fails or the deploy is hung. External vantage point is the point. |
| Application error tracking | `console.error` + Vercel runtime logs | `@sentry/nextjs` | Vercel logs are searchable but lack stacktrace deduping, release tagging, source-map symbolisation, and user-context attachment. Sentry free tier covers our volume. |
| CSP nonces | Custom middleware that mints a nonce per request | Next.js documented `proxy.ts` nonce pattern | The Next.js docs publish the canonical version; deviating risks `'strict-dynamic'` getting it subtly wrong. (For Phase 6 we likely keep `'unsafe-inline'` styles to avoid Tailwind v4 friction; nonces are a future hardening.) |
| Postgres backup | Cron-dumping `pg_dump` to S3 | Supabase managed PITR + manual `supabase db dump` for ad-hoc snapshots | Supabase project tier already provides PITR; reproducing it from `pg_dump` is duplicate effort and the restore drill is what matters. |
| Audit log diff computation | Raw `before`/`after` JSONB blobs of every column | Diff-only field set | Storing whole rows balloons the table; diff-only keeps the index efficient and keeps PII surface small. |
| Keyset pagination math | Hand-rolled "fetch one extra row to check hasNext" | The `.or('a.lt.X,and(a.eq.X,b.lt.Y)')` pattern documented in the supabase-js discussions | The hand-rolled "fetch N+1" works but loses the tuple-compare ordering guarantee on ties. |

**Key insight:** Production hardening is the phase where it's tempting to write small clever utilities ("a 30-line rate limiter is fine for our scale"). Resist. Each hand-rolled primitive is a thing the next person — including future-us at 2am during an incident — has to debug. Use the canned solution and spend the cleverness budget on the parts of the system that are actually distinctive (the round-robin assignment, the agent queue UX, the country-RLS model).
</dont_hand_roll>

<common_pitfalls>
## Common Pitfalls

### Pitfall 1: Cron event duplicate delivery causes double SLA emails
**What goes wrong:** Vercel's cron system can deliver the same scheduled event twice. Without idempotency, the country admin gets two identical SLA alerts.
**Why it happens:** "Vercel's event-driven system can occasionally deliver the same cron event more than once" (Vercel docs, 2026-02-27).
**How to avoid:** Use `sla_breach_alerted_at` as the dedupe column; SET it inside the same transaction that sends the email; the `v_sla_breaches` view filters `WHERE sla_breach_alerted_at IS NULL`. Second cron invocation finds zero unalerted breaches.
**Warning signs:** Two emails timestamped <60s apart for the same `lead_id`; runbook should have a "kill the duplicate" SQL snippet.

### Pitfall 2: `proxy.ts` runs Node-only — losing edge runtime silently
**What goes wrong:** After the `middleware → proxy` codemod, code that depended on edge-runtime semantics (e.g. assumptions about `Request`/`Response` shape, `process` not being available, faster cold start) breaks subtly.
**Why it happens:** "The `proxy` runtime uses Node.js and cannot be configured to use the edge runtime" (Next.js 16 docs).
**How to avoid:** Audit `apps/web/middleware.ts` first — confirm it's already using node-compatible APIs (it is; no `Edge Runtime` export). Run `npm run build` after the codemod and check for new warnings. If we *did* need edge, keep `middleware.ts` and accept the deprecation warning until Next.js 17.
**Warning signs:** A `process is not defined` runtime error after deploy that didn't exist locally; cold-start latency increase on the proxy path.

### Pitfall 3: `(SELECT auth.jwt())` wrap doesn't help if the function depends on row data
**What goes wrong:** A migration mechanically wraps `auth.jwt()` everywhere — but in a policy like `WHERE owner_id = auth.uid() OR is_admin_for(country_code)`, the `is_admin_for(country_code)` function does depend on row data and won't be initPlan-cached.
**Why it happens:** initPlan caching only works for expressions that "do not change based on the row data" (Supabase docs). Our policies are mostly safe (just `auth.uid()`/`auth.jwt() ->> '...'`), but the rule should be stated.
**How to avoid:** Pre-Phase 6 audit lists exactly which policies are getting wrapped and which are intentionally not. Phase 1 `00001` user_roles is the only target — small surface.
**Warning signs:** Performance regression on a wrapped policy that was supposedly an optimisation.

### Pitfall 4: Resend domain unverified → emails silently land in spam (or 422)
**What goes wrong:** Setting `from: 'alerts@paratus.group'` before the domain is verified at Resend → either 422 from the SDK or the email lands in spam if Resend lets it through with their shared domain.
**Why it happens:** Domain verification (DKIM + SPF) is dashboard-only in Resend; can't be scripted from this side.
**How to avoid:** Phase 6 user_setup checklist: verify the sending domain at Resend BEFORE wiring `SLA_ALERT_FROM_EMAIL`. Use `onboarding@resend.dev` as a placeholder during local testing. Add a smoke test that catches Resend's structured `error.message` and surfaces it to the runbook.
**Warning signs:** `domain_not_verified` error in Sentry; emails not arriving in spot-check.

### Pitfall 5: Upstash rate limit fail-closed in prod blocks legitimate traffic if Redis is down
**What goes wrong:** `if (!process.env.UPSTASH_REDIS_REST_URL) throw …` in production looks correct, but if Upstash itself is unreachable mid-request, the limiter call hangs or throws — and a naive route handler returns 500 to legitimate users.
**Why it happens:** "Fail-closed" semantics are usually right for security gates; for rate limiting they are debatable. Upstash's own SDK has retries, but a regional outage can still propagate.
**How to avoid:** Wrap the `await ratelimit.limit(…)` call in a `try/catch`; on Upstash error, log structured event and ALLOW the request (fail-open for rate limit, fail-closed only for auth). Document the trade-off in the runbook.
**Warning signs:** Spike in 500s on `/api/auth/*` correlated with Upstash status page incidents.

### Pitfall 6: Supabase `supabase start` consumes ports 54321–54324 and conflicts with another local project
**What goes wrong:** Running `supabase start` in this repo while another Supabase project is also running locally → port collision → the second one fails to bring up Auth.
**Why it happens:** Supabase CLI defaults are global ports.
**How to avoid:** Pin custom ports in `supabase/config.toml` (the project_id derives the port range when set). Document in CONTRIBUTING. For CI: only one Supabase stack runs per job, no conflict.
**Warning signs:** `port already in use` error from Docker on `supabase start`; the second user_setup hits an opaque "container failed to start".

### Pitfall 7: Audit log RLS exposes `before`/`after` JSONB to wrong roles
**What goes wrong:** Country admin can query `audit_log` and see another country's diffs because the policy filters on `country_code` correctly but the row was written with the wrong `country_code` (e.g. cross-country reassignment audited under the source country's code, viewable by the source country admin alone — but the target country admin needs to see it too).
**Why it happens:** Cross-tenant actions complicate "scope by country" model. Solved by writing TWO rows for cross-country reassignment (one per side) or by writing one row visible to both.
**How to avoid:** For our use case, country reassignment is HQ-only (per `00011_country_admin.sql` `reassign_lead` cross-country guard). Country admins can't initiate cross-country moves, so the issue doesn't arise — but the audit table structure must still handle HQ-initiated cross-country moves visibly to both sides. Decision: HQ-initiated cross-country moves write one row visible to HQ + both country admins via a `visible_to_country_codes text[]` column.
**Warning signs:** Country admin reports "Why didn't I get the audit entry for the lead I just received?"

### Pitfall 8: Sentry source maps not uploading → stacktraces show `chunk-abc123.js:1:9001`
**What goes wrong:** `@sentry/nextjs` is wired but `SENTRY_AUTH_TOKEN` isn't in Vercel prod env → source maps don't upload → production stacktraces are useless.
**Why it happens:** The Sentry wizard creates `.env.sentry-build-plugin` for local dev; the env var must be added to Vercel separately and marked as a Build env var (not Runtime).
**How to avoid:** Phase 6 user_setup checklist explicitly: add `SENTRY_AUTH_TOKEN` to Vercel as a Build env var (Sensitive). Trigger one production error after deploy to verify symbolised stacktraces.
**Warning signs:** Sentry issues with anonymous frames or `[hidden]` function names.
</common_pitfalls>

<code_examples>
## Code Examples

### Example 1: SLA breach view + cron handler (full path)
```sql
-- packages/supabase/migrations/00016_sla_alerts.sql
ALTER TABLE leads ADD COLUMN sla_breach_alerted_at timestamptz;

CREATE OR REPLACE VIEW v_sla_breaches WITH (security_invoker = true) AS
SELECT l.id, l.country_code, l.assigned_to, l.email, l.phone, l.submitted_at,
       extract(epoch FROM (now() - l.submitted_at))::int AS age_seconds
FROM leads l
WHERE l.status IN ('new', 'assigned')
  AND l.first_contacted_at IS NULL
  AND l.submitted_at < now() - interval '5 minutes'
  AND l.sla_breach_alerted_at IS NULL;

GRANT SELECT ON v_sla_breaches TO service_role;

CREATE OR REPLACE FUNCTION mark_sla_alerted(p_lead_id uuid)
  RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = public, pg_temp AS $$
  UPDATE leads SET sla_breach_alerted_at = now() WHERE id = p_lead_id;
$$;
REVOKE EXECUTE ON FUNCTION mark_sla_alerted(uuid) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION mark_sla_alerted(uuid) TO service_role;
```
```ts
// apps/web/app/api/cron/sla-check/route.ts
import 'server-only';
import { NextRequest } from 'next/server';
import { createAdminClient } from '@repo/supabase/admin';
import { sendSlaBreachEmail } from '@repo/supabase/lib/email';
import { getCountryAdminEmails } from '@repo/supabase/dal/users';

export const runtime = 'nodejs';
export const maxDuration = 60;

export async function GET(req: NextRequest) {
  const auth = req.headers.get('authorization');
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return new Response('Unauthorized', { status: 401 });
  }
  const sb = createAdminClient();
  const { data: breaches } = await sb.from('v_sla_breaches').select('*');
  if (!breaches?.length) return Response.json({ checked: 0, alerted: 0 });

  let alerted = 0;
  await Promise.allSettled(
    breaches.map(async (b) => {
      const admins = await getCountryAdminEmails(b.country_code);
      await Promise.all(
        admins.map((to) =>
          sendSlaBreachEmail({ to, lead: b, ageMinutes: Math.floor(b.age_seconds / 60) })
        )
      );
      await sb.rpc('mark_sla_alerted', { p_lead_id: b.id });
      alerted++;
    })
  );
  return Response.json({ checked: breaches.length, alerted });
}
```

### Example 2: Audit log table + RLS + RPC for actor capture
```sql
-- packages/supabase/migrations/00015_audit_log.sql
CREATE TABLE audit_log (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id        uuid REFERENCES auth.users(id),
  actor_role      text NOT NULL,
  country_code    text NOT NULL,
  action          text NOT NULL,
  target_type     text NOT NULL,
  target_id       text NOT NULL,
  diff            jsonb NOT NULL,                    -- changed-fields-only
  visible_to_country_codes text[] NOT NULL,          -- handles cross-country actions
  created_at      timestamptz NOT NULL DEFAULT now(),
  ip_hash         text                                 -- sha256(IP), no raw IP
);
CREATE INDEX audit_log_country_created_idx ON audit_log (country_code, created_at DESC);
CREATE INDEX audit_log_target_idx          ON audit_log (target_type, target_id);
CREATE INDEX audit_log_visible_gin_idx     ON audit_log USING gin (visible_to_country_codes);

ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "hq sees all audit_log"
  ON audit_log FOR SELECT TO authenticated
  USING ((SELECT auth.jwt() ->> 'user_role') = 'hq_admin');

CREATE POLICY "country admin sees own + cross-country-visible audit_log"
  ON audit_log FOR SELECT TO authenticated
  USING (
    (SELECT auth.jwt() ->> 'user_role') = 'country_admin'
    AND (SELECT auth.jwt() ->> 'country_code') = ANY (visible_to_country_codes)
  );

-- INSERT only via record_audit RPC (service-role from server actions)
CREATE OR REPLACE FUNCTION record_audit(
  p_action text, p_target_type text, p_target_id text,
  p_country_code text, p_diff jsonb,
  p_visible_to_country_codes text[] DEFAULT NULL,
  p_ip_hash text DEFAULT NULL
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_id uuid;
BEGIN
  INSERT INTO audit_log (actor_id, actor_role, country_code, action, target_type, target_id, diff, visible_to_country_codes, ip_hash)
  VALUES (
    auth.uid(),
    auth.jwt() ->> 'user_role',
    p_country_code,
    p_action, p_target_type, p_target_id, p_diff,
    COALESCE(p_visible_to_country_codes, ARRAY[p_country_code]),
    p_ip_hash
  )
  RETURNING id INTO v_id;
  RETURN v_id;
END $$;
REVOKE EXECUTE ON FUNCTION record_audit FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION record_audit TO authenticated;
```

### Example 3: Health endpoint (synthetic-monitor target)
```ts
// apps/web/app/api/health/route.ts
import 'server-only';
import { createAdminClient } from '@repo/supabase/admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  const t0 = Date.now();
  const sb = createAdminClient();
  try {
    const { error } = await sb.from('countries').select('code').limit(1);
    const db_ms = Date.now() - t0;
    if (error) throw error;
    return Response.json(
      { ok: true, time: new Date().toISOString(), supabase: 'ok', db_ms },
      { status: db_ms < 500 ? 200 : 503, headers: { 'Cache-Control': 'no-store' } }
    );
  } catch {
    return Response.json(
      { ok: false, supabase: 'fail' },
      { status: 503, headers: { 'Cache-Control': 'no-store' } }
    );
  }
}
```

### Example 4: Sentry instrumentation (Next.js 16 App Router)
```ts
// apps/web/instrumentation.ts
import * as Sentry from '@sentry/nextjs';

export async function register() {
  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    tracesSampleRate: 0.1,
    environment: process.env.VERCEL_ENV ?? 'development',
    release: process.env.VERCEL_GIT_COMMIT_SHA,
  });
}

export const onRequestError = Sentry.captureRequestError;
```
</code_examples>

<sota_updates>
## State of the Art (2025-2026)

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `middleware.ts` | `proxy.ts` | Next.js 16.0 (Oct 2025) | Use codemod; runtime is Node.js only |
| `vercel.json` for project config | `vercel.ts` (typed) | Vercel 2026-02 knowledge update | We can stay on `vercel.json` for now (cron config alone doesn't justify migration); revisit when configuration grows |
| Edge Functions for everything | Fluid Compute (default) with full Node.js | Vercel 2025 | Already on Fluid Compute; no action needed |
| `'use cache'` | Cache Components | Next.js 16 | Out of scope for Phase 6; Phase 5 shipped without it |
| Self-hosted SMTP via nodemailer | Resend / Postmark | Industry-wide 2023+ | Resend chosen — single dashboard, single API |
| In-memory rate limiting | Upstash Ratelimit (HTTP Redis) | Vercel-native pattern since 2023 | Standard |
| `postgres_changes` for realtime | Broadcast-from-Database | Phase 2 already migrated | Already done; documented as decision |
| BetterStack as default uptime | UptimeRobot for the free tier (50 monitors / 5-min) | 2026 alternatives review | Free tier sufficient for pilot |
| Manual CSP nonces | Same pattern, but in `proxy.ts` not `middleware.ts` | Next.js 16 | Future Phase 6+ hardening; not blocking |

**New tools/patterns to consider (but NOT for Phase 6):**
- **Vercel Queues (public beta):** at-least-once event streaming. Could replace the SLA cron with an event-driven model in Phase 7+, but Phase 6 should stick with the proven cron pattern.
- **Vercel Sandbox (GA Jan 2026):** sandboxed code execution. No use case in Phase 6.
- **Vercel Agent (public beta):** AI code reviews + production investigations. Worth trialling on a Phase 6 PR but not a deliverable.
- **Vercel BotID Basic (free):** bot detection. Could front `/api/leads/ingest` as a future hardening if abuse appears; HMAC + rate limit are sufficient for Phase 6.

**Deprecated/outdated:**
- **Edge Functions:** still present but Vercel knowledge update marks them "not recommended" — Fluid Compute is the default, runs Node.js, same regions same price.
- **Vercel Postgres / Vercel KV:** retired; use Marketplace databases (Upstash for our case).
- **Node 18:** deprecated. Pin Node 24 LTS in the Vercel project + `package.json#engines`.
</sota_updates>

<open_questions>
## Open Questions

These need a decision before or during planning. Documented honestly so plan-phase has the context.

1. **Pilot ingestion path: direct webhook vs. n8n bridge vs. hybrid?**
   - What we know: PRD prefers Path 1 (direct webhook). Path 2 (n8n) is faster to ship but adds an intermediate hop. Hybrid keeps options open at the cost of dual maintenance.
   - What's unclear: Has William confirmed that Paratus IT can add the webhook to the pilot country's forms within Phase 6's window?
   - Recommendation: **Default to Path 2 (n8n bridge) for Phase 6**, configure Path 1 capability into the route (HMAC + secret already done), and cut over per-country during Phase 7 rollout as Paratus IT adds the webhooks. Documented as a project memory if accepted.

2. **Pilot country: Mozambique vs Namibia?**
   - What we know: PRD lists Mozambique as default. Namibia is mentioned as alternative.
   - What's unclear: William's preference; lead volume per country (we should size the SLA cron's worst-case response based on this).
   - Recommendation: Lock during the Plan 06-01 checkpoint:decision; keep both option paths in the plan.

3. **Conversion-rate comparator window: WoW vs MoM?** (Carry-over from 05-03)
   - What we know: HQ overview Conversion Rate tile currently has no comparator. Plan 05-02 dropped the mockup's "+2.1%" because no window was decided.
   - What's unclear: Whether HQ wants week-over-week (sensitive, noisy on small countries) or month-over-month (smoother, lags reality).
   - Recommendation: Defer to Phase 6 plan-of-plans review with William; if no signal, default to **WoW** (more actionable for daily standups).

4. **Stat-tile component consolidation: now or later?** (Carry-over from 04-04)
   - What we know: Three patterns exist (`MetricCard` full-width top bar, `queue-stats` ring, `kpi-strip` ring). Three different consumers.
   - What's unclear: Whether refactor risk on shipped surfaces is worth the unification.
   - Recommendation: **Do it.** The "Boil the Ocean" project standard says consolidate — and the diff is small. Ship under the Phase 6 hardening sweep plan.

5. **HQ sidebar real surfaces: Phase 6 scope or Phase 7?** (Carry-over from 05-03)
   - What we know: `/countries`, `/service-mix`, `/settings` are placeholder stubs.
   - What's unclear: Whether William considers them blocking for client UAT.
   - Recommendation: **Phase 7 / retainer.** Phase 6 is "ready for client UAT"; UAT can happen with stubs in place as long as the placeholder copy is honest. Adding three new surfaces doubles Phase 6 scope.

6. **`createServiceRoleClient` vs `createAdminClient` convergence: keep one or both?**
   - What we know: Both names exist and do the same thing (per `STATE.md` "Key decisions").
   - What's unclear: Which name wins.
   - Recommendation: **Keep `createAdminClient`** (older, more places). Delete `createServiceRoleClient` and its single call site in plan 02-04. One line of friction in Phase 6.

7. **Sales-rep no-answer 3× test flake: instrument or relax timeout?** (Carry-over from 05-03)
   - What we know: `data-attempts` poll occasionally reads 2 not 3 within 8s.
   - What's unclear: Whether the flake is timing or a true bug in the broadcast emit chain.
   - Recommendation: First, bump the poll timeout to 12s (2-line diff, ships immediately). If flake persists, instrument the broadcast-emit timing properly during the hardening sweep.
</open_questions>

<sources>
## Sources

### Primary (HIGH confidence)
- **Vercel Cron Jobs** — <https://vercel.com/docs/cron-jobs> (last_updated 2025-06-25) and <https://vercel.com/docs/cron-jobs/manage-cron-jobs> (last_updated 2026-02-27) — auth pattern, `vercel.json` `crons` schema, idempotency requirement, hobby vs pro frequency.
- **Next.js 16 — Middleware to Proxy migration** — Context7 `/vercel/next.js/v16.2.2` "Migrate from deprecated middleware to proxy convention" + codemods page — codemod command, runtime constraint (Node-only).
- **Next.js 16 — CSP guide** — Context7 `/vercel/next.js/v16.2.2` "Generate Nonce and CSP Headers with Proxy" — nonce-based CSP via `proxy.ts`, static `headers()` alternative in `next.config`.
- **Next.js — `maxDuration` route segment config** — Context7 `/vercel/next.js/v16.2.2` "maxDuration Configuration" — applies to cron handlers.
- **Supabase RLS performance** — Context7 `/supabase/supabase` "RLS performance and best practices" + `/supabase/supabase` "Optimize RLS policies with subquery wrapping" — `(SELECT auth.jwt())` initPlan caching.
- **Supabase Realtime authorization** — Context7 `/supabase/realtime` "Join Private Channels with RLS" + WebFetch <https://supabase.com/docs/guides/realtime/authorization> — `realtime.topic()` pattern, `private: true` channel config.
- **Supabase `security_invoker` views** — Context7 `/supabase/supabase` "Enable RLS for Views in PostgreSQL 15+" — already in use across our views.
- **Resend Next.js examples** — Context7 `/resend/resend-examples` "Next.js API Route for Sending Emails" — `resend.emails.send`, `react` field for templates, `X-Entity-Ref-ID` header to prevent Gmail threading.
- **Upstash Ratelimit** — Context7 `/websites/upstash_redis_sdks_ratelimit-` "Initialize and Use Ratelimit" + "Initialize Sliding Window Ratelimiter" — current API, sliding-window algorithm, analytics.
- **Vercel BotID** — <https://vercel.com/docs/botid> (last_updated 2026-02-17) — Basic free / Deep Analysis $1/1k; positioned as bot detection NOT rate limiting; NOT replacing Upstash.
- **Vercel Observability** — <https://vercel.com/docs/observability> (last_updated 2026-03-03) — what Vercel covers natively (logs, function metrics, middleware, AI gateway) and what it doesn't (synthetic uptime, error tracking).
- **Vercel knowledge update (2026-02-27)** — provided in session — confirms Fluid Compute, Node 24 LTS default, `vercel.ts` introduction, BotID GA, Queues beta, Sandbox GA.

### Secondary (MEDIUM confidence — verified against primary)
- **Supabase RLS guide** — WebFetch <https://supabase.com/docs/guides/database/postgres/row-level-security> — confirms `TO authenticated` clause as a separate ~99.78% improvement on top of `(SELECT …)` wrapping.
- **Supabase local development** — WebFetch <https://supabase.com/docs/guides/local-development> + WebFetch <https://supabase.com/docs/guides/local-development/cli/getting-started> — `supabase start` runs full stack in Docker; default ports 54321–54324.
- **Cursor pagination supabase-js** — GitHub Discussions `supabase/supabase #21330` "Multi-column cursor pagination using the JS Client" — `(created_at, id)` tuple pattern with `.or('a.lt.X,and(a.eq.X,b.lt.Y)')`.
- **Sentry Next.js setup** — WebFetch <https://docs.sentry.io/platforms/javascript/guides/nextjs/> — wizard creates `instrumentation.ts`, `instrumentation-client.ts`, `sentry.server.config.ts`, etc. (Next.js 16 `proxy.ts` compatibility not explicitly mentioned in docs at fetch time; needs validation during implementation.)
- **UptimeRobot vs Better Stack** — UptimeRobot Knowledge Hub "15 Better Stack Alternatives 2026" — UptimeRobot free tier covers 50 monitors at 5-min interval; sufficient for pilot.

### Tertiary (LOW confidence — flag for validation)
- **Sentry + Next.js 16 `proxy.ts` interaction** — Sentry docs don't explicitly call out `proxy.ts` support yet. Validation step during implementation: after the codemod runs and Sentry is wired, deliberately trigger a server error and confirm a stacktrace lands in Sentry with proper symbolisation.
- **Resend rate limits at our volume** — Resend's standard plan covers our SLA-alert volume comfortably (~10s of emails/day at pilot scale), but if HQ scope expands to webhook-driven user notifications later, recheck the per-second throttle.
- **Supabase `[db.seed] sql_paths` ordering across CLI versions** — verified pattern from docs but minor risk that older CLI versions pre-2026 process files differently. Pin `supabase` CLI version in `package.json` devDependencies.
</sources>

<metadata>
## Metadata

**Research scope:**
- Core technology: Next.js 16 + Supabase production hardening
- Ecosystem: Resend, Upstash Ratelimit, Sentry, UptimeRobot, Vercel Cron, Vercel Observability
- Patterns: RLS InitPlan caching, realtime auth audit, cron+email idempotency, cursor pagination, hermetic vitest, security headers
- Pitfalls: cron duplicate delivery, proxy runtime trap, fail-closed rate limiter, Resend domain verification, audit log cross-tenant visibility

**Confidence breakdown:**
- Standard stack: HIGH — verified with Context7 across 4 official sources, all current versions
- Architecture patterns: HIGH — every pattern has a Context7 or official-docs source
- Don't hand-roll: HIGH — each row backed by a specific failure mode or external dep we already use
- Common pitfalls: HIGH — all eight have either a doc citation, an in-codebase precedent, or both
- Code examples: HIGH — patterns are direct adaptations of Context7-fetched canonical examples
- Sources confidence: HIGH on Vercel + Supabase + Resend + Upstash; MEDIUM on Sentry/Next.js 16 interaction (one validation step flagged); MEDIUM on observability vendor (multiple options work)

**Research date:** 2026-05-04
**Valid until:** 2026-06-04 (30 days — Vercel + Supabase ecosystems stable; Next.js 16 still current)

**Carry-overs explicitly mapped to research:**
- ✅ RLS InitPlan caching sweep (Pattern 1, 00014 migration)
- ✅ Broadcast trigger function lockdown (Pattern 2, 00017 migration)
- ✅ Hermetic vitest (Pattern 8, supabase start + seed)
- ✅ Next.js 16 middleware → proxy (Pattern 6, codemod)
- ✅ Cursor pagination on lead list (Pattern 7)
- ✅ `createServiceRoleClient` / `createAdminClient` convergence (Open Q6)
- ✅ Stat-tile component consolidation (Open Q4)
- ✅ Conversion-rate comparator (Open Q5)
- ✅ Sales-rep no-answer flake (Open Q7)
- ✅ HQ sidebar real surfaces (Open Q5 — recommend Phase 7)
- ⏭ Range-picker UI on country-admin overview (small UI lift, fold into hardening sweep plan)
- ⏭ `E2E_AUTH_ENABLED=true` in `.env.local.example` (one-line diff, fold into hardening sweep)
- ⏭ `.next/dev` cache restart in dev-server runbook (RUNBOOK.md content)
</metadata>

---

*Phase: 06-production-hardening*
*Research completed: 2026-05-04*
*Ready for planning: yes — proceed to `/gsd:plan-phase 6`*
*Note for plan-phase: existing 06-01/06-02/06-03 PLAN.md drafts (April 27) are stale and should be reconciled or replaced, not extended.*
