import 'server-only';

// All country-admin reads/writes run against the server cookie client (RLS in
// force) — never service-role. The four views (security_invoker = true) and
// four RPCs (SECURITY DEFINER, EXECUTE granted to authenticated only) from
// migration 00011 already gate by the caller's JWT — country_code claim for
// country admins, role='hq_admin' bypass for HQ. The cookie client carrying
// the admin's JWT is the right authority for every operation in this file.
import { createClient } from '../server';
import type {
  AgentPerformanceRow,
  ReassignLeadInput,
  SpeedToLeadDay,
} from '../schemas/country';
import type { Database } from '../types/database';

type CountryTodayStatsRow = Database['public']['Views']['country_today_stats']['Row'];
type LeadsByServiceTodayRow = Database['public']['Views']['leads_by_service_today']['Row'];
type StatusPipelineTodayRow = Database['public']['Views']['status_pipeline_today']['Row'];
type CountrySpeedToLeadTodayRow = Database['public']['Views']['country_speed_to_lead_today']['Row'];
type CountryStatsInRangeRpcRow = Database['public']['Functions']['country_stats_in_range']['Returns'][number];

export type CountryTodayStats = CountryTodayStatsRow;
export type LeadsByServiceTodayItem = LeadsByServiceTodayRow;
export type StatusPipelineTodayItem = StatusPipelineTodayRow;
export type CountrySpeedToLeadToday = CountrySpeedToLeadTodayRow;
export type CountryStatsInRange = CountryStatsInRangeRpcRow;

/**
 * One row per active agent in a country (drives the reassign-dialog
 * dropdown). LEFT-joined-from-anchor pattern is enforced by RLS — country
 * admins see only their own country's agents.
 */
export interface CountryAgent {
  user_id: string;
  display_name: string | null;
}

// ─── Errors ────────────────────────────────────────────────────────────────

/**
 * Maps Postgres error codes from `reassign_lead` to typed errors so route
 * handlers can branch without string-matching.
 *   42501 → ForbiddenError  (forbidden_role, forbidden_country, cross_country_assignment)
 *   P0002 → NotFoundError   (lead or target agent missing)
 */
export class ForbiddenError extends Error {
  readonly code = 'forbidden';
  constructor(message: string) {
    super(message);
    this.name = 'ForbiddenError';
  }
}

export class NotFoundError extends Error {
  readonly code = 'not_found';
  constructor(message: string) {
    super(message);
    this.name = 'NotFoundError';
  }
}

// ─── Reads ─────────────────────────────────────────────────────────────────

/**
 * Live KPI strip — one row per country with today + yesterday counts for
 * total / new / contacted / converted / lost. RLS hides other countries'
 * rows for country admins; HQ sees the full set. Returns `null` if the view
 * has no row for the country (defensive — the view is anchored on
 * `countries`, so this should not happen for active countries).
 */
export async function getCountryTodayStats(
  country_code: string,
): Promise<CountryTodayStats | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('country_today_stats')
    .select('*')
    .eq('country_code', country_code)
    .maybeSingle();

  if (error) {
    throw new Error(`getCountryTodayStats failed: ${error.message}`);
  }
  return data;
}

/**
 * Range-aware status counts (converted / lost / contacted / new). country_admin
 * is JWT-pinned to their own country; the RPC raises `forbidden_country` (42501)
 * for cross-country queries. HQ is permitted any country.
 */
export async function getCountryStatsInRange(
  country_code: string,
  from: string,
  to: string,
): Promise<CountryStatsInRange | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('country_stats_in_range', {
    p_country: country_code,
    p_from: from,
    p_to: to,
  });

  if (error) {
    throw new Error(`country_stats_in_range RPC failed: ${error.message}`);
  }
  // RPC returns TABLE — supabase-js surfaces it as an array (length 1).
  const rows = (data ?? []) as CountryStatsInRange[];
  return rows[0] ?? null;
}

/**
 * Today's leads broken down by `form_slug`. Sorted DESC at the view layer.
 * Drives the leads-by-service horizontal bar chart.
 */
