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
  type CountryDirectoryRow,
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
  CountryDirectoryRow,
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

/**
 * HQ Countries directory — one row per Paratus market (12 active + 3
 * coming-soon), zipped from three RLS-respecting reads:
 *
 *   1. `countries` (15 rows: code, name, timezone, status)
 *   2. `country_performance_today` (12 active rows: lead metrics, all-time +
 *      today). Coming-soon countries are absent and zip to nulls.
 *   3. `user_roles` aggregated in JS for agent + country-admin head counts.
 *      RLS policy "HQ admins read all user_roles" (00001) gates this; for
 *      non-HQ callers the route layer (`(hq)/layout.tsx`) blocks before
 *      reaching this DAL.
 *
 * No new view/migration — the page is read-only and the join is small (15
 * countries × ~few-dozen role rows). Doing it in JS keeps the surface
 * surgical and avoids bloating 00013 retroactively.
 */
export async function getCountriesDirectory(): Promise<CountryDirectoryRow[]> {
  const supabase = await createClient();

  const [countriesRes, perfRes, rolesRes] = await Promise.all([
    supabase
      .from('countries')
      .select('code, name, timezone, status')
      .order('status', { ascending: true })
      .order('name', { ascending: true }),
    supabase.from('country_performance_today').select('*'),
    supabase
      .from('user_roles')
      .select('country_code, role')
      .eq('is_active', true),
  ]);

  if (countriesRes.error) {
    throw new Error(`getCountriesDirectory countries failed: ${countriesRes.error.message}`);
  }
  if (perfRes.error) {
    throw new Error(`getCountriesDirectory perf failed: ${perfRes.error.message}`);
  }
  if (rolesRes.error) {
    throw new Error(`getCountriesDirectory roles failed: ${rolesRes.error.message}`);
  }

  const perfByCode = new Map<string, CountryPerformanceTodayRow>();
  for (const row of perfRes.data ?? []) {
    if (row.country_code) perfByCode.set(row.country_code, row);
  }

  const agentByCode = new Map<string, number>();
  const adminByCode = new Map<string, number>();
  for (const r of rolesRes.data ?? []) {
    if (!r.country_code) continue;
    if (r.role === 'agent') {
      agentByCode.set(r.country_code, (agentByCode.get(r.country_code) ?? 0) + 1);
    } else if (r.role === 'country_admin') {
      adminByCode.set(r.country_code, (adminByCode.get(r.country_code) ?? 0) + 1);
    }
  }

  return (countriesRes.data ?? []).map((c) => {
    const perf = perfByCode.get(c.code);
    return {
      country_code: c.code,
      country_name: c.name,
      timezone: c.timezone,
      status: c.status as 'active' | 'coming_soon',
      total_leads: perf?.total_leads ?? null,
      new_today: perf?.new_today ?? null,
      contacted_pct: perf?.contacted_pct ?? null,
      converted_pct: perf?.converted_pct ?? null,
      avg_response_seconds: perf?.avg_response_seconds ?? null,
      agent_count: agentByCode.get(c.code) ?? 0,
      country_admin_count: adminByCode.get(c.code) ?? 0,
    };
  });
}
