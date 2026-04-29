# Phase 2: Data Model & Ingestion — Research

**Researched:** 2026-04-29
**Domain:** Supabase Postgres + RLS multi-tenancy, Realtime, Next.js 16 webhook ingest, concurrent assignment
**Confidence:** HIGH

<research_summary>
## Summary

Phase 2 builds the spine of the product: Postgres schema (`leads`, `lead_events`, `callbacks`, plus `countries` / `forms` / `user_roles` reference tables), country-scoped RLS, a HMAC-verified `/api/leads/ingest` webhook, round-robin assignment, CSV import, and realtime surfacing to the assigned agent's queue.

The stack is locked (Supabase + Next.js 16 + Zod). The genuinely research-worthy areas are: (1) **RLS performance under multi-tenant JWT claims** — the well-known `(select auth.jwt())` wrap is mandatory, not optional; (2) **Realtime architecture** — Supabase has shifted hard from `postgres_changes` to **Broadcast from Database** for scaling; building on `postgres_changes` would be a 2023-era choice; (3) **concurrent round-robin assignment** — naïve "pick least-loaded agent then UPDATE" races under simultaneous webhooks, and the canonical fix is a Postgres function using `FOR UPDATE SKIP LOCKED`; (4) **webhook body handling** — `request.json()` consumes the body, breaking HMAC verification; the order is `text()` → `timingSafeEqual` → `JSON.parse`.

**Primary recommendation:** Use Realtime **Broadcast from Database** (`realtime.broadcast_change` trigger), not `postgres_changes`. Wrap every `auth.jwt()` / `auth.uid()` reference in `(select …)` inside RLS policies. Implement round-robin as a `SECURITY DEFINER` Postgres function called from the ingest route, using `FOR UPDATE SKIP LOCKED` on the agent pool. Read the webhook body as text, verify HMAC with `crypto.timingSafeEqual` against a constant-time-equal-length buffer, then parse JSON.
</research_summary>

<standard_stack>
## Standard Stack

### Core (already locked by project)
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `@supabase/supabase-js` | 2.x | Client + server SDK | Default for Supabase |
| `@supabase/ssr` | latest | Cookie-based auth in Next.js 16 RSCs | Replaces deprecated `auth-helpers-nextjs` |
| `zod` | 3.x | Body / param validation | Project standard, called out in PRD/technical.md |
| Postgres | 17.6 (Supabase) | Database + RLS | Already provisioned |
| Next.js Route Handlers | 16 | Webhook + CSV endpoints | App Router default |
| Node `crypto` | built-in | HMAC + `timingSafeEqual` | Stdlib, no dependency |

### Supporting
| Library | Purpose | When to Use |
|---------|---------|-------------|
| `papaparse` | CSV parse | CSV importer endpoint (Path 3 fallback ingest) |
| `nanoid` or built-in `crypto.randomUUID()` | IDs for trace logs | Structured logging correlation |

### Deliberately not used
| Instead of | Why |
|------------|-----|
| `bull` / `pg-boss` / external queue | Single-row INSERT + assignment is small enough to run inline; no need for a job queue in Phase 2 |
| `next-safe-action` | Server Actions are auth-checked manually with Zod; one more wrapper isn't worth the indirection at this scale |
| `postgres_changes` Realtime channel | Scaling ceiling and per-row RLS overhead — see SOTA section |

**Installation (additions only — most already in repo):**
```bash
npm install -w apps/web papaparse
npm install -w apps/web -D @types/papaparse
```
</standard_stack>

<architecture_patterns>
## Architecture Patterns

### Recommended Layout (additions to existing repo)
```
packages/supabase/
├── migrations/
│   ├── 00001_rbac_schema.sql          # already exists from Phase 1
│   ├── 00002_reference_data.sql       # countries, forms, seed
│   ├── 00003_leads_schema.sql         # leads, lead_events, callbacks + RLS
│   ├── 00004_assignment_function.sql  # round-robin SECURITY DEFINER fn
│   ├── 00005_realtime_broadcast.sql   # broadcast triggers + auth policies
│   ├── 00006_views.sql                # dashboard views
│   └── 00007_seed_dev_data.sql        # dev-only synthetic leads (gated)
└── src/
    ├── dal/
    │   ├── leads.ts                   # server-only lead reads
    │   ├── events.ts                  # append-only event log
    │   └── assignments.ts             # wrapper around assign_lead() RPC
    └── schemas/
        ├── ingest.ts                  # Zod schemas for webhook body
        └── csvImport.ts

apps/web/app/api/
├── leads/
│   ├── ingest/route.ts                # HMAC + Zod + insert + assign + log
│   └── import-csv/route.ts            # multipart/form-data → bulk insert
```

