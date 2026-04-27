-- ───────────────────────────────────────────────────────────────────────────
-- Paratus Group Dashboards — RBAC Schema (migration 00001)
--
-- Creates the role + country enums, the user_roles table, RLS policies, and
-- the Custom Access Token Hook that injects user_role + country_code into
-- every JWT issued by Supabase Auth.
--
-- Multi-tenancy in this project is enforced via RLS scoped on the
-- `country_code` claim. Phase 2 migrations (leads, lead_events, callbacks)
-- will all use `(auth.jwt() ->> 'country_code') = leads.country_code` as the
-- baseline tenant predicate. This file is the foundation for that pattern.
--
-- HOW TO APPLY
--   Option A (Supabase CLI):
--     supabase db push --db-url "$DATABASE_URL"
--   Option B (Dashboard):
--     Authentication has nothing to do here yet — paste this whole file into
--     the Supabase Dashboard → SQL Editor → New query → Run.
--
-- MANUAL FOLLOW-UP (cannot be done from SQL — required, not optional)
--   Authentication → Hooks → Custom Access Token Hook
--     1. Enable
--     2. Function: public.custom_access_token_hook (Postgres)
--     3. Save and reload
--   Without this, the hook never fires and JWT claims will be missing
--   `user_role` / `country_code`, which means middleware will keep every
--   user on the unauthorized page.
-- ───────────────────────────────────────────────────────────────────────────

-- 1. Role enum — three Paratus roles. No `viewer` (HQ has read-everywhere
--    access via role check; other read-only access is not part of v1).
CREATE TYPE public.app_role AS ENUM ('hq_admin', 'country_admin', 'agent');

-- 2. Country enum — ISO 3166-1 alpha-2 codes for all 15 Paratus markets.
--    12 active countries + 3 coming-soon (LS Lesotho, MW Malawi, ZW Zimbabwe).
--    Coming-soon codes are present from day 1 so the data model supports them
--    without a schema change when activated.
CREATE TYPE public.country_code AS ENUM (
  'AO', 'BW', 'CD', 'SZ', 'KE', 'MZ', 'NA', 'RW', 'ZA', 'TZ', 'UG', 'ZM',
  'LS', 'MW', 'ZW'
);

-- 3. user_roles table. Each authenticated user gets exactly one row mapping
--    them to a role and (for non-HQ roles) a country.
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL UNIQUE,
  role public.app_role NOT NULL,
  country_code public.country_code NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- HQ admins have no country (group-wide access). Country admins and
  -- agents MUST have a country — multi-tenancy is meaningless without one.
  CONSTRAINT user_roles_country_matches_role CHECK (
    (role = 'hq_admin' AND country_code IS NULL)
    OR (role IN ('country_admin', 'agent') AND country_code IS NOT NULL)
  )
);

-- 4. Enable RLS — REQUIRED on every table from migration 001 onwards.
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- 5. RLS policies for user_roles.
--    Read: HQ admins read all rows; everyone else reads only their own.
--    Write: only HQ admins (the only role that provisions new users).
CREATE POLICY "HQ admins read all user_roles"
  ON public.user_roles FOR SELECT
  TO authenticated
  USING ((auth.jwt() ->> 'user_role') = 'hq_admin');

CREATE POLICY "Users read own role"
  ON public.user_roles FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "HQ admins manage user_roles"
  ON public.user_roles FOR ALL
  TO authenticated
  USING ((auth.jwt() ->> 'user_role') = 'hq_admin')
  WITH CHECK ((auth.jwt() ->> 'user_role') = 'hq_admin');

-- 6. updated_at trigger. Single shared function so future tables can reuse.
CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER set_updated_at
  BEFORE UPDATE ON public.user_roles
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_updated_at();

-- 7. Custom Access Token Hook — runs on every JWT issuance. Reads the user's
--    role + country + active flag and injects them as top-level claims.
--    These claims are what every downstream RLS policy consults.
CREATE OR REPLACE FUNCTION public.custom_access_token_hook(event jsonb)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  claims jsonb;
  v_role public.app_role;
  v_country public.country_code;
  v_active boolean;
BEGIN
  SELECT role, country_code, is_active
    INTO v_role, v_country, v_active
  FROM public.user_roles
  WHERE user_id = (event->>'user_id')::uuid;

  claims := event->'claims';

  -- user_role: enum cast → text → JSON string. NULL when no row exists yet.
  IF v_role IS NOT NULL THEN
    claims := jsonb_set(claims, '{user_role}', to_jsonb(v_role::text));
  ELSE
    claims := jsonb_set(claims, '{user_role}', 'null'::jsonb);
  END IF;

  -- country_code: NULL for hq_admin or unprovisioned users.
  IF v_country IS NOT NULL THEN
    claims := jsonb_set(claims, '{country_code}', to_jsonb(v_country::text));
  ELSE
    claims := jsonb_set(claims, '{country_code}', 'null'::jsonb);
  END IF;

  -- user_active: defaults to true if no row yet (hook fires before
  -- provisioning); the middleware checks for an explicit false to
  -- bounce deactivated users to /unauthorized.
  IF v_active IS NOT NULL THEN
    claims := jsonb_set(claims, '{user_active}', to_jsonb(v_active));
  ELSE
    claims := jsonb_set(claims, '{user_active}', 'true'::jsonb);
  END IF;

  event := jsonb_set(event, '{claims}', claims);
  RETURN event;
END;
$$;

-- 8. Grants for the hook. The Supabase Auth admin role must be able to call
--    the function and read user_roles when fetching claims; nothing else
--    should be able to invoke the hook directly.
GRANT EXECUTE ON FUNCTION public.custom_access_token_hook TO supabase_auth_admin;
GRANT USAGE ON SCHEMA public TO supabase_auth_admin;
GRANT SELECT ON public.user_roles TO supabase_auth_admin;
REVOKE EXECUTE ON FUNCTION public.custom_access_token_hook FROM authenticated, anon, public;
