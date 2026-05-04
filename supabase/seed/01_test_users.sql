-- ───────────────────────────────────────────────────────────────────────────
-- Hermetic vitest seed — test users (plan 06-05 task 1)
--
-- Creates the four Phase 1+ test users and their public.user_roles rows.
-- Idempotent (`ON CONFLICT DO NOTHING`) so `supabase db reset` can be run
-- repeatedly without errors.
--
-- Cloud project (`tgswsdfaszvztbpczfve`) is unaffected — this file is only
-- read by `supabase start` against the local stack.
--
-- Email addresses match apps/web/test-support/helpers.ts → TEST_USERS.
-- The fourth (BW country admin) was flagged by 06-02 SUMMARY as a future
-- seed for cross-country negative tests — added here so cross-tenant
-- specs can run hermetically without an external setup script.
--
-- Passwords are NOT used by the integration tests (which authenticate via
-- the magiclink-cookie technique in helpers.ts). They are set anyway so a
-- developer can sign in via the Studio UI for manual debugging.
-- ───────────────────────────────────────────────────────────────────────────

-- 1. HQ admin
INSERT INTO auth.users (
  instance_id, id, aud, role, email,
  encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data,
  created_at, updated_at, is_anonymous
)
VALUES (
  '00000000-0000-0000-0000-000000000000',
  '11111111-1111-1111-1111-111111111111',
  'authenticated', 'authenticated',
  'para.group.n8n+hq@gmail.com',
  crypt('test-only-do-not-use', gen_salt('bf')),
  now(),
  '{"provider":"email","providers":["email"]}', '{}',
  now(), now(), false
)
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.user_roles (user_id, role, country_code, is_active)
VALUES ('11111111-1111-1111-1111-111111111111', 'hq_admin', NULL, true)
ON CONFLICT (user_id) DO NOTHING;

-- 2. Country admin (Mozambique)
INSERT INTO auth.users (
  instance_id, id, aud, role, email,
  encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data,
  created_at, updated_at, is_anonymous
)
VALUES (
  '00000000-0000-0000-0000-000000000000',
  '22222222-2222-2222-2222-222222222222',
  'authenticated', 'authenticated',
  'para.group.n8n+country-admin@gmail.com',
  crypt('test-only-do-not-use', gen_salt('bf')),
  now(),
  '{"provider":"email","providers":["email"]}', '{}',
  now(), now(), false
)
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.user_roles (user_id, role, country_code, is_active)
VALUES ('22222222-2222-2222-2222-222222222222', 'country_admin', 'MZ', true)
ON CONFLICT (user_id) DO NOTHING;

-- 3. Agent (Mozambique)
INSERT INTO auth.users (
  instance_id, id, aud, role, email,
  encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data,
  created_at, updated_at, is_anonymous
)
VALUES (
  '00000000-0000-0000-0000-000000000000',
  '33333333-3333-3333-3333-333333333333',
  'authenticated', 'authenticated',
  'para.group.n8n+agent@gmail.com',
  crypt('test-only-do-not-use', gen_salt('bf')),
  now(),
  '{"provider":"email","providers":["email"]}', '{}',
  now(), now(), false
)
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.user_roles (user_id, role, country_code, is_active)
VALUES ('33333333-3333-3333-3333-333333333333', 'agent', 'MZ', true)
ON CONFLICT (user_id) DO NOTHING;

-- 4. Country admin (Botswana) — closes the 06-02 SUMMARY carry-over
--    ("future BW-admin seed for cross-country negative tests").
INSERT INTO auth.users (
  instance_id, id, aud, role, email,
  encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data,
  created_at, updated_at, is_anonymous
)
VALUES (
  '00000000-0000-0000-0000-000000000000',
  '44444444-4444-4444-4444-444444444444',
  'authenticated', 'authenticated',
  'para.group.n8n+country-admin-bw@gmail.com',
  crypt('test-only-do-not-use', gen_salt('bf')),
  now(),
  '{"provider":"email","providers":["email"]}', '{}',
  now(), now(), false
)
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.user_roles (user_id, role, country_code, is_active)
VALUES ('44444444-4444-4444-4444-444444444444', 'country_admin', 'BW', true)
ON CONFLICT (user_id) DO NOTHING;