### Pattern 1: RLS policy with JWT-claim caching (MANDATORY)
**What:** Wrap `auth.jwt()` and `auth.uid()` in `(select …)` so Postgres runs an `initPlan` and caches the result for the whole statement instead of evaluating per-row.
**When to use:** Every RLS policy that reads JWT claims. Performance gain is documented at >99% on large tables.
**Example:**
```sql
-- BAD: auth.jwt() called per row
CREATE POLICY "country_scoped_read" ON public.leads
  FOR SELECT TO authenticated
  USING ((auth.jwt() ->> 'country_code') = country_code);

-- GOOD: initPlan caches once per statement
CREATE POLICY "country_scoped_read" ON public.leads
  FOR SELECT TO authenticated
  USING (
    ((SELECT auth.jwt() ->> 'user_role') = 'hq_admin')
    OR ((SELECT auth.jwt() ->> 'country_code') = country_code)
  );

-- Index that supports the policy
CREATE INDEX leads_country_status_idx ON public.leads (country_code, status);
```
Source: <https://supabase.com/docs/guides/troubleshooting/rls-performance-and-best-practices-Z5Jjwv>, <https://supabase.com/docs/guides/database/postgres/row-level-security>

### Pattern 2: Round-robin under concurrency via SKIP LOCKED
**What:** Two webhooks arriving in the same millisecond must not both pick the same agent. Naïve `SELECT … ORDER BY load LIMIT 1; UPDATE …` races. Solution: a `SECURITY DEFINER` Postgres function that locks the candidate row with `FOR UPDATE SKIP LOCKED` so concurrent calls automatically pick different agents.
**When to use:** Any "claim least-loaded worker" / "claim next item" pattern with concurrent producers.
**Example:**
```sql
CREATE OR REPLACE FUNCTION public.assign_lead(p_lead_id uuid, p_country text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_agent_id uuid;
BEGIN
  -- Pick least-loaded active agent in country, lock the row,
  -- skip any agent another concurrent transaction is already assigning to.
  SELECT ur.user_id INTO v_agent_id
  FROM public.user_roles ur
  LEFT JOIN LATERAL (
    SELECT count(*) AS open_count
    FROM public.leads l
    WHERE l.assigned_to = ur.user_id
      AND l.status IN ('new', 'contacted')
  ) load ON true
  WHERE ur.role = 'agent'
    AND ur.country_code = p_country
    AND ur.is_active = true
  ORDER BY load.open_count ASC,
           ur.last_assigned_at ASC NULLS FIRST
  LIMIT 1
  FOR UPDATE OF ur SKIP LOCKED;

  IF v_agent_id IS NULL THEN
    -- Fallback: assign to country admin (also logged as 'unassigned' edge case)
    SELECT ur.user_id INTO v_agent_id
    FROM public.user_roles ur
    WHERE ur.role = 'country_admin'
      AND ur.country_code = p_country
      AND ur.is_active = true
    LIMIT 1;
  END IF;

  UPDATE public.leads
    SET assigned_to = v_agent_id, status = 'new'
    WHERE id = p_lead_id;

  UPDATE public.user_roles
    SET last_assigned_at = now()
    WHERE user_id = v_agent_id;

  INSERT INTO public.lead_events (lead_id, actor_id, type, payload)
    VALUES (p_lead_id, v_agent_id, 'assigned', jsonb_build_object('reason', 'round_robin'));

  RETURN v_agent_id;
END;
$$;

REVOKE ALL ON FUNCTION public.assign_lead(uuid, text) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.assign_lead(uuid, text) TO service_role;
```
Note: `last_assigned_at` is added to `user_roles` to break ties fairly. The `LATERAL` subquery is the load count — could also be a materialized counter if it ever becomes hot.
Source: <https://www.postgresql.org/docs/current/explicit-locking.html>, <https://hatchet.run/blog/multi-tenant-queues>, <https://www.inferable.ai/blog/posts/postgres-skip-locked>

