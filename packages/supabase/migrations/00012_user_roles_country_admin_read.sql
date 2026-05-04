-- 00012_user_roles_country_admin_read: country admins can SELECT their country's user_roles
--
-- Phase 1 shipped two policies on user_roles: HQ admins read all, users read their
-- own row. Phase 4's reassign UI and lead-list "Assigned To" column both read from
-- user_roles via getCountryAgents() — under a country_admin's seat, RLS returned the
-- empty set and the dropdown showed "No other agents in this country" even when
-- agents existed. The HTTP route worked because the SECURITY DEFINER reassign_lead
-- RPC bypasses RLS internally.
--
-- This adds a read-only, country-scoped policy for country_admin so the UI display
-- paths resolve. Writes remain HQ-only via the existing "HQ admins manage user_roles"
-- policy (unchanged).

CREATE POLICY "Country admins read country user_roles"
  ON public.user_roles FOR SELECT
  TO authenticated
  USING (
    (SELECT auth.jwt() ->> 'user_role') = 'country_admin'
    AND country_code::text = (SELECT auth.jwt() ->> 'country_code')
  );
