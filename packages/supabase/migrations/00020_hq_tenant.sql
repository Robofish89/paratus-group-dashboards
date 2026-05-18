-- 00020_hq_tenant.sql
-- ---------------------------------------------------------------------------
-- HQ / Group pseudo-tenant.
--
-- WHY: the live General Contact form (Elementor e9ad77c) defaults its country
-- dropdown to "Paratus Africa Group (Head Office)" — a group-level value, not
-- a country. Those leads (likely the highest-volume bucket, since it is the
-- pre-selected option) must be captured group-side instead of dropped or
-- mis-routed to a country. See .planning/elementor-form-inventory-2026-05-18.md
-- and .planning/questions-for-paratus-group.md (Q3).
--
-- SCOPE: this migration is the minimal slice — it makes the ingest FK accept
-- country_code 'HQ' so leads land and surface to hq_admin (read-everywhere
-- RLS). Round-robin assign_lead('HQ') finds no agent/admin and leaves the
-- lead status='new', assigned_to=NULL (logged reason 'no_recipient') — exactly
-- the graceful path already in 00007. Who works HQ leads is a Paratus policy
-- decision (Q3); provisioning HQ workers is deferred until they answer.
--
-- leads.country_code FKs to countries.code (TEXT) — NOT the public.country_code
-- ENUM (that enum is only on user_roles). So no enum change is needed here.
--
-- 'HQ' satisfies the ingest Zod contract (length 2, /^[A-Z]{2}$/).
-- ---------------------------------------------------------------------------

INSERT INTO public.countries (code, name, currency, timezone, status) VALUES
  ('HQ', 'Paratus Group (HQ)', NULL, 'Africa/Windhoek', 'active')
ON CONFLICT (code) DO NOTHING;

COMMENT ON TABLE public.countries IS
  'Reference table — every Paratus market, plus the HQ group pseudo-tenant '
  '(code=''HQ'') for group-level leads (e.g. General Contact "Head Office"). '
  'Multi-tenant primary key referenced by leads.country_code, '
  'callbacks.country_code. Activate a coming-soon market with a single UPDATE.';