### Pattern 3: Realtime Broadcast from Database (NOT `postgres_changes`)
**What:** Use a Postgres trigger that calls `realtime.broadcast_change()` to push a typed event onto a topic. Clients subscribe to the topic via `supabase.channel(topic).on('broadcast', …)`. RLS-equivalent authorization is enforced via policies on the `realtime.messages` table.
**When to use:** All client-facing realtime in this app — the agent queue, country admin dashboard, HQ overview. The PRD's `leads:assigned_to=eq.<uid>` pattern (`postgres_changes`) was the right idea in 2023; the 2025 standard is broadcast.
**Example:**
```sql
-- Per-user topic so an agent only receives their own assignments
CREATE OR REPLACE FUNCTION public.broadcast_lead_assigned()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF NEW.assigned_to IS NOT NULL
     AND (TG_OP = 'INSERT' OR OLD.assigned_to IS DISTINCT FROM NEW.assigned_to) THEN
    PERFORM realtime.broadcast_changes(
      'agent:' || NEW.assigned_to::text,   -- topic
      TG_OP,                                -- event
      TG_OP,                                -- operation
      TG_TABLE_NAME,                        -- table
      TG_TABLE_SCHEMA,                      -- schema
      NEW,
      OLD
    );
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER leads_broadcast_assigned
AFTER INSERT OR UPDATE OF assigned_to ON public.leads
FOR EACH ROW EXECUTE FUNCTION public.broadcast_lead_assigned();

-- Authorization: only the agent themselves (or HQ) can subscribe to their topic
CREATE POLICY "agent_own_topic" ON realtime.messages
  FOR SELECT TO authenticated
  USING (
    realtime.topic() = 'agent:' || (SELECT auth.uid())::text
    OR (SELECT auth.jwt() ->> 'user_role') = 'hq_admin'
  );
```
Client side:
```ts
const channel = supabase
  .channel(`agent:${userId}`, { config: { private: true } })
  .on('broadcast', { event: 'INSERT' }, ({ payload }) => prependLead(payload.record))
  .subscribe()
```
Source: <https://supabase.com/docs/guides/realtime/broadcast>, <https://supabase.com/features/realtime-broadcast-from-database>, <https://supabase.com/docs/guides/realtime/authorization>

### Pattern 4: Webhook handler order of operations
**What:** Read body as text, HMAC-verify before parsing, then Zod-parse, then insert.
**When to use:** Every external webhook endpoint, no exceptions.
**Example:**
```ts
// apps/web/app/api/leads/ingest/route.ts
import { createHmac, timingSafeEqual } from 'node:crypto'
import { ingestSchema } from '@paratus/supabase/schemas/ingest'
import { createServiceRoleClient } from '@paratus/supabase/server'

export async function POST(req: Request) {
  // 1. Raw body (consume ONCE, before JSON)
  const raw = await req.text()

  // 2. Constant-time HMAC compare
  const sig = req.headers.get('x-paratus-signature') ?? ''
  const expected = createHmac('sha256', process.env.PARATUS_INGEST_SECRET!)
    .update(raw)
    .digest('hex')
  const sigBuf = Buffer.from(sig, 'hex')
  const expBuf = Buffer.from(expected, 'hex')
  if (sigBuf.length !== expBuf.length || !timingSafeEqual(sigBuf, expBuf)) {
    return new Response('invalid signature', { status: 401 })
  }

  // 3. Parse + validate
  const body = ingestSchema.safeParse(JSON.parse(raw))
  if (!body.success) {
    return Response.json({ error: body.error.flatten() }, { status: 400 })
  }

  // 4. Insert + assign in one transaction (DAL hides the service-role client)
  const supabase = createServiceRoleClient()
  const { data: lead, error } = await supabase.rpc('ingest_lead', body.data)
  if (error) return Response.json({ error: error.message }, { status: 500 })

  return Response.json({ lead_id: lead.id }, { status: 201 })
}
```
Note: `ingest_lead` is a Postgres function that does the dedupe-check, INSERT, assign_lead RPC, and event log atomically — keeps the route handler thin.
Source: <https://docs.github.com/en/webhooks/using-webhooks/validating-webhook-deliveries>

### Pattern 5: Idempotency via partial unique index
**What:** Zapier and similar bridges retry on 5xx; clicking "submit" twice on a slow form retries. Without idempotency, you get duplicate leads. PRD calls for dedupe on `(form_slug, email|phone, submitted_at within 5 min)`.
**When to use:** Any insert path with retries.
**Example:**
```sql
-- Bucket submitted_at to 5-minute slots so retries within window collide
CREATE UNIQUE INDEX leads_dedupe_idx ON public.leads (
  form_slug,
  COALESCE(lower(email), phone, ''),
  date_trunc('minute', submitted_at) - (extract(minute from submitted_at)::int % 5) * interval '1 minute'
);
```
On conflict in `ingest_lead()`: catch `unique_violation`, return the existing `lead_id`, skip the insert. Caller sees a `200` instead of `201`.

