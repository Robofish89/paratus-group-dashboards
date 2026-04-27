import 'server-only';

import { createClient } from '../server.js';
// RLS BYPASS: createAdminClient() uses the service_role key and bypasses ALL
// Row Level Security. It is imported here ONLY for getUserRoleRow(), which
// runs during the login Server Action — at that moment the user is
// authenticated (signInWithPassword has just succeeded) but their JWT has
// not yet been re-issued with the custom claims, so an authenticated-client
// SELECT against user_roles would fail the RLS policy that requires either
// `auth.uid() = user_id` (works) OR `user_role = 'hq_admin'` (not yet in the
// JWT). We use the admin client to short-circuit that race. The function
// scopes its query by user_id, so no cross-tenant data leaks.
import { createAdminClient } from '../admin.js';
import type { AppRole, CountryCode, UserClaims, UserRoleRow } from '../types.js';

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
