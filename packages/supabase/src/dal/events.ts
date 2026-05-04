import 'server-only';

// RLS BYPASS: createAdminClient() authenticates as the service_role
// Postgres role, bypassing ALL Row Level Security on every table and view.
// Phase 3 (call outcomes) uses this to insert lead_events on behalf of
// agents whose JWT-side INSERT path is fine for normal events but needs the
// bypass for system-emitted events (e.g. assignment, status_change from RPCs).
import { createAdminClient } from '../admin';
import type { Database } from '../types/database';

/**
 * Discriminated event types accepted by `lead_events.type` (matches the
 * `event_type` Postgres enum in migration 00005).
 */
export type LeadEventType = Database['public']['Enums']['event_type'];

export interface AppendEventInput {
  lead_id: string;
  actor_id: string | null;
  type: LeadEventType;
  payload?: Record<string, unknown>;
}

/**
 * Append a row to `lead_events`. `country_code` is denormalised from the
 * parent lead by the BEFORE INSERT trigger shipped in migration 00005, so
 * callers never set it.
 *
 * Used by Phase 3 (call outcomes, status changes from the agent UI) and by
 * future system-emitted events. Phase 2's webhook ingest path does NOT call
 * this — `ingest_lead` already logs the `created` and `assigned` events
 * inside the RPC.
 */
export async function appendEvent(input: AppendEventInput): Promise<void> {
  const supabase = createAdminClient();
  const { error } = await supabase.from('lead_events').insert({
    lead_id: input.lead_id,
    actor_id: input.actor_id,
    type: input.type,
    payload: input.payload ?? {},
    // country_code is set by the BEFORE INSERT trigger; passing NULL is fine.
    country_code: null as unknown as string,
  });

  if (error) {
    throw new Error(`appendEvent failed: ${error.message}`);
  }
}