### Anti-Patterns to Avoid
- **`postgres_changes` for end-user channels:** single-threaded, RLS check per event, capped throughput. Use Broadcast from Database.
- **Plain `===` or `==` HMAC compare:** vulnerable to timing attacks; always `crypto.timingSafeEqual` on equal-length buffers.
- **`request.json()` before HMAC:** body is consumed and re-stringified — bytes won't match the sender's hash.
- **Picking-then-updating without a lock:** two concurrent ingests assign the same agent twice.
- **`auth.jwt()` un-wrapped in RLS:** N rows × M policies = N×M JWT decodes; benchmarks show >100× slowdown on large tables.
- **`user_metadata` for authorization claims:** user-editable; use the custom access token hook with a dedicated `user_roles` table (already the project pattern).
- **Forgetting `country_code` index:** RLS pushes the predicate down, but the planner needs an index to use it; otherwise full scan even with policy.
</architecture_patterns>

<dont_hand_roll>
## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| HMAC string compare | `if (sig === expected)` | `crypto.timingSafeEqual` on equal-length `Buffer`s | Timing-attack safe; stdlib |
| Realtime fan-out from DB | `LISTEN/NOTIFY` + custom WebSocket gateway | `realtime.broadcast_changes` trigger + Supabase Realtime | RLS-equivalent auth, scales to 10k+ connections, hosted |
| Picking next agent under concurrency | App-side mutex / Redis lock | Postgres function with `FOR UPDATE SKIP LOCKED` | Same DB, atomic, no extra infra |
| Webhook idempotency | App-side dedupe table + lookup | Partial unique index + `ON CONFLICT` catch | Atomic with insert; race-free |
| Bulk CSV → leads | Row-by-row INSERT in a loop | `papaparse` stream + Supabase `insert([...])` chunked at 500 rows | 100× faster, fewer round trips |
| JWT minting / verification | Custom JWT lib | Supabase Auth (already does it) | The custom claims hook is the only injection point you should write |
| Per-row "did this user write this?" auditing | `created_by` triggers everywhere | Just enforce via RLS `WITH CHECK ((select auth.uid()) = actor_id)` | Same effect, less code, planner-cached |

**Key insight:** Every one of these has a sharp edge that an app-layer reimplementation will hit (timing leaks, race conditions, RLS bypass, fan-out scaling). The Postgres + Supabase platform has a documented one-liner for each — use it.
</dont_hand_roll>

<common_pitfalls>
## Common Pitfalls

### Pitfall 1: Un-cached JWT calls in RLS policies
**What goes wrong:** Queries that should be sub-100ms p95 take 1–10s; CPU pinned on JWT decode.
**Why it happens:** `auth.jwt()` called once per row scanned. With 10k leads and 3 policies, that's 30k JWT decodes per query.
**How to avoid:** Always wrap: `(select auth.jwt() ->> 'country_code')`. Confirmed in `EXPLAIN ANALYZE` — look for `InitPlan` node.
**Warning signs:** `EXPLAIN ANALYZE` shows the policy expression evaluated per row instead of in an `InitPlan`; query latency scales linearly with row count.

### Pitfall 2: `postgres_changes` chosen over Broadcast
**What goes wrong:** Works fine in dev with 3 test users; in production with 50 agents online, latency spikes to 5–30s and some events drop.
**Why it happens:** `postgres_changes` runs RLS *per event* on a single thread to preserve order. At ~hundreds of concurrent listeners it saturates.
**How to avoid:** Default to Broadcast from Database. Reserve `postgres_changes` for low-volume admin-only channels.
**Warning signs:** Realtime dashboard shows queue length > 0 on the postgres_changes worker; clients reporting "missed" inserts.

### Pitfall 3: HMAC verification after `request.json()`
**What goes wrong:** Signature never matches, even though sender and receiver share the secret. Webhooks 401 in production.
**Why it happens:** `await request.json()` consumes the stream and re-serialises; whitespace/key-order differences mean the hash differs.
**How to avoid:** `await request.text()` first, hash that string, then `JSON.parse(raw)`.
**Warning signs:** Verification works in unit tests (where the body is hand-built) but fails with real webhook traffic.

