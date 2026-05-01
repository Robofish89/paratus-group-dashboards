-- ───────────────────────────────────────────────────────────────────────────
-- Paratus Group Dashboards — RBAC v2 (migration 00003, plan 02-01 task 1)
--
-- Purpose: lock in the multi-tenant RBAC contract that Phase 2+ depends on.
-- Adds the two columns Phase 2 needs on user_roles:
--   * last_assigned_at — break ties fairly in round-robin assignment (02-04)
--   * display_name     — used in agent listings + activity feeds
--
-- Phase 1 already shipped the rest of "RBAC v2" up front (see migration 00001):
--   * app_role enum: hq_admin | country_admin | agent (no legacy admin/viewer)
--   * country_code enum: 12 active + 3 coming-soon ISO codes
--   * user_roles.country_code with CHECK constraint that requires it for
--     country_admin/agent and forbids it for hq_admin
--   * custom_access_token_hook injects user_role + country_code + user_active
--     into every JWT on issue
--   * Test users (hq, country-admin@MZ, agent@MZ) provisioned to match
--
-- Hence this migration is deliberately small and additive. Every statement is
-- IF NOT EXISTS / idempotent so re-running is safe.
-- ───────────────────────────────────────────────────────────────────────────

-- 1. Tie-breaker for round-robin agent picking. NULL means "never been
--    assigned" — sorted FIRST so brand-new agents pick up the first lead.
ALTER TABLE public.user_roles
  ADD COLUMN IF NOT EXISTS last_assigned_at TIMESTAMPTZ;

-- 2. Display name surfaced in admin lists, queue cards, and event timelines.
--    Optional; falls back to email at render time.
ALTER TABLE public.user_roles
  ADD COLUMN IF NOT EXISTS display_name TEXT;

-- 3. Document the multi-tenancy contract on the table + tenant column.
COMMENT ON TABLE public.user_roles IS
  'Single source of truth for who can do what. role + country_code are mirrored into the JWT by custom_access_token_hook and consulted by every RLS policy.';

COMMENT ON COLUMN public.user_roles.country_code IS
  'ISO-3166-1 alpha-2 (enum). NULL only for hq_admin; CHECK constraint enforces this. Drives every country-scoped RLS policy in Phase 2+.';

COMMENT ON COLUMN public.user_roles.last_assigned_at IS
  'Most recent time this agent received a round-robin assignment. NULL means never assigned — sorted first so new agents prime quickly.';

COMMENT ON COLUMN public.user_roles.display_name IS
  'Human-facing label for the user in dashboards. Falls back to auth.users.email when NULL.';
