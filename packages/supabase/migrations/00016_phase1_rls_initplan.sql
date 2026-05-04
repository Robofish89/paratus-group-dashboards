-- ───────────────────────────────────────────────────────────────────────────
-- Paratus Group Dashboards — Phase 1 RLS InitPlan caching sweep
-- (migration 00016, plan 06-03 task 2)
--
-- Three Phase 1 policies on public.user_roles call auth.jwt() / auth.uid()
-- UNWRAPPED. Postgres treats those as volatile per-row, so the planner
-- re-evaluates the session function on every row scanned. Wrapping the call
-- in a scalar subquery — `(SELECT auth.jwt() ...)` — flips it to InitPlan
-- caching: the planner evaluates the function ONCE per query and reuses the
-- cached value for every row.
--
-- Supabase's own performance-tuning docs cite up to 99.78 % wall-clock
-- improvement on row-narrowing policies that use this pattern. Phase 2's
-- leads/lead_events/callbacks policies already shipped wrapped (decision in
-- STATE.md); Phase 4 plan 04-04 corrected its Country admins read policy
-- to wrapped at apply time. The five Phase 5 realtime.messages policies
-- (00013) ship wrapped. The three remaining stragglers — all on
-- public.user_roles — are closed by this migration.
--
-- Role narrowing (TO authenticated) was already applied at apply-time on
-- all three target policies (audit at plan 06-03 start showed polroles =
-- {authenticated} already). This migration is therefore a pure
-- USING/WITH CHECK rewrite — no role-grant change.
--
-- The supabase_auth_admin policy ("Auth admin reads user_roles for JWT hook"
-- from 00002) is intentionally left alone: it's scoped to a single privileged
-- role (supabase_auth_admin), not authenticated, and runs once per JWT
-- mint inside Supabase's auth hook — no row-loop, no caching benefit.
--
-- ───────────────────────────────────────────────────────────────────────────

-- 1. "HQ admins read all user_roles" — Phase 1 (00001), unwrapped today.
--    USING-only policy (FOR SELECT). Wrap auth.jwt() in (SELECT ...).
DROP POLICY IF EXISTS "HQ admins read all user_roles" ON public.user_roles;
CREATE POLICY "HQ admins read all user_roles" ON public.user_roles
  FOR SELECT TO authenticated
  USING ((SELECT auth.jwt() ->> 'user_role') = 'hq_admin');

-- 2. "HQ admins manage user_roles" — Phase 1 (00001), unwrapped today.
--    FOR ALL ⇒ wrap on both USING and WITH CHECK.
DROP POLICY IF EXISTS "HQ admins manage user_roles" ON public.user_roles;
CREATE POLICY "HQ admins manage user_roles" ON public.user_roles
  FOR ALL TO authenticated
  USING ((SELECT auth.jwt() ->> 'user_role') = 'hq_admin')
  WITH CHECK ((SELECT auth.jwt() ->> 'user_role') = 'hq_admin');

-- 3. "Users read own role" — Phase 1 (00001), unwrapped today.
--    Wrap auth.uid() in (SELECT ...) for InitPlan caching.
DROP POLICY IF EXISTS "Users read own role" ON public.user_roles;
CREATE POLICY "Users read own role" ON public.user_roles
  FOR SELECT TO authenticated
  USING (user_id = (SELECT auth.uid()));
