-- ───────────────────────────────────────────────────────────────────────────
-- Paratus Group Dashboards — Reference Data (migration 00004, plan 02-01 task 2)
--
-- Creates the two reference tables that every Phase 2+ schema FKs to:
--   * countries — 12 active + 3 coming-soon ISO codes, name, currency, tz
--   * forms     — 10 form/service types
--
-- Both tables are tenant-agnostic reference data: every authenticated user
-- needs to read them (e.g. country_admin lists "Mozambique"; agent renders
-- "Starlink for Schools" badge). Writes are locked to service_role — these
-- are slow-changing sets, mutated by ops, not by the app.
--
-- Phase 1 already declared the country_code as a Postgres ENUM in migration
-- 00001 for compile-time safety on user_roles. countries.code is text + FK
-- so leads/callbacks (Phase 2+) can FK to it without taking on the enum's
-- "drop value requires recreating the type" maintenance penalty.
-- ───────────────────────────────────────────────────────────────────────────

-- 1. Status enum — drives whether a country shows up in dashboards / accepts
--    leads. Flipping coming-soon → active is a single UPDATE.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'country_status') THEN
    CREATE TYPE public.country_status AS ENUM ('active', 'coming_soon');
  END IF;
END $$;

-- 2. countries — primary reference. ISO 3166-1 alpha-2 as PK so leads.country_code
--    (text) can FK to it directly.
CREATE TABLE IF NOT EXISTS public.countries (
  code        TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  currency    TEXT,
  timezone    TEXT NOT NULL,
  status      public.country_status NOT NULL DEFAULT 'active',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.countries IS
  'Reference table — every Paratus market. Multi-tenant primary key referenced by leads.country_code, callbacks.country_code (Phase 2+). Activate a coming-soon market with a single UPDATE — no schema change.';

COMMENT ON COLUMN public.countries.status IS
  'active = visible in dashboards + accepts leads. coming_soon = data model supports it but UI 404s and group KPIs ignore it.';

-- 3. forms — the 10 product/service form types served by Paratus's web
--    properties (general contact + 9 product funnels).
CREATE TABLE IF NOT EXISTS public.forms (
  slug              TEXT PRIMARY KEY,
  display_name      TEXT NOT NULL,
  landing_page_url  TEXT,
  is_active         BOOLEAN NOT NULL DEFAULT true,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.forms IS
  'Reference table — the form/service taxonomy. leads.form_slug FKs here (Phase 2+). Adding a new form = single INSERT; deactivating = is_active=false (preserves history).';

-- 4. Enable RLS — every table from migration 001 onwards.
ALTER TABLE public.countries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.forms     ENABLE ROW LEVEL SECURITY;

-- 5. Policies — reference data is readable by every authenticated user.
--    No write policies => RLS denies all writes for authenticated/anon.
--    service_role bypasses RLS, so seeding + ops mutations still work.
DROP POLICY IF EXISTS "countries_read_all" ON public.countries;
CREATE POLICY "countries_read_all"
  ON public.countries
  FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS "forms_read_all" ON public.forms;
CREATE POLICY "forms_read_all"
  ON public.forms
  FOR SELECT
  TO authenticated
  USING (true);

-- 6. Seed countries. 12 active + 3 coming-soon (LS, MW, ZW). Timezones
--    chosen for SLA calculations — IANA names, not abbreviations.
INSERT INTO public.countries (code, name, currency, timezone, status) VALUES
  ('AO', 'Angola',        'AOA', 'Africa/Luanda',       'active'),
  ('BW', 'Botswana',      'BWP', 'Africa/Gaborone',     'active'),
  ('CD', 'DRC',           'CDF', 'Africa/Kinshasa',     'active'),
  ('SZ', 'Eswatini',      'SZL', 'Africa/Mbabane',      'active'),
  ('KE', 'Kenya',         'KES', 'Africa/Nairobi',      'active'),
  ('MZ', 'Mozambique',    'MZN', 'Africa/Maputo',       'active'),
  ('NA', 'Namibia',       'NAD', 'Africa/Windhoek',     'active'),
  ('RW', 'Rwanda',        'RWF', 'Africa/Kigali',       'active'),
  ('ZA', 'South Africa',  'ZAR', 'Africa/Johannesburg', 'active'),
  ('TZ', 'Tanzania',      'TZS', 'Africa/Dar_es_Salaam','active'),
  ('UG', 'Uganda',         'UGX', 'Africa/Kampala',      'active'),
  ('ZM', 'Zambia',        'ZMW', 'Africa/Lusaka',       'active'),
  ('LS', 'Lesotho',       'LSL', 'Africa/Maseru',       'coming_soon'),
  ('MW', 'Malawi',        'MWK', 'Africa/Blantyre',     'coming_soon'),
  ('ZW', 'Zimbabwe',      'ZWG', 'Africa/Harare',       'coming_soon')
ON CONFLICT (code) DO NOTHING;

-- 7. Seed forms — 10 form/service types from PRD overview.
INSERT INTO public.forms (slug, display_name) VALUES
  ('general-contact',      'General Contact'),
  ('carrier-services',     'Carrier Services'),
  ('satellite',            'Satellite'),
  ('data-centers',         'Data Centers'),
  ('broadband',            'Broadband'),
  ('oneweb',               'OneWeb'),
  ('starlink',             'Starlink'),
  ('essential-access',     'Essential Access'),
  ('connect2care',         'Connect2Care'),
  ('starlink-for-schools', 'Starlink for Schools')
ON CONFLICT (slug) DO NOTHING;