### Pitfall 4: Race in round-robin assignment
**What goes wrong:** Two webhooks fire 50ms apart; both `SELECT` and pick agent A; both `UPDATE` to assign A. Agent A gets two leads, agent B gets none.
**Why it happens:** Read-modify-write without a row lock. Even `SELECT ... LIMIT 1` doesn't lock.
**How to avoid:** Wrap pick + assign in a Postgres function using `FOR UPDATE SKIP LOCKED`. Concurrent calls automatically skip each other and pick different agents.
**Warning signs:** Log shows N leads created in a 1s window, all assigned to the same agent.

### Pitfall 5: RLS enabled but no supporting index
**What goes wrong:** Country admin opens the leads table, query hangs for 8s on 50k rows.
**Why it happens:** Policy `country_code = (select auth.jwt() ->> 'country_code')` is correct, but without an index on `country_code` Postgres does a sequential scan.
**How to avoid:** Every column referenced in an RLS policy gets an index. Multi-column index where the policy filters on multiple columns: `(country_code, status)`, `(assigned_to, status)`.
**Warning signs:** `EXPLAIN` shows `Seq Scan` on a table with a country-scoped policy.

### Pitfall 6: Webhook idempotency forgotten
**What goes wrong:** A flaky network retry creates the same lead 3 times. Three agents call the same person.
**Why it happens:** Zapier/n8n retry on 5xx without sender-side idempotency keys.
**How to avoid:** Partial unique index covering `(form_slug, contact, time-bucket)` + `ON CONFLICT DO NOTHING RETURNING id`. Return existing `lead_id` to caller.
**Warning signs:** Same `email + form` appearing as 2+ rows within minutes; agents complaining about duplicate leads.

### Pitfall 7: Realtime authorization missed for private channels
**What goes wrong:** An agent in country MZ subscribes to `agent:<other-agent-uid>` and receives the other agent's leads.
**Why it happens:** Forgot `{ config: { private: true } }` on the channel, or didn't write the policy on `realtime.messages`.
**How to avoid:** Channels carrying any user-scoped data MUST be private; policy on `realtime.messages` checks `realtime.topic()` against the authenticated user.
**Warning signs:** Cross-tenant Playwright test sees data it shouldn't.
</common_pitfalls>

<code_examples>
## Code Examples

### Country-scoped RLS policy set on `leads`
```sql
-- Source: combination of supabase.com/docs/guides/database/postgres/row-level-security
--         and PRD/data-model.md

ALTER TABLE public.leads ENABLE ROW LEVEL SECURITY;

-- HQ sees everything
CREATE POLICY "hq_admin_all" ON public.leads
  FOR ALL TO authenticated
  USING ((SELECT auth.jwt() ->> 'user_role') = 'hq_admin')
  WITH CHECK ((SELECT auth.jwt() ->> 'user_role') = 'hq_admin');

-- Country admin sees their country
CREATE POLICY "country_admin_country_scoped" ON public.leads
  FOR ALL TO authenticated
  USING (
    (SELECT auth.jwt() ->> 'user_role') = 'country_admin'
    AND (SELECT auth.jwt() ->> 'country_code') = country_code
  )
  WITH CHECK (
    (SELECT auth.jwt() ->> 'user_role') = 'country_admin'
    AND (SELECT auth.jwt() ->> 'country_code') = country_code
  );

-- Agents only see their own assigned leads, in their own country
CREATE POLICY "agent_own_assignments" ON public.leads
  FOR SELECT TO authenticated
  USING (
    (SELECT auth.jwt() ->> 'user_role') = 'agent'
    AND assigned_to = (SELECT auth.uid())
    AND (SELECT auth.jwt() ->> 'country_code') = country_code
  );

-- Agents can update only their own leads (status, notes)
CREATE POLICY "agent_update_own" ON public.leads
  FOR UPDATE TO authenticated
  USING (
    (SELECT auth.jwt() ->> 'user_role') = 'agent'
    AND assigned_to = (SELECT auth.uid())
  )
  WITH CHECK (
    assigned_to = (SELECT auth.uid())
    AND (SELECT auth.jwt() ->> 'country_code') = country_code
  );

-- Indexes that the policies actually use
CREATE INDEX leads_country_status_idx     ON public.leads (country_code, status);
CREATE INDEX leads_assigned_status_idx    ON public.leads (assigned_to, status);
CREATE INDEX leads_submitted_at_desc_idx  ON public.leads (submitted_at DESC);
```

