-- ───────────────────────────────────────────────────────────────────────────
-- Paratus Group Dashboards — Realtime Broadcast (migration 00008, plan 02-03 task 2)
--
-- Wires the leads table into Supabase Realtime via Broadcast-from-Database
-- (NOT postgres_changes — see RESEARCH SOTA section + Pitfall 2).
--
--   1. ALTER PUBLICATION supabase_realtime ADD TABLE public.leads
--      (idempotent — guarded by pg_publication_tables check).
--   2. broadcast_lead_to_agent() trigger — pushes to the per-agent topic
--      `agent:<uid>` whenever a lead is INSERTed with assigned_to set, or
--      whenever assigned_to changes via UPDATE. The agent's queue subscribes
--      to that topic for live updates (RESEARCH Pattern 3).
--   3. broadcast_lead_to_country() trigger — pushes EVERY change to the
--      country topic `country:<code>`. The country admin dashboard
--      subscribes to that topic for the live pipeline view.
--   4. RLS on realtime.messages — enforces who can subscribe to which
--      private channel:
--        - agent:<uid>     — only that agent (or hq_admin)
--        - country:<code>  — only country_admin of that country (or hq_admin)
--      Channels MUST be opened with `{ config: { private: true } }` in the
--      client SDK to be auth-checked against these policies (Pitfall 7).
--
-- NUMBERING NOTE: plan 02-03 referenced 00007_realtime_broadcast.sql but
-- numbering shifted +1 across all of phase 2 (Phase 1 took 00002 for the
-- auth-admin grant). See 02-03-SUMMARY.md.
-- ───────────────────────────────────────────────────────────────────────────

-- 1. Add `leads` to the supabase_realtime publication (idempotent).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'leads'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.leads;
  END IF;
END $$;

-- 2. Per-agent broadcast — fires on INSERT or when assigned_to changes.
CREATE OR REPLACE FUNCTION public.broadcast_lead_to_agent()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.assigned_to IS NOT NULL
     AND (TG_OP = 'INSERT' OR OLD.assigned_to IS DISTINCT FROM NEW.assigned_to) THEN
    PERFORM realtime.broadcast_changes(
      'agent:' || NEW.assigned_to::text,  -- topic_name
      TG_OP,                               -- event_name
      TG_OP,                               -- operation
      TG_TABLE_NAME,                       -- table_name
      TG_TABLE_SCHEMA,                     -- table_schema
      NEW,                                 -- new record
      OLD                                  -- old record
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS leads_broadcast_agent ON public.leads;
CREATE TRIGGER leads_broadcast_agent
  AFTER INSERT OR UPDATE OF assigned_to ON public.leads
  FOR EACH ROW EXECUTE FUNCTION public.broadcast_lead_to_agent();

-- 3. Per-country broadcast — fires on every INSERT/UPDATE in the country.
CREATE OR REPLACE FUNCTION public.broadcast_lead_to_country()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM realtime.broadcast_changes(
    'country:' || NEW.country_code,
    TG_OP,
    TG_OP,
    TG_TABLE_NAME,
    TG_TABLE_SCHEMA,
    NEW,
    OLD
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS leads_broadcast_country ON public.leads;
CREATE TRIGGER leads_broadcast_country
  AFTER INSERT OR UPDATE ON public.leads
  FOR EACH ROW EXECUTE FUNCTION public.broadcast_lead_to_country();

-- 4. RLS on realtime.messages — private-channel authorization.
--    realtime.messages already has rowsecurity=true (platform default),
--    we just add the SELECT policies that gate subscriptions.
--
--    Each policy is dropped-then-created so the migration is re-runnable.
DROP POLICY IF EXISTS "agent_own_topic" ON realtime.messages;
CREATE POLICY "agent_own_topic" ON realtime.messages
  FOR SELECT TO authenticated
  USING (
    realtime.topic() = 'agent:' || (SELECT auth.uid())::text
    OR (SELECT auth.jwt() ->> 'user_role') = 'hq_admin'
  );

DROP POLICY IF EXISTS "country_admin_country_topic" ON realtime.messages;
CREATE POLICY "country_admin_country_topic" ON realtime.messages
  FOR SELECT TO authenticated
  USING (
    (SELECT auth.jwt() ->> 'user_role') = 'country_admin'
    AND realtime.topic() = 'country:' || (SELECT auth.jwt() ->> 'country_code')
  );

DROP POLICY IF EXISTS "hq_country_topic" ON realtime.messages;
CREATE POLICY "hq_country_topic" ON realtime.messages
  FOR SELECT TO authenticated
  USING (
    (SELECT auth.jwt() ->> 'user_role') = 'hq_admin'
    AND realtime.topic() LIKE 'country:%'
  );

COMMENT ON FUNCTION public.broadcast_lead_to_agent() IS
  'Pushes a lead INSERT or assigned_to UPDATE to the agent:<uid> private channel for live queue updates.';
COMMENT ON FUNCTION public.broadcast_lead_to_country() IS
  'Pushes every lead INSERT/UPDATE to the country:<code> private channel for the country-admin dashboard.';
