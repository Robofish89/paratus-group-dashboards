import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Phase 2 integration test helpers.
 *
 * Three test users are seeded in the live Supabase project (see CREDENTIALS.md
 * + 01-02 SUMMARY); their passwords are NOT in env. The technique is the same
 * one plan 02-05's CSV smoke script used: a service-role admin generates a
 * magiclink, the anon client redeems the token_hash via verifyOtp, returning
 * a real session — JWT custom claims hook fires, all RLS policies see the
 * authentic role + country_code claims.
 */

export const TEST_USERS = {
  hqAdmin: "para.group.n8n+hq@gmail.com",
  countryAdminMz: "para.group.n8n+country-admin@gmail.com",
  agentMz: "para.group.n8n+agent@gmail.com",
} as const;

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing ${name} — run tests from apps/web with .env.local present`);
  return v;
}

export function getSupabaseUrl(): string {
  return requireEnv("NEXT_PUBLIC_SUPABASE_URL");
}

export function getAnonKey(): string {
  return requireEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY");
}

// RLS BYPASS: this returns the service_role key. Any client constructed with
// it (see createServiceClient below) bypasses every Row Level Security policy
// on every table and view. Test-only — used for seed/teardown, never on the
// assertion path.
export function getServiceRoleKey(): string {
  return requireEnv("SUPABASE_SERVICE_ROLE_KEY");
}

export function getIngestSecret(): string {
  return requireEnv("PARATUS_INGEST_SECRET");
}

export function getIngestUrl(): string {
  return process.env.INGEST_TEST_URL ?? "http://localhost:3012/api/leads/ingest";
}

// RLS BYPASS: createServiceClient() authenticates with the service_role key,
// which bypasses ALL Row Level Security policies on every table and view.
// Used here only for test setup/teardown (seeding leads, resetting fairness
// state, generating magiclinks for the test users) — never on the assertion
// path. Cross-tenant assertions ALWAYS run through createAnonClient() +
// signInAs() so RLS is the thing under test, not the thing under bypass.
export function createServiceClient(): SupabaseClient {
  return createClient(getSupabaseUrl(), getServiceRoleKey(), {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

export function createAnonClient(): SupabaseClient {
  return createClient(getSupabaseUrl(), getAnonKey(), {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

/**
 * Sign a fresh anon client in as `email` by minting a magiclink with the
 * service-role admin and redeeming the token_hash via verifyOtp. Returns a
 * client whose Authorization header now carries the user's access_token
 * (RLS policies will see their custom claims).
 */
export async function signInAs(email: string): Promise<SupabaseClient> {
  const admin = createServiceClient();
  const { data, error } = await admin.auth.admin.generateLink({
    type: "magiclink",
    email,
  });
  if (error) throw new Error(`generateLink(${email}) failed: ${error.message}`);
  const tokenHash = data?.properties?.hashed_token;
  if (!tokenHash) throw new Error(`generateLink(${email}) returned no hashed_token`);

  const client = createAnonClient();
  const { error: verifyErr } = await client.auth.verifyOtp({
    type: "magiclink",
    token_hash: tokenHash,
  });
  if (verifyErr) throw new Error(`verifyOtp(${email}) failed: ${verifyErr.message}`);

  return client;
}

/**
 * Look up a user's id by email via service-role.
 */
export async function getUserId(email: string): Promise<string> {
  const admin = createServiceClient();
  const { data, error } = await admin.auth.admin.listUsers({ page: 1, perPage: 200 });
  if (error) throw new Error(`listUsers failed: ${error.message}`);
  const u = data.users.find((x) => x.email === email);
  if (!u) throw new Error(`user not found: ${email}`);
  return u.id;
}

export function getDevServerUrl(): string {
  return process.env.DEV_SERVER_URL ?? "http://localhost:3012";
}

/**
 * Acquire a Cookie header for the given test user by hitting the dev-server's
 * `/api/e2e-login` bridge. Requires the dev server to be running with
 * `E2E_AUTH_ENABLED=true` (same precondition the playwright e2e suite uses —
 * see playwright.config.ts).
 *
 * Throws a helpful error if the bridge is disabled (404 or middleware
 * redirect to /login) so an operator can see exactly what flag to flip.
 */
export async function signInViaBridge(email: string): Promise<string> {
  const baseUrl = getDevServerUrl();
  const res = await fetch(`${baseUrl}/api/e2e-login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email }),
    redirect: "manual",
  });
  if (res.status === 307 || res.status === 302) {
    throw new Error(
      `signInViaBridge: dev server redirected (status ${res.status}). ` +
        `Restart the dev server with E2E_AUTH_ENABLED=true (apps/web/.env.local) ` +
        `before running route-handler tests.`,
    );
  }
  if (res.status === 404) {
    throw new Error(
      `signInViaBridge: /api/e2e-login returned 404. ` +
        `Set E2E_AUTH_ENABLED=true in apps/web/.env.local and restart the dev server.`,
    );
  }
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`signInViaBridge(${email}) failed: ${res.status} ${body}`);
  }
  // Collect every Set-Cookie header (Next sets multiple sb-... chunks).
  const setCookies = res.headers.getSetCookie?.() ?? [];
  if (setCookies.length === 0) {
    throw new Error(
      `signInViaBridge(${email}) succeeded but returned no Set-Cookie headers`,
    );
  }
  // Convert "name=value; Path=/; ..." → "name=value", join into a Cookie header.
  const cookiePairs = setCookies.map((sc) => sc.split(";")[0]!.trim());
  return cookiePairs.join("; ");
}