### Zod schema for webhook ingest
```ts
// packages/supabase/src/schemas/ingest.ts
import { z } from 'zod'

export const ingestSchema = z.object({
  form_slug: z.string().min(1),
  country_code: z.string().length(2).regex(/^[A-Z]{2}$/),
  submitted_at: z.string().datetime(),
  name: z.string().min(1).max(200),
  email: z.string().email().optional().nullable(),
  phone: z.string().min(5).max(40).optional().nullable(),
  message: z.string().max(5000).optional().nullable(),
  source_url: z.string().url().optional().nullable(),
  utm_source: z.string().max(120).optional().nullable(),
  utm_medium: z.string().max(120).optional().nullable(),
  utm_campaign: z.string().max(120).optional().nullable(),
  raw_payload: z.record(z.string(), z.unknown()).optional(),
}).refine(d => d.email || d.phone, {
  message: 'Either email or phone is required',
})

export type IngestInput = z.infer<typeof ingestSchema>
```

### Two-tenant cross-country RLS test (the Phase 2 acceptance criterion)
```ts
// tests/rls.cross-tenant.test.ts — runs from CLIENT SDK, not service_role
import { createClient } from '@supabase/supabase-js'

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

test('country admin cannot read another country leads', async () => {
  const mzAdmin = createClient(url, anon)
  await mzAdmin.auth.signInWithPassword({
    email: 'para.group.n8n+country-admin@gmail.com',  // MZ admin
    password: process.env.MZ_ADMIN_PASSWORD!,
  })

  // Seed a lead in BW under service_role beforehand (test setup)
  const { data, error } = await mzAdmin.from('leads')
    .select('id')
    .eq('country_code', 'BW')

  expect(error).toBeNull()
  expect(data).toHaveLength(0)  // RLS hides BW from MZ admin
})
```

### Realtime client subscription on the agent queue
```ts
// apps/web/app/(sales-rep)/[country]/queue/_realtime.ts
'use client'
import { useEffect } from 'react'
import { createBrowserClient } from '@supabase/ssr'

export function useLeadStream(userId: string, onNewLead: (lead: Lead) => void) {
  useEffect(() => {
    const supabase = createBrowserClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    )
    const channel = supabase
      .channel(`agent:${userId}`, { config: { private: true } })
      .on('broadcast', { event: 'INSERT' }, ({ payload }) => onNewLead(payload.record))
      .on('broadcast', { event: 'UPDATE' }, ({ payload }) => onNewLead(payload.record))
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [userId, onNewLead])
}
```
</code_examples>

<sota_updates>
## State of the Art (2025–2026)

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `postgres_changes` for client realtime | **Broadcast from Database** via `realtime.broadcast_changes()` | 2024–2025 | Scales to tens of thousands of clients; single-threaded `postgres_changes` worker is the bottleneck |
| `auth.jwt()` direct in RLS | `(select auth.jwt())` wrapping for `initPlan` caching | Codified in 2024 perf docs | >99% query-time reduction on large tables |
| `auth-helpers-nextjs` | `@supabase/ssr` | 2023, fully replacing in 2024 | Cookie auth that works with App Router + RSC |
| `app_metadata` only for roles | Custom Access Token Hook + `user_roles` table | 2023+ | Project already uses this from Phase 1 |
| Public Realtime channels | **Private channels** (`config.private: true`) + `realtime.messages` RLS | 2024 | Required for any user-scoped data |

**New tools/patterns to consider:**
- **Postgres Event Triggers** (added to Supabase platform 2025): can enforce "RLS must be enabled" on every new table — useful as a CI / deployment guard.
- **`pg_cron` for scheduled callbacks** (already on Supabase): if Phase 3 needs "remind agent at scheduled callback time," `pg_cron` + a small worker function is cheaper than an external scheduler.

**Deprecated/outdated:**
- `auth-helpers-nextjs` — gone, use `@supabase/ssr`.
- `postgres_changes` for any channel above ~hundreds of concurrent listeners — keep for admin-only / low-volume.
- Server-side Supabase client without `cookies()` integration — won't read auth correctly under Next.js 16 RSC.
</sota_updates>

<open_questions>
## Open Questions

