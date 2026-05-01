---
phase: 02-data-model-ingestion
plan: 03
status: shipped
shipped_at: 2026-05-01
subsystem: database/ingest-pipeline
requires:
  - 02-02
provides:
  - ingest-lead-rpc
  - assign-lead-fn
  - leads-dedupe-index
  - realtime-broadcast
  - realtime-private-channel-rls
affects:
  - 02-04-csv-importer
  - 02-05-webhook-route-handler
  - 02-06-realtime-validation
key-files:
  - packages/supabase/migrations/00007_assignment_function.sql
  - packages/supabase/migrations/00008_realtime_broadcast.sql
key-decisions:
  - date_bin('5 minutes', submitted_at, '2000-01-01Z'::timestamptz) replaces the plan's date_trunc/extract for the dedupe bucket — only date_bin's timestamptz overload is IMMUTABLE, which is required by the unique index. Same 5-minute semantics, deterministic UTC origin.
  - ON CONFLICT uses inference (expression list) not ON CONSTRAINT — the dedupe index is on expressions, not raw columns, so it cannot be promoted to a true table constraint.
  - assign_lead does NOT raise when no agent and no admin exists — sets assigned_to=NULL, status='new', logs assigned event with reason='no_recipient' so HQ can still see and triage.
  - country_code on user_roles is the enum; cast to text for the parameter comparison (assign_lead's p_country is plain text matching countries.code).
  - Migration filename shift +1 vs. plan: plan said 00006/00007, shipped 00007/00008 (Phase 1 took 00002 for the auth-admin grant; 02-01 used 00003+00004; 02-02 used 00005+00006).
---

# Plan 02-03 — Assignment + Ingest RPC + Realtime Broadcast: Closure

The Phase 2 spine is now self-contained. `ingest_lead(payload)` is the single atomic entry point; plan 02-05's webhook route will be a ~30-line wrapper around it. Realtime fires on every INSERT and assignment so the sales-rep queue (Phase 3) and country-admin dashboard (Phase 4) can subscribe without polling.

## What was actually shipped

| Task | What | Commit |
|------|------|--------|
| 1 | Migration `00007_assignment_function.sql` — `leads_dedupe_idx` (unique on form_slug + contact + 5-min bucket via `date_bin`), `assign_lead(uuid, text)` with FOR UPDATE SKIP LOCKED + admin fallback, `ingest_lead(jsonb)` atomic wrapper (validate → insert → log → assign) | `34d8593` |
| 2 | Migration `00008_realtime_broadcast.sql` — publication ADD TABLE leads, `broadcast_lead_to_agent` + `broadcast_lead_to_country` triggers, 3 RLS policies on `realtime.messages` for private channels (agent_own / country_admin_country / hq_country) | `61ae3c4` |

Both migrations applied to `tgswsdfaszvztbpczfve` via the Management API SQL endpoint.

## Migration-numbering shift (documented)

Plan 02-03 referenced `00006_assignment_function.sql` and `00007_realtime_broadcast.sql`. Actually shipped as **`00007_assignment_function.sql`** and **`00008_realtime_broadcast.sql`** — the +1 shift Phase 2 has carried since plan 02-01 (Phase 1 already used 00002 for the auth-admin grant).

Current state of `packages/supabase/migrations/`:
- `00001_rbac_schema.sql` (Phase 1)
- `00002_allow_auth_admin_read_user_roles.sql` (Phase 1)
- `00003_rbac_v2.sql` (plan 02-01)
- `00004_reference_data.sql` (plan 02-01)
- `00005_leads_schema.sql` (plan 02-02)
- `00006_views.sql` (plan 02-02)
- `00007_assignment_function.sql` (plan 02-03 — was "00006" in plan)
- `00008_realtime_broadcast.sql` (plan 02-03 — was "00007" in plan)

Plan 02-04 (CSV importer) should expect the next migration filename to be `00009_*` if it ships any DDL.

## Verification (live Supabase)

**Task 1 — assignment + ingest:**
- `leads_dedupe_idx` exists as a unique index on the dedupe expressions (verified via `pg_indexes` after migration).
- `assign_lead(uuid, text) → uuid` and `ingest_lead(jsonb) → jsonb` both exist with `SECURITY DEFINER`, `SET search_path = public`, and `EXECUTE` granted only to `service_role`.
- Idempotency proven: `ingest_lead` called 4 times across 3 distinct semantic states:
  - First call → `{lead_id, agent_id, duplicate:false}`, lead inserted, assigned to MZ test agent.
  - Same payload again → `{lead_id (same), duplicate:true}`, no second insert.
  - Same 5-min bucket but different timestamp inside the bucket → `{lead_id (same), duplicate:true}`.
  - Different 5-min bucket → new lead inserted, also assigned to same agent.
- `count(*) FROM leads WHERE email='test1@example.com'` = 2 (one per bucket); `count(*) FROM lead_events …` = 4 (2× created + 2× assigned).
- Unknown country → `{"error":"unknown_country","country_code":"XX"}`.
- Unknown form → `{"error":"unknown_form","form_slug":"not-a-form"}`.
- Smoke leads cleaned up after the test; only the 3 original 02-02 cross-tenant seed leads (MZ/BW/ZA) remain. `user_roles.last_assigned_at` reset to NULL so plan 02-04+ start from clean fairness state.

**Task 2 — realtime broadcast:**
- `pg_trigger`: `leads_broadcast_agent` (AFTER INSERT OR UPDATE OF assigned_to) and `leads_broadcast_country` (AFTER INSERT OR UPDATE) both present.
- `pg_publication_tables`: `public.leads` is now in the `supabase_realtime` publication (it was empty before).
- `pg_policy` on `realtime.messages`: 3 policies — `agent_own_topic`, `country_admin_country_topic`, `hq_country_topic`.
- Trigger fan-out verified end-to-end: after `ingest_lead()` for an MZ lead, `realtime.messages` recorded:
  - `country:MZ` event=`INSERT` (the bare INSERT into leads)
  - `country:MZ` event=`UPDATE` (`assign_lead`'s UPDATE setting assigned_to)
  - `agent:<uid>` event=`UPDATE` (the assigned_to change → per-agent topic)
- The agent topic correctly does NOT fire on the bare INSERT because `ingest_lead` inserts with `assigned_to=NULL`, then `assign_lead` UPDATEs it. This is intentional — the per-agent topic only fires once a lead is actually theirs.
- `npm run type-check` and `npm run lint` both clean.

## Issues encountered

**Plan's bucketing expression is not IMMUTABLE.** Plan task 1 step 1 prescribes:
```
date_trunc('minute', submitted_at) - (extract(minute FROM submitted_at)::int % 5) * interval '1 minute'
```
This works as a value but Postgres rejects it inside a unique index because `date_trunc(text, timestamptz)` is STABLE (depends on session timezone). Replaced with the IMMUTABLE timestamptz overload of `date_bin`:
```
date_bin('5 minutes'::interval, submitted_at, '2000-01-01Z'::timestamptz)
```
Same 5-minute semantics; the fixed UTC origin makes the value deterministic. The same expression is repeated in the `ON CONFLICT` clause and the duplicate-lookup query inside `ingest_lead` so Postgres can infer the index.

**ON CONFLICT ON CONSTRAINT is not available for expression indexes.** Plan suggested `ON CONFLICT ON CONSTRAINT leads_dedupe_idx`. That syntax requires a true table constraint, which `ALTER TABLE … ADD CONSTRAINT … UNIQUE (…)` only supports on raw columns. For expression-based unique indexes you must use the inference syntax (`ON CONFLICT (expr1, expr2, …) DO NOTHING`). Used inference; plan's documented fallback path was correct.

**`realtime.messages` partitioning during smoke test.** The table is partitioned by `RANGE(inserted_at)` and had zero partitions when we applied the migration — Supabase Realtime's worker creates daily partitions on demand, typically when the first subscriber connects. `realtime.send()` swallows the "no partition" error via `WHEN OTHERS THEN RAISE WARNING`, so a broadcast appears to succeed but doesn't persist. Created today's partition manually (`realtime.messages_2026_05_01`) just for the smoke test so we could observe the rows; production broadcasts will work end-to-end as soon as the first WebSocket subscriber arrives, because the realtime worker manages partitions then. This is a platform behavior, not a migration concern — left the manually-created partition in place (harmless, and gives today's broadcasts a target if any happen before the worker's first sweep).

**`assign_lead` returns NULL safely when no recipient exists.** Plan didn't specify behavior when both agent and admin pools are empty for a country (a real edge case during early rollout — country activated in `countries` but no users seeded yet). Chose to: set `assigned_to=NULL` and `status='new'`, log an event with `reason='no_recipient'`, and return NULL. This way the lead is captured (HQ can still see it via the `hq_admin_all` policy), the operator gets a clear signal, and no exception is raised that would reject the webhook.

**Cleaned up state after smoke tests.** Both task smoke tests inserted real leads. After verifying behavior, deleted the smoke leads (`test1@example.com`, `broadcast-test@example.com`, `broadcast-smoke-2@example.com`) and reset `user_roles.last_assigned_at` to NULL. Only the 3 original 02-02 cross-tenant seed leads (MZ/BW/ZA) remain — those stay for plan 02-06's RLS test.

## Next-phase readiness

Plan 02-04 (CSV importer) and plan 02-05 (webhook route handler) can both call `ingest_lead(payload)` directly; the only thing left to build app-side is HMAC verification + Zod parsing + service-role client wiring.

Plan 02-06 will:
- Run the cross-tenant RLS test using the 3 existing seed leads — sign in as MZ country admin, confirm BW/ZA leads are not visible.
- Verify the realtime fan-out by subscribing as the MZ test agent and triggering an INSERT — should receive a broadcast on `agent:<uid>`.
- The realtime partitioning concern resolves itself the moment a real client subscribes (Supabase's housekeeping creates partitions then).

## Files changed

- Created `packages/supabase/migrations/00007_assignment_function.sql`
- Created `packages/supabase/migrations/00008_realtime_broadcast.sql`

No app-code changes — both migrations are pure DB. `Database` TypeScript type does not need regeneration: the new RPCs aren't in the public schema's `Tables` map, and the generator only re-emits `Functions` if the function shape changes. (We can regenerate at the end of Phase 2 to pick up the RPC types in one pass.)

---

*Plan 02-03 closed 2026-05-01. Two commits on `main`. Ready for plan 02-04 (CSV importer) or plan 02-05 (webhook route handler).*
