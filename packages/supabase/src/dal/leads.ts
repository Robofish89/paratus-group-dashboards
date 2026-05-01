import 'server-only';

// RLS BYPASS: createServiceRoleClient() authenticates as the service_role
// Postgres role, bypassing ALL Row Level Security on every table and view.
// Used here because `ingest_lead(jsonb)` has its EXECUTE grant restricted to
// service_role (REVOKE FROM public/anon/authenticated in migration 00007), so
// only a service-role client can call it. The webhook caller has already been
// authenticated by HMAC before this DAL is reached.
import { createServiceRoleClient } from '../server';
import type { IngestInput } from '../schemas/ingest';

/**
 * Result envelope returned by the `ingest_lead(jsonb)` Postgres RPC.
 *
 * Success path: { lead_id, agent_id (nullable when no recipient), duplicate }
 * Error path:   { error: <code>, ... } — e.g. unknown_country / unknown_form
 *
 * The RPC's typed signature (`Args: { payload: Json }`, `Returns: Json`)
 * landed in the generated `Database` type with the plan 03-01 regen, so we
 * no longer cast to `never` — the wrapper just narrows the Json return into
 * a discriminated union on the way out.
 */
export type IngestLeadSuccess = {
  lead_id: string;
  agent_id: string | null;
  duplicate: boolean;
};

export type IngestLeadError = {
  error: string;
  [key: string]: unknown;
};

export type IngestLeadResult = IngestLeadSuccess | IngestLeadError;

/**
 * Type guard discriminating success vs. error envelope from `ingest_lead`.
 */
export function isIngestLeadError(
  result: IngestLeadResult,
): result is IngestLeadError {
  return typeof (result as IngestLeadError).error === 'string';
}

/**
 * Thin wrapper around the `ingest_lead(payload jsonb)` RPC.
 *
 * The RPC is the single atomic entry point for lead creation: it validates
 * country/form, dedupes via the 5-minute bucket index, inserts the lead,
 * logs the `created` event, and calls `assign_lead` to round-robin a recipient.
 * Callers (webhook route handler, CSV importer) just hand it a Zod-validated
 * payload and surface the result.
 */
export async function ingestLead(input: IngestInput): Promise<IngestLeadResult> {
  const supabase = createServiceRoleClient();
  const { data, error } = await supabase.rpc('ingest_lead', {
    payload: input,
  });

  if (error) {
    throw new Error(`ingest_lead RPC failed: ${error.message}`);
  }

  return data as unknown as IngestLeadResult;
}
