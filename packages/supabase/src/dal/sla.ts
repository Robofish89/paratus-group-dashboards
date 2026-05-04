import 'server-only';

// RLS BYPASS: createAdminClient() uses the service_role key. The cron route is
// the only consumer; both `v_sla_breaches` and `mark_sla_alerted` are
// service_role-only at the SQL layer (00014). We use the admin client because
// the cron has no cookie session — it's invoked by Vercel's scheduler with a
// bearer secret, not a user.
import { createAdminClient } from '../admin';
import type { Database } from '../types/database';

/**
 * One row of `v_sla_breaches`. Mirrors the migration 00014 view shape; the
 * non-null assertions reflect the SQL contract — every breach row has these
 * fields populated (the view's WHERE clause guarantees `id` and the leads
 * table guarantees `country_code` + `submitted_at`). `email` and `phone` are
 * truly nullable on `leads`, so we keep them nullable here too.
 */
export interface BreachLead {
  id: string;
  country_code: string;
  assigned_to: string | null;
  email: string | null;
  phone: string | null;
  full_name: string | null;
  submitted_at: string;
  age_seconds: number;
}

type BreachRow = Database['public']['Views']['v_sla_breaches']['Row'];

/**
 * Read every open SLA breach. The cron route invokes this once per minute; the
 * partial index `leads_sla_pending_idx` (00014) keeps it cheap as production
 * volume grows. Returns an empty array when there are no breaches — the route
 * short-circuits accordingly.
 */
export async function getOpenBreaches(): Promise<BreachLead[]> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from('v_sla_breaches')
    .select(
      'id, country_code, assigned_to, email, phone, full_name, submitted_at, age_seconds',
    );
  if (error) {
    throw new Error(`getOpenBreaches failed: ${error.message}`);
  }
  return (data ?? []).map(coerceBreach);
}

/**
 * Set `leads.sla_breach_alerted_at = now()` for the given lead. Idempotent at
 * the SQL layer (a second call simply re-stamps the column). The cron only
 * calls this AFTER every recipient for the breach has been emailed — partial
 * failure leaves the column NULL so the next minute retries the same lead.
 */
export async function markBreachAlerted(leadId: string): Promise<void> {
  const admin = createAdminClient();
  const { error } = await admin.rpc('mark_sla_alerted', { p_lead_id: leadId });
  if (error) {
    throw new Error(`markBreachAlerted(${leadId}) failed: ${error.message}`);
  }
}

function coerceBreach(row: BreachRow): BreachLead {
  // The generated view types mark every column as nullable (Postgres views
  // can't infer NOT NULL through projections). Narrow at the boundary so the
  // rest of the pipeline can treat `id`/`country_code`/`submitted_at`/
  // `age_seconds` as required.
  if (
    row.id == null ||
    row.country_code == null ||
    row.submitted_at == null ||
    row.age_seconds == null
  ) {
    throw new Error(
      `v_sla_breaches row missing required columns: ${JSON.stringify(row)}`,
    );
  }
  return {
    id: row.id,
    country_code: row.country_code,
    assigned_to: row.assigned_to ?? null,
    email: row.email ?? null,
    phone: row.phone ?? null,
    full_name: row.full_name ?? null,
    submitted_at: row.submitted_at,
    age_seconds: row.age_seconds,
  };
}
