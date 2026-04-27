// Paratus Group RBAC primitives — single source of truth for role + country
// enums shared by middleware, DAL, route layouts, and Zod schemas.
//
// Mirrors the Postgres enums declared in
// packages/supabase/migrations/00001_rbac_schema.sql. Keep these in sync —
// a mismatch silently breaks RLS or middleware.

/** Three-role hierarchy used across middleware and DAL. */
export type AppRole = 'hq_admin' | 'country_admin' | 'agent';

/** All app roles as a const tuple — handy for Zod enums. */
export const APP_ROLES = ['hq_admin', 'country_admin', 'agent'] as const;

/**
 * The 12 active Paratus markets at v1 launch. ISO 3166-1 alpha-2.
 * Routing for these countries is live; data ingestion is enabled.
 */
export const ACTIVE_COUNTRY_CODES = [
  'AO', 'BW', 'CD', 'SZ', 'KE', 'MZ', 'NA', 'RW', 'ZA', 'TZ', 'UG', 'ZM',
] as const;

/**
 * Coming-soon countries — present in the data model so a single UPDATE flips
 * them on, but their dashboards 404 until activation.
 */
export const COMING_SOON_COUNTRY_CODES = ['LS', 'MW', 'ZW'] as const;

/** All ISO codes the data model knows about (active + coming-soon). */
export const ALL_COUNTRY_CODES = [
  ...ACTIVE_COUNTRY_CODES,
  ...COMING_SOON_COUNTRY_CODES,
] as const;

export type ActiveCountryCode = (typeof ACTIVE_COUNTRY_CODES)[number];
export type ComingSoonCountryCode = (typeof COMING_SOON_COUNTRY_CODES)[number];
export type CountryCode = (typeof ALL_COUNTRY_CODES)[number];

/** Lower-cased URL slugs for ISO codes — used everywhere routes are built. */
export type CountrySlug = Lowercase<CountryCode>;

const ACTIVE_SLUG_SET = new Set<string>(
  ACTIVE_COUNTRY_CODES.map((c) => c.toLowerCase()),
);
const ALL_SLUG_SET = new Set<string>(
  ALL_COUNTRY_CODES.map((c) => c.toLowerCase()),
);

/** Type guard: is the URL segment one of the 12 active country slugs? */
export function isActiveCountrySlug(slug: string): slug is Lowercase<ActiveCountryCode> {
  return ACTIVE_SLUG_SET.has(slug);
}

/** Type guard: is the URL segment any known country slug (active + coming-soon)? */
export function isCountrySlug(slug: string): slug is CountrySlug {
  return ALL_SLUG_SET.has(slug);
}

/** Convert a JWT claim country_code (e.g. "MZ") to its URL slug ("mz"). */
export function countryCodeToSlug(code: CountryCode): CountrySlug {
  return code.toLowerCase() as CountrySlug;
}

/** Convert a URL slug ("mz") back to its ISO country_code ("MZ"). */
export function slugToCountryCode(slug: CountrySlug): CountryCode {
  return slug.toUpperCase() as CountryCode;
}

/**
 * Claims injected by `public.custom_access_token_hook` into every access
 * token. Decoded by middleware and route layouts to make routing decisions.
 */
export interface UserClaims {
  user_role: AppRole | null;
  country_code: CountryCode | null;
  user_active: boolean;
}

/** Minimal `user_roles` row shape used by the DAL and admin flows. */
export interface UserRoleRow {
  id: string;
  user_id: string;
  role: AppRole;
  country_code: CountryCode | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}
