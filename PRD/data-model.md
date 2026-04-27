# Data Model

Single Supabase project. All countries in one DB. Multi-tenancy enforced through RLS using a `country_code` claim injected into the JWT.

## Tables

### `countries`
Reference table — all 15 Paratus markets, with a `status` flag distinguishing active vs. coming-soon.

| Column | Type | Notes |
|--------|------|-------|
| `code` | `text PRIMARY KEY` | ISO-3166-1 alpha-2 (e.g. `'MZ'`) |
| `name` | `text NOT NULL` | "Mozambique" |
| `currency` | `text` | future use |
| `timezone` | `text NOT NULL` | for SLA calculations |
| `status` | `country_status` enum | `'active' \| 'coming_soon'` — drives whether the country shows in dashboards / accepts leads |
| `created_at` | `timestamptz DEFAULT now()` |

**Seed (active = 12):** AO Angola, BW Botswana, CD DRC, SZ Eswatini, KE Kenya, MZ Mozambique, NA Namibia, RW Rwanda, ZA South Africa, TZ Tanzania, UG Uganda, ZM Zambia.

**Seed (coming_soon = 3):** LS Lesotho, MW Malawi, ZW Zimbabwe.

Flipping a country from `coming_soon` to `active` is a single UPDATE — no schema change needed. RLS policies and views must check `status = 'active'` where appropriate so coming-soon countries don't pollute group KPIs until they're ready.

### `forms`
Reference table — the 10 form/service types.

| Column | Type | Notes |
|--------|------|-------|
| `slug` | `text PRIMARY KEY` | `'starlink'`, `'carrier-services'`, etc. |
| `display_name` | `text NOT NULL` |
| `landing_page_url` | `text` |
| `is_active` | `boolean DEFAULT true` |

### `users` / `user_roles`
Mirror AMA's RBAC pattern (see `~/Projects/ama-amacare-stats-callback-dashboard/packages/supabase/migrations/00001_rbac_schema.sql`).

| Column | Type | Notes |
|--------|------|-------|
| `id` | `uuid PRIMARY KEY` | matches `auth.users.id` |
| `user_id` | `uuid REFERENCES auth.users` |
| `role` | `app_role` enum | `'hq_admin' \| 'country_admin' \| 'agent'` |
| `country_code` | `text REFERENCES countries(code)` | NULL for `hq_admin` |
| `is_active` | `boolean` |
| `display_name` | `text` |
| `created_at`, `updated_at` | `timestamptz` |

### `leads`
The core entity.

| Column | Type | Notes |
|--------|------|-------|
| `id` | `uuid PRIMARY KEY DEFAULT gen_random_uuid()` |
| `country_code` | `text NOT NULL REFERENCES countries(code)` | tenant key |
| `form_slug` | `text NOT NULL REFERENCES forms(slug)` |
| `status` | `lead_status` enum | `new`, `contacted`, `qualified`, `converted`, `lost` |
| `assigned_to` | `uuid REFERENCES user_roles(user_id)` | nullable until assigned |
| `name` | `text NOT NULL` |
| `email` | `text` |
| `phone` | `text` |
| `message` | `text` |
| `raw_payload` | `jsonb` | full original form submission, for safety |
| `source_url` | `text` | landing page that produced the lead |
| `utm_source/medium/campaign` | `text` | optional |
| `submitted_at` | `timestamptz NOT NULL` | from form |
| `created_at` | `timestamptz DEFAULT now()` | when ingested |
| `first_contacted_at` | `timestamptz` | computed/stamped on first call event |
| `qualified_at` | `timestamptz` |
| `converted_at` | `timestamptz` |
| `lost_at` | `timestamptz` |
| `lost_reason` | `text` |

Indexes: `(country_code, status)`, `(assigned_to, status)`, `(submitted_at DESC)`, `(form_slug)`.

### `lead_events`
Append-only timeline. Anything that happens to a lead becomes a row.

| Column | Type | Notes |
|--------|------|-------|
| `id` | `uuid PRIMARY KEY` |
| `lead_id` | `uuid NOT NULL REFERENCES leads ON DELETE CASCADE` |
| `actor_id` | `uuid REFERENCES user_roles(user_id)` |
| `type` | `event_type` enum | `created`, `assigned`, `reassigned`, `call`, `note`, `status_change`, `callback_scheduled`, `email_sent` |
| `outcome` | `text` | for `call`: `connected`, `no_answer`, `callback`, `qualified`, `won`, `lost` |
| `note` | `text` |
| `payload` | `jsonb` | arbitrary structured data per event type |
| `created_at` | `timestamptz DEFAULT now()` |

Indexes: `(lead_id, created_at DESC)`, `(actor_id, created_at DESC)`, `(type)`.

### `callbacks`
Scheduled future calls. Drives the queue's "due now" surfacing.

| Column | Type | Notes |
|--------|------|-------|
| `id` | `uuid PRIMARY KEY` |
| `lead_id` | `uuid NOT NULL REFERENCES leads` |
| `assigned_to` | `uuid NOT NULL REFERENCES user_roles(user_id)` |
| `country_code` | `text NOT NULL` | denormalised for RLS |
| `scheduled_for` | `timestamptz NOT NULL` |
| `status` | `text` | `pending`, `done`, `missed` |
| `created_at` | `timestamptz` |

### Views (for dashboards)

- `lead_pipeline_by_country` — counts per status per country per day
- `speed_to_lead_daily` — median + p95 first_contacted_at - submitted_at, by country and group
- `agent_performance` — per agent: leads handled, avg response, qualification rate, conversion rate
- `lead_source_mix` — counts per form_slug per country per day
- `country_leaderboard` — country-level conversion, volume, sparklines

Views are critical: dashboards query views, not raw tables. Cheaper, faster, easier to RLS.

## Multi-tenancy via RLS

JWT custom claims (set by `custom_access_token_hook` like AMA's):
```
{
  "user_role": "agent" | "country_admin" | "hq_admin",
  "country_code": "MZ"   // null for hq_admin
}
```

Policy template for any table with `country_code`:
```sql
CREATE POLICY "Country scoped read" ON leads FOR SELECT TO authenticated
USING (
  (auth.jwt() ->> 'user_role') = 'hq_admin'
  OR (auth.jwt() ->> 'country_code') = leads.country_code
);

CREATE POLICY "Agents see own assignments only" ON leads FOR SELECT TO authenticated
USING (
  (auth.jwt() ->> 'user_role') = 'agent'
  AND assigned_to = auth.uid()
  AND (auth.jwt() ->> 'country_code') = leads.country_code
);
```
HQ admins read everything. Country admins read their country. Agents read only what's assigned to them. Writes locked to country admins (reassign) and agents (their own leads).

## Migration Order

1. `00001_rbac_schema.sql` — copy AMA's RBAC + JWT hook with role enum extended
2. `00002_reference_data.sql` — `countries`, `forms`, seed rows
3. `00003_leads_schema.sql` — `leads`, `lead_events`, `callbacks` + RLS
4. `00004_views.sql` — dashboard views
5. `00005_seed_dev_data.sql` — synthetic leads for local dev (NOT run in prod)
