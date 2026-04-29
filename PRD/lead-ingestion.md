# Lead Ingestion

How a form submission on paratus.africa becomes a row in `leads`. This is the most fragile seam in the system — get it right or the whole product is hollow.

## Today (baseline)

Forms on paratus.africa submit to email recipients per service per country (see `quote/Paratus Company Leadsheets - Group.csv` in the proposal repo). Many also pipe into Google Sheets via Zapier or similar. Net result: 7+ disconnected sheets, manual triage.

## Target Architecture

Three ingestion paths, in priority order:

### Path 1 — Direct webhook from forms (preferred)

Wherever paratus.africa form submissions are processed (likely WordPress / a form plugin / an existing automation), add a webhook:

```
POST https://<dashboard-domain>/api/leads/ingest
Headers:
  X-Paratus-Secret: <shared secret>
  X-Paratus-Signature: <HMAC-SHA256 over body>
Body:
  {
    "form_slug": "starlink",
    "country_code": "MZ",        // resolved client-side or by form mapping
    "submitted_at": "2026-04-27T14:33:00Z",
    "name": "...", "email": "...", "phone": "...",
    "message": "...",
    "source_url": "https://paratus.africa/services/satellite-services/starlink-satellite-services/",
    "utm_source": "...", "utm_medium": "...", "utm_campaign": "...",
    "raw_payload": { /* whatever the form actually sent */ }
  }
```

Server-side handler (`apps/web/app/api/leads/ingest/route.ts`):
1. Validate shared secret + HMAC
2. Validate body with Zod
3. Resolve `form_slug` and `country_code` against reference tables; reject unknown
4. Insert into `leads`; insert `lead_events(type='created')`
5. Trigger round-robin assignment via Postgres function or in handler
6. Realtime channel auto-broadcasts to assigned agent's queue
7. Return `201` with `lead_id`

Idempotency: dedupe on `(form_slug, email or phone, submitted_at within 5 min window)`.

### Path 2 — n8n / Zapier bridge from existing flows

If the existing form plumbing can't be modified, build a small n8n workflow:
- Trigger: new row in the relevant Google Sheet (or email parser)
- Transform to webhook payload shape
- POST to `/api/leads/ingest` with shared secret

DigimountAI already runs n8n workflows for Paratus (per existing project list). Reuse that infra.

### Path 3 — CSV import (fallback / one-off)

For backfill or worst-case manual ingestion:
- `(country-admin)` page: "Import leads"
- Upload CSV → preview → confirm → bulk insert
- Useful for getting historical leads in for the first speed-to-lead baseline

## Country & Form Routing

Build a deterministic mapping table (seeded from the leadsheet CSV) so form submissions get the right country and form_slug. Stored in `forms` and a `form_country_routing` table:

| form_slug | country_code | recipient_email | leadsheet_url |
|-----------|--------------|-----------------|---------------|
| starlink | MZ | starlink.mz@paratus.africa | https://docs.google.com/... |
| starlink | BW | starlink.bw@paratus.africa | ... |
| ... | ... | ... | ... |

This table is the source of truth for "which country owns which form". Country can come from the form (some forms are country-specific, e.g. Starlink Botswana) or be selected by the user (General Contact).

## Round-robin Assignment

When a lead arrives:
- Find active agents in `country_code` with `role='agent'` and `is_active=true`
- Pick the agent with fewest `status IN ('new', 'contacted')` open leads
- Tie-break: longest time since last assignment
- Set `leads.assigned_to`; insert `lead_events(type='assigned')`

Edge cases: no active agents in country → assign to country admin as fallback, log warning. Country admin can manually reassign at any time.

## Realtime Surfacing

Use **Supabase Realtime Broadcast from Database** (not `postgres_changes`). A trigger on `leads` calls `realtime.broadcast_changes()` to publish to private per-user / per-country topics:

- Agents subscribe to `agent:<uid>` (private channel) — receives only INSERT/UPDATE where `assigned_to = uid`
- Country admins subscribe to `country:<cc>` (private channel) — receives all changes for their country
- HQ uses 30s view polling, not realtime (avoids fan-out cost; HQ doesn't need sub-second freshness)

Authorization is enforced via RLS policies on `realtime.messages` matching `realtime.topic()` against the JWT. The agent's queue page subscribes; on `INSERT` event, prepend row with slide-in animation.

> Why not `postgres_changes`? It's single-threaded, runs RLS per event, and saturates at hundreds of concurrent listeners. Broadcast scales to 10k+. See `.planning/phases/02-data-model-ingestion/02-RESEARCH.md` Pattern 3.

## SLA Clock

`first_response_seconds = first_contacted_at - submitted_at`.
Computed via trigger or in the view. Surfaced as the colour dot in the queue and the speed-to-lead chart.

## Observability

Every ingest:
- Log structured event: `{lead_id, form_slug, country_code, latency_ms}`
- Increment counter for ingestion volume per form/country/day
- Alert (phase 3) if zero leads received from a known-active form in 24h (likely webhook breakage)

## Phasing

- **Phase 2 (build)**: implement Path 1 endpoint + Path 3 CSV importer; test with synthetic data
- **Phase 3 (integration)**: wire actual paratus.africa forms (Path 1) or n8n bridge (Path 2). One country first as pilot — likely Mozambique or Namibia.
- **Phase 4 (rollout)**: enable remaining 12 countries
