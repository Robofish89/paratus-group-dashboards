-- ───────────────────────────────────────────────────────────────────────────
-- Paratus Group Dashboards — Leads Schema (migration 00005, plan 02-02 task 1)
--
-- Creates the three core domain tables for Phase 2+ and the country-scoped
-- RLS policies that enforce multi-tenancy on every read/write:
--   * leads        — the lead record (form submission → tracked through funnel)
--   * lead_events  — append-only timeline of everything that happens to a lead
--   * callbacks    — scheduled future calls; drives the "due now" queue surfacing
--
-- NUMBERING NOTE: plan 02-02 referenced 00004_leads_schema.sql, but Phase 1
-- had already shipped 00002_allow_auth_admin_read_user_roles.sql, and plan
-- 02-01 used 00003 + 00004. So this migration ships as 00005, and views as
-- 00006. The shift is documented in 02-02-SUMMARY.md.
--
-- RLS PATTERN: every auth.jwt() / auth.uid() reference is wrapped in
-- (SELECT …) so Postgres caches the JWT decode in an InitPlan once per
-- statement instead of evaluating per row. This is mandatory, not optional —
-- see 02-RESEARCH.md Pitfall 1 ("un-cached JWT calls in RLS policies").
--
-- INDEX PATTERN: every column referenced by an RLS policy or hot-path query
-- gets an index. Without supporting indexes the planner falls back to seq
-- scan even when policies are correct (02-RESEARCH.md Pitfall 5).
-- ───────────────────────────────────────────────────────────────────────────

-- 1. Enums — lead lifecycle states + event taxonomy.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'lead_status') THEN
    CREATE TYPE public.lead_status AS ENUM (
      'new', 'contacted', 'qualified', 'converted', 'lost'
    );
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'event_type') THEN
    CREATE TYPE public.event_type AS ENUM (
      'created', 'assigned', 'reassigned', 'call', 'note',
      'status_change', 'callback_scheduled', 'email_sent'
    );
  END IF;
END $$;

-- 2. leads — the core entity. Every form submission becomes a row here.
CREATE TABLE IF NOT EXISTS public.leads (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  country_code         TEXT NOT NULL REFERENCES public.countries(code),
  form_slug            TEXT NOT NULL REFERENCES public.forms(slug),
  status               public.lead_status NOT NULL DEFAULT 'new',
  assigned_to          UUID REFERENCES public.user_roles(user_id) ON DELETE SET NULL,
  name                 TEXT NOT NULL,
  email                TEXT,
  phone                TEXT,
  message              TEXT,
  raw_payload          JSONB,
  source_url           TEXT,
  utm_source           TEXT,
  utm_medium           TEXT,
  utm_campaign         TEXT,
  submitted_at         TIMESTAMPTZ NOT NULL,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  first_contacted_at   TIMESTAMPTZ,
  qualified_at         TIMESTAMPTZ,
  converted_at         TIMESTAMPTZ,
  lost_at              TIMESTAMPTZ,
  lost_reason          TEXT
);

COMMENT ON TABLE public.leads IS
  'Core entity. Every form submission ingested by /api/leads/ingest or the CSV importer becomes a row here. country_code is the tenant key — every RLS policy checks it against the JWT claim. assigned_to links to user_roles(user_id), nullable until round-robin assignment fires.';