export async function getLeadsByServiceToday(
  country_code: string,
): Promise<LeadsByServiceTodayItem[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('leads_by_service_today')
    .select('*')
    .eq('country_code', country_code)
    .order('leads_count', { ascending: false });

  if (error) {
    throw new Error(`getLeadsByServiceToday failed: ${error.message}`);
  }
  return data ?? [];
}

/**
 * Today's status pipeline — one row per `lead_status` enum value (5 rows
 * including `qualified`, kept for analytics back-compat per plan 04-01).
 * Drives the funnel.
 */
export async function getStatusPipelineToday(
  country_code: string,
): Promise<StatusPipelineTodayItem[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('status_pipeline_today')
    .select('*')
    .eq('country_code', country_code);

  if (error) {
    throw new Error(`getStatusPipelineToday failed: ${error.message}`);
  }
  return data ?? [];
}

/**
 * Today's speed-to-lead gauge tile (total_contacted, on_target_count,
 * on_target_pct, avg_response_seconds). Aggregates only over leads where
 * `first_contacted_at IS NOT NULL` — see plan 04-01 NULL policy.
 */
export async function getCountrySpeedToLeadToday(
  country_code: string,
): Promise<CountrySpeedToLeadToday | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('country_speed_to_lead_today')
    .select('*')
    .eq('country_code', country_code)
    .maybeSingle();

  if (error) {
    throw new Error(`getCountrySpeedToLeadToday failed: ${error.message}`);
  }
  return data;
}

/**
 * Per-agent performance for a [from, to) window. LEFT-joined from
 * `user_roles WHERE role='agent'` — every active agent gets a row even with
 * zero work in the window (plan 04-01 fix in commit aaba26e).
 */
export async function getAgentPerformanceInRange(
  country_code: string,
  from: string,
  to: string,
): Promise<AgentPerformanceRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('agent_performance_in_range', {
    p_country: country_code,
    p_from: from,
    p_to: to,
  });

  if (error) {
    throw new Error(`agent_performance_in_range RPC failed: ${error.message}`);
  }
  return (data ?? []) as AgentPerformanceRow[];
}

/**
 * Per-day median + P75 seconds-to-first-contact across the [from, to)
 * window. Drives the speed-to-lead 7-day sparkline.
 */
export async function getSpeedToLeadSeries(
  country_code: string,
  from: string,
  to: string,
): Promise<SpeedToLeadDay[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('speed_to_lead_series', {
    p_country: country_code,
    p_from: from,
    p_to: to,
  });

  if (error) {
    throw new Error(`speed_to_lead_series RPC failed: ${error.message}`);
  }
  return (data ?? []) as SpeedToLeadDay[];
}

/**
 * Active agents in a country, sorted by display name. Drives the
 * reassign-dialog dropdown in plan 04-03.
 */
export async function getCountryAgents(
  country_code: string,
): Promise<CountryAgent[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('user_roles')
    .select('user_id, display_name')
    .eq('role', 'agent')
    .eq('country_code', country_code)
    .eq('is_active', true)
    .order('display_name', { ascending: true });

  if (error) {
    throw new Error(`getCountryAgents failed: ${error.message}`);
  }
  return data ?? [];
}

// ─── Writes ────────────────────────────────────────────────────────────────

/**
 * Calls the `reassign_lead` RPC. SECURITY DEFINER; the function checks role
 * (`country_admin` | `hq_admin`), country scope (jwt.country_code matches
 * the lead's), and the cross-country target guard internally. Maps Postgres
 * error codes to typed errors so route handlers can branch:
 *   - 42501 → ForbiddenError
 *   - P0002 → NotFoundError
 *
 * Atomicity (lead `assigned_to` update + `lead_events(type='reassigned')`
 * insert) is in the SQL function, not here.
 */
export async function reassignLead(input: ReassignLeadInput): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase.rpc('reassign_lead', {
    p_lead_id: input.lead_id,
    p_to_agent_id: input.to_agent_id,
  });

  if (error) {
    if (error.code === '42501') {
      throw new ForbiddenError(error.message);
    }
    if (error.code === 'P0002') {
      throw new NotFoundError(error.message);
    }
    throw new Error(`reassign_lead RPC failed: ${error.message}`);
  }
}
