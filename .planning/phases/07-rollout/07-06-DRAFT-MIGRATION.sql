-- ───────────────────────────────────────────────────────────────────────────
-- DRAFT — Plan 07-06 — Supabase Advisor Sweep (migration 00019)
--
-- ⚠️  NOT YET APPLIED. This file lives in `.planning/phases/07-rollout/` as a
--     reviewable spec. Promote to `packages/supabase/migrations/00019_advisor_sweep.sql`
--     when ready to ship. Apply via the MCP `apply_migration` tool — keeps
--     the local migrations/ dir in lockstep with the remote project.
--
-- Scope:
--   * Three function_search_path_mutable fixes (security WARN)
--   * Two unindexed_foreign_keys covering indexes (performance INFO)
--   * Inline comment block documenting the accepted-by-design lints
--     (authenticated_security_definer_function_executable × 11) and the
--     stale advisor cache (auth_rls_initplan × 19, all policies already
--     use the (SELECT auth.x()) form — see plan 07-06 PLAN for the diff).
--
-- Out of scope (deferred to follow-up plans):
--   * multiple_permissive_policies × 14 — needs its own RLS-test gate.
--   * unused_index × 5 — re-evaluate after 90 d of steady-state load.
--
-- Out of migration (handled separately):
--   * auth_leaked_password_protection — Supabase Dashboard toggle (see plan
--     07-06 user_setup frontmatter).
--
-- All statements are idempotent; running twice is a no-op.
-- ───────────────────────────────────────────────────────────────────────────

-- ─── 1. Function search_path lockdown ─────────────────────────────────────
-- Prevents trojan-search-path attacks where a malicious schema with a
-- shadowing function name is placed earlier on the search_path. Empty
-- search_path = function must qualify every reference (or rely on
-- pg_catalog/pg_temp which Postgres always implicitly checks).
--
-- Approach: re-CREATE OR REPLACE the function with `SET search_path` so the
-- function body is unchanged but the parameter is locked. This avoids the
-- ALTER FUNCTION quirk where re-creating later (e.g. a hot-fix) would drop
-- the SET back to the default.

-- handle_updated_at: trigger function used by user_roles. Body only touches
-- NEW (no schema-qualified references), so empty search_path is safest.
CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- custom_access_token_hook: JWT issuance hook. References public.user_roles
-- and the public.app_role + public.country_code enums; needs `public` on the
-- search_path. pg_temp is conventional defence-in-depth.
CREATE OR REPLACE FUNCTION public.custom_access_token_hook(event jsonb)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SET search_path = 'public', 'pg_temp'
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

  IF v_role IS NOT NULL THEN
    claims := jsonb_set(claims, '{user_role}', to_jsonb(v_role::text));
  ELSE
    claims := jsonb_set(claims, '{user_role}', 'null'::jsonb);
  END IF;

  IF v_country IS NOT NULL THEN
    claims := jsonb_set(claims, '{country_code}', to_jsonb(v_country::text));
  ELSE
    claims := jsonb_set(claims, '{country_code}', 'null'::jsonb);
  END IF;

  IF v_active IS NOT NULL THEN
    claims := jsonb_set(claims, '{user_active}', to_jsonb(v_active));
  ELSE
    claims := jsonb_set(claims, '{user_active}', 'true'::jsonb);
  END IF;

  event := jsonb_set(event, '{claims}', claims);
  RETURN event;
END;
$$;

-- set_lead_event_country_code: trigger function on lead_events. References
-- public.leads; needs `public` on the search_path.
CREATE OR REPLACE FUNCTION public.set_lead_event_country_code()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = 'public', 'pg_temp'
AS $$
BEGIN
  SELECT country_code INTO NEW.country_code
  FROM public.leads
  WHERE id = NEW.lead_id;

  IF NEW.country_code IS NULL THEN
    RAISE EXCEPTION 'lead_events.country_code could not be derived from lead %', NEW.lead_id
      USING ERRCODE = 'foreign_key_violation';
  END IF;

  RETURN NEW;
END;
$$;

-- ─── 2. Covering indexes for unindexed FKs ────────────────────────────────
-- Postgres does not auto-create indexes on the referencing column of a FK.
-- Without one, every cascade-update / cascade-delete on the parent row
-- triggers a sequential scan on the child table to find dependants — fine
-- at pilot scale, but cheap to fix.

-- audit_log.actor_id → auth.users(id). Mostly NULL for system-driven events
-- (e.g. SLA breach cron), so a partial index avoids bloat.
CREATE INDEX IF NOT EXISTS audit_log_actor_id_idx
  ON public.audit_log(actor_id)
  WHERE actor_id IS NOT NULL;

-- callbacks.lead_id → leads(id). Always populated; full B-tree index.
CREATE INDEX IF NOT EXISTS callbacks_lead_id_idx
  ON public.callbacks(lead_id);

-- ─── 3. Documentation: accepted-by-design lints ───────────────────────────
-- The Supabase advisor will continue to flag the following as WARN. They
-- are accepted by design and should NOT be "fixed" without re-architecting
-- the RPC layer:
--
--   * authenticated_security_definer_function_executable × 11
--     Functions: agent_performance_in_range, agent_stats_in_range,
--     complete_call, country_stats_in_range, group_speed_to_lead_series,
--     mark_lead_contacted, record_audit, record_no_answer, reassign_lead,
--     schedule_callback, speed_to_lead_series.
--     Pattern: SECURITY DEFINER + internal role/country guards + EXECUTE
--     granted to authenticated. Switching to SECURITY INVOKER would force
--     every guard into RLS-friendly SQL, a large refactor for no security
--     gain (the guards are exercised in cross-tenant vitest suites).
--
-- The advisor will also clear (or already shows stale) for:
--
--   * auth_rls_initplan × 19
--     All policies on leads, lead_events, callbacks, audit_log, user_roles,
--     and realtime.messages already use the (SELECT auth.<function>())
--     form (verified via pg_policies before this migration). The advisor
--     cache will refresh on the next lint pass.

-- ─── End of migration ─────────────────────────────────────────────────────
