import 'server-only';

import { createServerClient } from '@supabase/ssr';
import { createClient as createSupabaseClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';

/**
 * Creates a Supabase client for use in Server Components, Server Actions,
 * and Route Handlers. Uses httpOnly cookies for session management.
 *
 * Note: Cookie setting will silently fail in Server Components (read-only).
 * This is expected — cookies are set in Server Actions and Route Handlers.
 */
export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet: Array<{ name: string; value: string; options: Record<string, unknown> }>) {
          try {
            cookiesToSet.forEach(({ name, value, options }) => {
              cookieStore.set(name, value, options);
            });
          } catch {
            // setAll is called from Server Components where cookies
            // cannot be set. This can safely be ignored when the
            // middleware is refreshing sessions.
          }
        },
      },
    }
  );
}

/**
 * Creates a service-role Supabase client for routes that must bypass RLS —
 * webhook ingest, CSV import, scheduled jobs. Uses `SUPABASE_SERVICE_ROLE_KEY`
 * (never `NEXT_PUBLIC_*`).
 *
 * RLS BYPASS: this client bypasses every Row Level Security policy. Use only
 * in trusted server-side flows where the caller has already been authenticated
 * (e.g. HMAC-verified webhooks) or where the caller is the platform itself.
 *
 * Distinct from `createAdminClient()` in `admin.ts` only in name — same key,
 * same options. Phase 2 introduced this name to keep webhook code readable
 * (the route says what it's doing — not "admin", but "service role").
 */
// RLS BYPASS: returns a client authenticated with the service_role key, which
// bypasses ALL Row Level Security policies on every table and view. Required
// because the webhook ingest path is HMAC-authenticated (not user-authenticated)
// and the ingest_lead() RPC's EXECUTE grant is restricted to service_role.
export function createServiceRoleClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error(
      'Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY. ' +
        'Ensure these are set in server-only environment variables.'
    );
  }

  // RLS BYPASS: the service_role key authenticates as a privileged Postgres
  // role that bypasses ALL Row Level Security policies. Required here so the
  // webhook ingest path (which is HMAC-authenticated, not user-authenticated)
  // can call ingest_lead() — that RPC's EXECUTE grant is service_role-only.
  // Never expose this client to user-controlled code paths.
  return createSupabaseClient(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}
