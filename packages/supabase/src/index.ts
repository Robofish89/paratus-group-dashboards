// @repo/supabase — shared Supabase client utilities for Paratus Group.
//
// Prefer specific imports for tree-shaking + clear server/client boundaries:
//   import { createClient } from '@repo/supabase/client'
//   import { createClient } from '@repo/supabase/server'
//   import { createAdminClient } from '@repo/supabase/admin'
//   import { getCurrentUserClaims } from '@repo/supabase/dal'
//   import { loginSchema } from '@repo/supabase/schemas'
//   import {
//     ACTIVE_COUNTRY_CODES,
//     isActiveCountrySlug,
//     type AppRole,
//     type UserClaims,
//   } from '@repo/supabase/types'
//
// The barrel below only re-exports things that are safe in BOTH client and
// server contexts (pure types + the browser client factory). server, admin,
// dal, and schemas all import 'server-only' and must NOT be re-exported here.

export { createClient as createBrowserClient } from './client';

export {
  APP_ROLES,
  ACTIVE_COUNTRY_CODES,
  COMING_SOON_COUNTRY_CODES,
  ALL_COUNTRY_CODES,
  isActiveCountrySlug,
  isCountrySlug,
  countryCodeToSlug,
  slugToCountryCode,
} from './types/index';

export type {
  AppRole,
  ActiveCountryCode,
  ComingSoonCountryCode,
  CountryCode,
  CountrySlug,
  UserClaims,
  UserRoleRow,
} from './types/index';
