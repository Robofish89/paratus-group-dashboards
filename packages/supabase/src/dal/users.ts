import 'server-only';

import { createClient } from '../server';
// RLS BYPASS: createAdminClient() uses the service_role key and bypasses ALL
// Row Level Security. It is imported here ONLY for getUserRoleRow(), which
// runs during the login Server Action — at that moment the user is
// authenticated (signInWithPassword has just succeeded) but their JWT has
// not yet been re-issued with the custom claims, so an authenticated-client
// SELECT against user_roles would fail the RLS policy that requires either
// `auth.uid() = user_id` (works) OR `user_role = 'hq_admin'` (not yet in the
// JWT). We use the admin client to short-circuit that race. The function
// scopes its query by user_id, so no cross-tenant data leaks.
import { createAdminClient } from '../admin';
import type { AppRole, CountryCode, UserClaims, UserRoleRow } from '../types';

/**
 * Decode a base64url-encoded JWT segment without depending on Node's Buffer
 * type bleeding into client bundles. The middle segment is JSON.
 */
function decodeJwtPayload(token: string): Record<string, unknown> | null {
  const parts = token.split('.');
  if (parts.length < 2) return null;
  const payload = parts[1];
  if (!payload) return null;

  // base64url → base64 → utf-8 JSON
  const base64 = payload.replace(/-/g, '+').replace(/_/g, '/');
  const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, '=');

  try {
    const json =
      typeof globalThis.atob === 'function'
        ? globalThis.atob(padded)
        : Buffer.from(padded, 'base64').toString('utf-8');
    return JSON.parse(json) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function asAppRole(value: unknown): AppRole | null {
  return value === 'hq_admin' || value === 'country_admin' || value === 'agent'
    ? value
    : null;
}

function asCountryCode(value: unknown): CountryCode | null {
  if (typeof value !== 'string') return null;
  // Cheap allow-list check; the real source of truth is the Postgres enum.
  return value.length === 2 ? (value.toUpperCase() as CountryCode) : null;
}

/**
 * Read the current user's role/country claims from the access token issued
 * by Supabase Auth. Returns null when no session exists.
 *
 * Use this in Server Components and Route Handlers when you need claims;
 * use `requireUser` / `requireRole` from `apps/web/app/_lib/auth.ts` when
 * the claim absence should redirect.
 */
export async function getCurrentUserClaims(): Promise<UserClaims | null> {
  const supabase = await createClient();

  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session?.access_token) return null;

  const payload = decodeJwtPayload(session.access_token);
  if (!payload) return null;

  return {
    user_role: asAppRole(payload.user_role),
    country_code: asCountryCode(payload.country_code),
    user_active: payload.user_active !== false,
  };
}

/**
 * Look up a user_roles row by user_id using the service-role client. Used by
 * the login Server Action to compute the redirect target before the new
 * access token (with refreshed claims) has propagated to the SSR cookie.
 *
 * Server-only by transitive `import 'server-only'` in `../admin.js`.
 */
export async function getUserRoleRow(userId: string): Promise<UserRoleRow | null> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from('user_roles')
    .select('id, user_id, role, country_code, is_active, created_at, updated_at')
    .eq('user_id', userId)
    .maybeSingle();

  if (error || !data) return null;
  return data as UserRoleRow;
}

/**
 * Active country-admin email addresses for a country, used by the SLA cron to
 * pick recipients for breach alerts. Service-role read because the cron runs
 * with no cookie session (Vercel scheduler → bearer secret). Joins
 * `user_roles` filtered to `role='country_admin' AND country_code=$1 AND
 * is_active=true` against `auth.users` via the admin client. Returns an empty
 * array when no admins are seated in the country (the cron logs and skips).
 */
export async function getCountryAdminEmails(countryCode: string): Promise<string[]> {
  const admin = createAdminClient();
  const { data: roles, error: rolesErr } = await admin
    .from('user_roles')
    .select('user_id')
    .eq('role', 'country_admin')
    .eq('country_code', countryCode)
    .eq('is_active', true);

  if (rolesErr) {
    throw new Error(
      `getCountryAdminEmails(${countryCode}) user_roles read failed: ${rolesErr.message}`,
    );
  }
  if (!roles || roles.length === 0) return [];

  // No bulk "fetch users by id" in supabase-js admin API; listUsers + filter
  // is the documented technique. perPage=200 covers Phase 6 capacity (12
  // active countries × ~3 admins each = ~36 max).
  const { data: usersPage, error: usersErr } = await admin.auth.admin.listUsers({
    page: 1,
    perPage: 200,
  });
  if (usersErr) {
    throw new Error(
      `getCountryAdminEmails(${countryCode}) listUsers failed: ${usersErr.message}`,
    );
  }
  const wanted = new Set(roles.map((r) => r.user_id));
  return usersPage.users
    .filter((u) => wanted.has(u.id) && typeof u.email === 'string' && u.email.length > 0)
    .map((u) => u.email as string);
}

/**
 * Display name for an agent (drives the "Assigned to" line in SLA emails).
 * Returns `null` when the agent isn't seated or the row has no display_name.
 */
export async function getAgentDisplayName(userId: string): Promise<string | null> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from('user_roles')
    .select('display_name')
    .eq('user_id', userId)
    .maybeSingle();
  if (error || !data) return null;
  return (data.display_name as string | null) ?? null;
}

/**
 * Country name (e.g. 'Mozambique') for a country code. Used to render a
 * human-readable country label in SLA emails when the cron-side cache is
 * empty.
 */
export async function getCountryName(countryCode: string): Promise<string | null> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from('countries')
    .select('name')
    .eq('code', countryCode)
    .maybeSingle();
  if (error || !data) return null;
  return (data.name as string | null) ?? null;
}
