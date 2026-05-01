// Re-export of the RBAC primitives. The single source of truth lives at
// packages/supabase/src/types.ts (consumed directly by middleware.ts).
// This barrel exists so consumers can import from @repo/supabase/types and
// stay agnostic about file layout.

export {
  APP_ROLES,
  ACTIVE_COUNTRY_CODES,
  COMING_SOON_COUNTRY_CODES,
  ALL_COUNTRY_CODES,
  isActiveCountrySlug,
  isCountrySlug,
  countryCodeToSlug,
  slugToCountryCode,
} from '../types';

export type {
  AppRole,
  ActiveCountryCode,
  ComingSoonCountryCode,
  CountryCode,
  CountrySlug,
  UserClaims,
  UserRoleRow,
} from '../types';

// Generated Database type — auto-rebuilt from Supabase Postgres schema.
// Used by Phase 2+ DAL + route handlers for typed table reads/writes.
export type { Database, Json, Tables, TablesInsert, TablesUpdate, Enums, CompositeTypes } from './database';
export { Constants } from './database';
