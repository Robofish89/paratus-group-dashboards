/**
 * Service role client for admin operations.
 *
 * NEVER import this in client code or NEXT_PUBLIC_ contexts.
 * This client bypasses Row Level Security and has full database access.
 * Used ONLY in the admin app for user creation/deactivation.
 */
import 'server-only';

import { createClient as createSupabaseClient } from '@supabase/supabase-js';

/**
 * Creates a Supabase admin client using the service_role key.
 * This bypasses RLS — use only for privileged admin operations.
 */
export function createAdminClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error(
      'Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY. ' +
        'Ensure these are set in server-only environment variables.'
    );
  }

  // RLS BYPASS: service_role key gives full database access without RLS.
  // Required for admin operations: user creation, role assignment, deactivation.
  // This client must ONLY be used in server-side admin app code paths.
  return createSupabaseClient(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}
