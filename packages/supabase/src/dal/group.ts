import 'server-only';

// All HQ overview reads run against the server cookie client (RLS in force)
// — never service-role. The three views (security_invoker = true) and the
// RPC (SECURITY DEFINER, hq_admin-only) from migration 00013 already gate by
// the caller's JWT — `user_role='hq_admin'` for the RPC and the route layer
// at apps/web/app/(hq)/layout.tsx for the views. The cookie client carrying
// the admin's JWT is the right authority for every operation in this file.
import { createClient } from '../server';
import {
  groupSpeedToLeadSeriesInput,
  computeResponseStatus,
  RESPONSE_STATUS_THRESHOLDS,
  type GroupTodayStats,
  type CountryPerformanceRow,
  type LeadsByServiceGroupRow,
  type GroupSpeedToLeadDay,
  type ResponseStatus,
} from '../schemas/group';
import type { Database } from '../types/database';

// Pull row types from the regenerated 00013 types so the DAL stays in lockstep
// with the SQL surface. Schemas above provide the runtime validation shape.
type GroupTodayStatsRow = Database['public']['Views']['group_today_stats']['Row'];
type CountryPerformanceTodayRow =
  Database['public']['Views']['country_performance_today']['Row'];
type LeadsByServiceGroupViewRow =
  Database['public']['Views']['leads_by_service_group']['Row'];
type GroupSpeedToLeadSeriesRow =
  Database['public']['Functions']['group_speed_to_lead_series']['Returns'][number];

// Re-export the public-facing types + status helper. The helper itself is a
// pure function defined in `../schemas/group.ts` (no `server-only` boundary)
// so client components can import it directly from `@repo/supabase/schemas`.
// Re-exporting here keeps the DAL barrel as the one-stop shop for everything
// HQ overview-related on the server side.
export {
  computeResponseStatus,
  RESPONSE_STATUS_THRESHOLDS,
};
export type {
  GroupTodayStats,
  CountryPerformanceRow,
  LeadsByServiceGroupRow,
  GroupSpeedToLeadDay,
  ResponseStatus,
};

// ─── Reads ─────────────────────────────────────────────────────────────────

/**
 * Group-wide today stats — 1 row from `group_today_stats`. Powers the HQ
 * KPI strip (active countries, total leads, new today, conversion rate,
 * avg speed to lead). RLS hides nothing for hq_admin; country admins technically
 * see a country-scoped sum here but the route layer
 * (`(hq)/layout.tsx requireRole(['hq_admin'])`) blocks them at the UI.
 */
export async function getGroupTodayStats(): Promise<GroupTodayStats> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('group_today_stats')
    .select('*')
    .single();

  if (error) {
    throw new Error(`getGroupTodayStats failed: ${error.message}`);
  }
  return data as GroupTodayStatsRow as GroupTodayStats;
}

/**
 * One row per active country from `country_performance_today`, already
 * ordered by `total_leads DESC` at the view layer (preserved by supabase-js).
 * Drives the HQ country leaderboard.
 */
export async function getCountryPerformanceToday(): Promise<
  CountryPerformanceRow[]
> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('country_performance_today')
    .select('*');

  if (error) {
    throw new Error(`getCountryPerformanceToday failed: ${error.message}`);
  }
  return (data ?? []) as CountryPerformanceTodayRow[] as CountryPerformanceRow[];
}

/**
 * Group-wide leads by `form_slug`, all-time — drives the HQ "Leads by
 * Service (Group)" horizontal-bar card. Ordered `leads_count DESC` at the
 * view layer.
 *
 * Diverges from `getLeadsByServiceToday()` (country-admin) which is
 * today-only per country. The mockup math only reconciles to all-time
 * totals.
 */
export async function getLeadsByServiceGroup(): Promise<
  LeadsByServiceGroupRow[]
> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('leads_by_service_group')
    .select('*');

  if (error) {
    throw new Error(`getLeadsByServiceGroup failed: ${error.message}`);
  }
  return (data ?? []) as LeadsByServiceGroupViewRow[] as LeadsByServiceGroupRow[];
}

/**
 * Per-day median + P75 seconds-to-first-contact across the last `p_days`
 * UTC days. Drives the HQ 7-day speed-to-lead trend.
 *
 * `p_days` is validated as a positive integer before the RPC call; a bad
 * value throws synchronously rather than wasting a Supabase round-trip.
 *
 * The RPC raises `forbidden_role` (Postgres error code 42501) for any caller
 * whose JWT custom claim `user_role !== 'hq_admin'` — country admins have
 * their own per-country `speed_to_lead_series` (00011).
 */
export async function getGroupSpeedToLeadSeries(
  p_days: number = 7,
): Promise<GroupSpeedToLeadDay[]> {
  groupSpeedToLeadSeriesInput.parse({ p_days });

  const supabase = await createClient();
  const { data, error } = await supabase.rpc('group_speed_to_lead_series', {
    p_days,
  });

  if (error) {
    throw new Error(`group_speed_to_lead_series RPC failed: ${error.message}`);
  }
  return (data ?? []) as GroupSpeedToLeadSeriesRow[] as GroupSpeedToLeadDay[];
}
