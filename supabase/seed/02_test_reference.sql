-- ───────────────────────────────────────────────────────────────────────────
-- Hermetic vitest seed — reference-data sanity check (plan 06-05 task 1)
--
-- Migration 00004_reference_data.sql already seeds the 12 active + 3
-- coming-soon countries and the 10 form/service types (idempotent
-- `ON CONFLICT DO NOTHING`). This file exists to fail loudly if a future
-- migration accidentally drops or renames those rows — the integration
-- tests assume both tables are populated.
-- ───────────────────────────────────────────────────────────────────────────

DO $$
DECLARE
  v_country_count integer;
  v_form_count integer;
BEGIN
  SELECT count(*) INTO v_country_count FROM public.countries;
  IF v_country_count < 12 THEN
    RAISE EXCEPTION
      'seed sanity: expected at least 12 countries, found %', v_country_count;
  END IF;

  SELECT count(*) INTO v_form_count FROM public.forms;
  IF v_form_count < 10 THEN
    RAISE EXCEPTION
      'seed sanity: expected at least 10 forms, found %', v_form_count;
  END IF;
END $$;