1. **HQ realtime channel — broadcast or polling?**
   - What we know: HQ sees all-country aggregate KPIs; broadcasting every lead to every HQ admin scales but is wasteful (HQ rarely needs sub-second freshness).
   - What's unclear: whether to subscribe HQ to a digest broadcast or just refetch views every 30s.
   - Recommendation: poll views every 30s in Phase 2; revisit only if HQ users complain. Saves Realtime cost and complexity.

2. **CSV import — Server Action or Route Handler?**
   - What we know: CSVs can be tens of MB; Server Actions have a body-size limit; Route Handlers stream more easily with `formData()`.
   - What's unclear: whether the country-admin upload UI has a clean Server Action upload path in Next.js 16, or if Route Handler + signed Storage URL is cleaner.
   - Recommendation: Route Handler `apps/web/app/api/leads/import-csv/route.ts` accepting `multipart/form-data`, parsing with `papaparse` in chunks of 500. Defer to Phase 4 if a richer UI is wanted.

3. **`form_country_routing` table — needed in Phase 2 or later?**
   - What we know: PRD/lead-ingestion.md introduces this for mapping form → country recipient emails.
   - What's unclear: whether ingestion needs it (the webhook payload already carries `country_code` and `form_slug`).
   - Recommendation: skip for Phase 2. Add when the alerting / "lead route summary for country admin" feature lands in Phase 4.
</open_questions>

<sources>
## Sources

### Primary (HIGH confidence)
- `/websites/supabase` (Context7) — RLS performance + best practices, JWT optimization, custom claims hook, broadcast architecture
- <https://supabase.com/docs/guides/troubleshooting/rls-performance-and-best-practices-Z5Jjwv> — `(select auth.jwt())` wrap, indexing
- <https://supabase.com/docs/guides/database/postgres/row-level-security> — RLS patterns
- <https://supabase.com/docs/guides/database/postgres/custom-claims-and-role-based-access-control-rbac> — custom claim hook (matches AMA pattern in repo)
- <https://supabase.com/docs/guides/realtime/broadcast> — broadcast channel API
- <https://supabase.com/docs/guides/realtime/authorization> — private channels + `realtime.messages` RLS
- <https://supabase.com/features/realtime-broadcast-from-database> — `realtime.broadcast_changes` trigger helper
- <https://supabase.com/docs/guides/realtime/benchmarks> — postgres_changes throughput ceiling
- <https://www.postgresql.org/docs/current/explicit-locking.html> — `FOR UPDATE SKIP LOCKED` semantics
- <https://docs.github.com/en/webhooks/using-webhooks/validating-webhook-deliveries> — HMAC verification reference (timingSafeEqual pattern)

### Secondary (MEDIUM confidence — verified against primary)
- <https://www.inferable.ai/blog/posts/postgres-skip-locked> — SKIP LOCKED queue pattern, verified against PG docs
- <https://hatchet.run/blog/multi-tenant-queues> — round-robin under load, sequence numbers (informative only; project uses simpler load-count strategy)
- AMA reference repo `~/Projects/ama-amacare-stats-callback-dashboard/packages/supabase/migrations/00001_rbac_schema.sql` — the proven RBAC + JWT hook pattern this build mirrors

### Tertiary (LOW confidence — flagged for verification during implementation)
- None. All patterns above verified against official Supabase / Postgres docs.
</sources>

<metadata>
## Metadata

**Research scope:**
- Core technology: Supabase Postgres + RLS, Realtime, Next.js 16 Route Handlers
- Ecosystem: `@supabase/ssr`, Zod, Node `crypto`, papaparse
- Patterns: JWT-cached RLS, Broadcast-from-DB, SKIP LOCKED round-robin, HMAC webhook ordering, idempotency via partial unique index
- Pitfalls: postgres_changes scaling, JWT decode cost, race in assignment, body consumption, missing indexes, private-channel auth

**Confidence breakdown:**
- Standard stack: HIGH — all already locked or stdlib
- Architecture: HIGH — verified against official docs + matches AMA reference pattern
- Pitfalls: HIGH — each has a documented fix in primary sources
- Code examples: HIGH — RLS / triggers / handler patterns from official docs and adapted to project schema

**Research date:** 2026-04-29
**Valid until:** 2026-05-29 (30 days — Supabase platform stable; revisit if Realtime architecture changes)
</metadata>

---

*Phase: 02-data-model-ingestion*
*Research completed: 2026-04-29*
*Ready for planning: yes*
