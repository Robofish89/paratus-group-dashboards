-- 00021_hq_enum_value.sql
-- ---------------------------------------------------------------------------
-- Add 'HQ' to the public.country_code ENUM.
--
-- WHY: migration 00020 added the HQ pseudo-tenant to countries.code (TEXT, the
-- FK target for leads.country_code), which let HQ leads ingest. But
-- user_roles.country_code is the public.country_code ENUM (15 ISO codes only).
-- Any query filtering user_roles by 'HQ' (e.g. getCountryAgents in the HQ
-- leads drill-through) throws "invalid input value for enum country_code:
-- HQ" → 500. Adding HQ to the enum makes it a first-class tenant for
-- user_roles too, so HQ admins/agents can be provisioned (task #7 / Paratus
-- Q3) and the HQ drill-through stops erroring (returns 0 agents until any are
-- provisioned).
--
-- Safe: ADD VALUE only extends the enum; existing rows/policies/the
-- custom_access_token_hook (which casts the enum to text) are unaffected.
-- IF NOT EXISTS makes it idempotent (PG 12+).
-- ---------------------------------------------------------------------------

ALTER TYPE public.country_code ADD VALUE IF NOT EXISTS 'HQ';
