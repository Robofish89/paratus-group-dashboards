-- Fix: the custom_access_token_hook runs as supabase_auth_admin, but
-- public.user_roles has RLS enabled and all existing policies are
-- scoped to the `authenticated` role. That meant the hook's SELECT
-- against user_roles returned zero rows during login, so the JWT was
-- issued without user_role / country_code / user_active claims and
-- middleware bounced every user to /unauthorized.
--
-- Add a permissive SELECT policy for supabase_auth_admin so the hook
-- can read the role row at token-issue time. supabase_auth_admin is
-- not a superuser and does not bypass RLS, so it needs an explicit
-- policy. The table grants are unchanged.

create policy "Auth admin reads user_roles for JWT hook"
  on public.user_roles
  as permissive
  for select
  to supabase_auth_admin
  using (true);