-- 3. lead_events — append-only timeline. Every state change, call, note,
--    callback schedule, email, etc. lands here so the lead detail screen can
--    render a complete history.
--
-- DEVIATION FROM PRD: country_code is denormalised onto lead_events from
-- leads.country_code. PRD/data-model.md doesn't list it, but plan 02-02
-- task 1 step 7 explicitly requires it: makes the RLS policy symmetric with
-- leads (no JOIN) and indexable for tenant-scoped queries. Maintained by an
-- INSERT trigger that copies from leads.
CREATE TABLE IF NOT EXISTS public.lead_events (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id       UUID NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  country_code  TEXT NOT NULL REFERENCES public.countries(code),
  actor_id      UUID REFERENCES public.user_roles(user_id) ON DELETE SET NULL,
  type          public.event_type NOT NULL,
  outcome       TEXT,
  note          TEXT,
  payload       JSONB,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.lead_events IS
  'Append-only timeline. Every meaningful thing that happens to a lead is a row. country_code is denormalised from leads for symmetric RLS + indexable tenant scoping (deviation from PRD/data-model.md, documented in 02-02-SUMMARY.md). Maintained by trigger so callers never set it directly.';

-- 4. callbacks — scheduled future calls that drive the "due now" surfacing
--    on the agent queue.
CREATE TABLE IF NOT EXISTS public.callbacks (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id        UUID NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  assigned_to    UUID NOT NULL REFERENCES public.user_roles(user_id) ON DELETE CASCADE,
  country_code   TEXT NOT NULL REFERENCES public.countries(code),
  scheduled_for  TIMESTAMPTZ NOT NULL,
  status         TEXT NOT NULL DEFAULT 'pending'
                   CHECK (status IN ('pending', 'done', 'missed')),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.callbacks IS
  'Scheduled future calls. Drives the agent queue "due now" surfacing. country_code denormalised at insert (PRD/data-model.md) so RLS is symmetric across all three tables.';

-- 5. Indexes — every RLS-policy column + hot query path gets one.
CREATE INDEX IF NOT EXISTS leads_country_status_idx
  ON public.leads (country_code, status);

CREATE INDEX IF NOT EXISTS leads_assigned_status_idx
  ON public.leads (assigned_to, status);

CREATE INDEX IF NOT EXISTS leads_submitted_at_desc_idx
  ON public.leads (submitted_at DESC);

CREATE INDEX IF NOT EXISTS leads_form_slug_idx
  ON public.leads (form_slug);

CREATE INDEX IF NOT EXISTS lead_events_lead_id_idx
  ON public.lead_events (lead_id, created_at DESC);

CREATE INDEX IF NOT EXISTS lead_events_actor_idx
  ON public.lead_events (actor_id, created_at DESC);

CREATE INDEX IF NOT EXISTS lead_events_type_idx
  ON public.lead_events (type);

-- Country-scoped index for lead_events RLS — symmetric with leads.
CREATE INDEX IF NOT EXISTS lead_events_country_idx
  ON public.lead_events (country_code, created_at DESC);

CREATE INDEX IF NOT EXISTS callbacks_country_status_idx
  ON public.callbacks (country_code, status, scheduled_for);

CREATE INDEX IF NOT EXISTS callbacks_assigned_idx
  ON public.callbacks (assigned_to, status, scheduled_for);

-- 6. Trigger: keep lead_events.country_code in sync with leads.country_code.
--    Callers INSERT lead_events without country_code; the trigger fills it
--    from the parent lead. Prevents tampering and keeps the denormalisation
--    truthful.
CREATE OR REPLACE FUNCTION public.set_lead_event_country_code()
RETURNS TRIGGER
LANGUAGE plpgsql
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

DROP TRIGGER IF EXISTS lead_events_set_country_code ON public.lead_events;
CREATE TRIGGER lead_events_set_country_code
  BEFORE INSERT ON public.lead_events
  FOR EACH ROW
  EXECUTE FUNCTION public.set_lead_event_country_code();

-- 7. Trigger: updated_at on leads (reuse the shared function from 00001).
DROP TRIGGER IF EXISTS leads_set_updated_at ON public.leads;
CREATE TRIGGER leads_set_updated_at
  BEFORE UPDATE ON public.leads
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_updated_at();

-- 8. Enable RLS on all three tables.
ALTER TABLE public.leads       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lead_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.callbacks   ENABLE ROW LEVEL SECURITY;

-- 9. RLS policies on leads — copy of 02-RESEARCH.md "Country-scoped RLS
--    policy set on leads". Every auth.jwt() / auth.uid() is wrapped in
--    (SELECT …) for InitPlan caching.

-- HQ admins see and manage everything (group-wide oversight).
DROP POLICY IF EXISTS "leads_hq_admin_all" ON public.leads;
CREATE POLICY "leads_hq_admin_all"
  ON public.leads FOR ALL TO authenticated
  USING ((SELECT auth.jwt() ->> 'user_role') = 'hq_admin')
  WITH CHECK ((SELECT auth.jwt() ->> 'user_role') = 'hq_admin');

-- Country admins see and manage their country.
DROP POLICY IF EXISTS "leads_country_admin_country_scoped" ON public.leads;
CREATE POLICY "leads_country_admin_country_scoped"
  ON public.leads FOR ALL TO authenticated
  USING (
    (SELECT auth.jwt() ->> 'user_role') = 'country_admin'
    AND (SELECT auth.jwt() ->> 'country_code') = country_code
  )
  WITH CHECK (
    (SELECT auth.jwt() ->> 'user_role') = 'country_admin'
    AND (SELECT auth.jwt() ->> 'country_code') = country_code
  );

-- Agents see only their own assigned leads, in their own country.
DROP POLICY IF EXISTS "leads_agent_own_assignments" ON public.leads;
CREATE POLICY "leads_agent_own_assignments"
  ON public.leads FOR SELECT TO authenticated
  USING (
    (SELECT auth.jwt() ->> 'user_role') = 'agent'
    AND assigned_to = (SELECT auth.uid())
    AND (SELECT auth.jwt() ->> 'country_code') = country_code
  );

-- Agents update only their own leads (status, notes, contacted timestamps).
-- assigned_to is locked to themselves on WITH CHECK so an agent cannot
-- reassign a lead to anyone else.
DROP POLICY IF EXISTS "leads_agent_update_own" ON public.leads;
CREATE POLICY "leads_agent_update_own"
  ON public.leads FOR UPDATE TO authenticated
  USING (
    (SELECT auth.jwt() ->> 'user_role') = 'agent'
    AND assigned_to = (SELECT auth.uid())
    AND (SELECT auth.jwt() ->> 'country_code') = country_code
  )
  WITH CHECK (
    assigned_to = (SELECT auth.uid())
    AND (SELECT auth.jwt() ->> 'country_code') = country_code
  );

-- 10. RLS policies on lead_events — symmetric with leads (uses the
--     denormalised country_code column instead of joining).

DROP POLICY IF EXISTS "lead_events_hq_admin_all" ON public.lead_events;
CREATE POLICY "lead_events_hq_admin_all"
  ON public.lead_events FOR ALL TO authenticated
  USING ((SELECT auth.jwt() ->> 'user_role') = 'hq_admin')
  WITH CHECK ((SELECT auth.jwt() ->> 'user_role') = 'hq_admin');

DROP POLICY IF EXISTS "lead_events_country_admin_scoped" ON public.lead_events;
CREATE POLICY "lead_events_country_admin_scoped"
  ON public.lead_events FOR ALL TO authenticated
  USING (
    (SELECT auth.jwt() ->> 'user_role') = 'country_admin'
    AND (SELECT auth.jwt() ->> 'country_code') = country_code
  )
  WITH CHECK (
    (SELECT auth.jwt() ->> 'user_role') = 'country_admin'
    AND (SELECT auth.jwt() ->> 'country_code') = country_code
  );

-- Agents see events on leads assigned to them, in their own country.
DROP POLICY IF EXISTS "lead_events_agent_own_leads" ON public.lead_events;
CREATE POLICY "lead_events_agent_own_leads"
  ON public.lead_events FOR SELECT TO authenticated
  USING (
    (SELECT auth.jwt() ->> 'user_role') = 'agent'
    AND (SELECT auth.jwt() ->> 'country_code') = country_code
    AND lead_id IN (
      SELECT id FROM public.leads
      WHERE assigned_to = (SELECT auth.uid())
    )
  );

-- Agents append events on their own leads. actor_id locked to self.
DROP POLICY IF EXISTS "lead_events_agent_insert_own" ON public.lead_events;
CREATE POLICY "lead_events_agent_insert_own"
  ON public.lead_events FOR INSERT TO authenticated
  WITH CHECK (
    (SELECT auth.jwt() ->> 'user_role') = 'agent'
    AND actor_id = (SELECT auth.uid())
    AND (SELECT auth.jwt() ->> 'country_code') = country_code
    AND lead_id IN (
      SELECT id FROM public.leads
      WHERE assigned_to = (SELECT auth.uid())
    )
  );

-- 11. RLS policies on callbacks — country_code is already denormalised per PRD.

DROP POLICY IF EXISTS "callbacks_hq_admin_all" ON public.callbacks;
CREATE POLICY "callbacks_hq_admin_all"
  ON public.callbacks FOR ALL TO authenticated
  USING ((SELECT auth.jwt() ->> 'user_role') = 'hq_admin')
  WITH CHECK ((SELECT auth.jwt() ->> 'user_role') = 'hq_admin');

DROP POLICY IF EXISTS "callbacks_country_admin_scoped" ON public.callbacks;
CREATE POLICY "callbacks_country_admin_scoped"
  ON public.callbacks FOR ALL TO authenticated
  USING (
    (SELECT auth.jwt() ->> 'user_role') = 'country_admin'
    AND (SELECT auth.jwt() ->> 'country_code') = country_code
  )
  WITH CHECK (
    (SELECT auth.jwt() ->> 'user_role') = 'country_admin'
    AND (SELECT auth.jwt() ->> 'country_code') = country_code
  );

-- Agents see + manage callbacks assigned to them, in their own country.
DROP POLICY IF EXISTS "callbacks_agent_own" ON public.callbacks;
CREATE POLICY "callbacks_agent_own"
  ON public.callbacks FOR ALL TO authenticated
  USING (
    (SELECT auth.jwt() ->> 'user_role') = 'agent'
    AND assigned_to = (SELECT auth.uid())
    AND (SELECT auth.jwt() ->> 'country_code') = country_code
  )
  WITH CHECK (
    (SELECT auth.jwt() ->> 'user_role') = 'agent'
    AND assigned_to = (SELECT auth.uid())
    AND (SELECT auth.jwt() ->> 'country_code') = country_code
  );
