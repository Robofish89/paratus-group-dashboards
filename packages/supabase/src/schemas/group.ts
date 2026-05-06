import { z } from 'zod';

/**
 * HQ overview Zod schemas. Validation contract for the group DAL — mirrors
 * the SECURITY DEFINER views/RPC in migration 00013 (plan 05-01):
 *   - group_today_stats              (security_invoker view, 1 row)
 *   - country_performance_today      (security_invoker view, 12 rows for HQ)
 *   - leads_by_service_group         (security_invoker view, all-time)
 *   - group_speed_to_lead_series(p_days)  (RPC, hq_admin-only)
 *
 * Pure validation — safe to import from server, client, or middleware code.
 */

// ─── Inputs ────────────────────────────────────────────────────────────────

/**
 * Days window for the group speed-to-lead series RPC. Positive integer
 * because the RPC walks `generate_series(today - p_days + 1, today)`; a
 * non-positive value would yield an empty or reversed series.
 */
export const groupSpeedToLeadSeriesInput = z.object({
  p_days: z.number().int().positive(),
});

// ─── View row shapes ───────────────────────────────────────────────────────

/**
 * One row returned by `group_today_stats`. supabase-js typed client surfaces
 * numbers as `number | null`; nullable because a fresh project with zero
 * leads emits NULL for the rate + speed fields.
 */
export const groupTodayStatsSchema = z.object({
  active_country_count: z.number().nullable(),
  total_leads_group: z.number().nullable(),
  new_today_group: z.number().nullable(),
  contacted_today_group: z.number().nullable(),
  converted_today_group: z.number().nullable(),
  lost_today_group: z.number().nullable(),
  conversion_rate_alltime: z.number().nullable(),
  avg_speed_to_lead_seconds_today: z.number().nullable(),
});

/**
 * One row per active country from `country_performance_today`. Already
 * ordered by total_leads DESC at the view layer.
 *
 * - `contacted_pct` / `converted_pct` are null when total_leads = 0 (the
 *   view's NULLIF guards a divide-by-zero).
 * - `avg_response_seconds` is null when no leads have been contacted yet.
 * - `avg_response_seconds` is ALL-TIME (today-only would be too volatile
 *   across small-volume countries — see plan 05-01 STATE entry).
 */
export const countryPerformanceRowSchema = z.object({
  country_code: z.string().nullable(),
  country_name: z.string().nullable(),
  total_leads: z.number().nullable(),
  new_today: z.number().nullable(),
  contacted_pct: z.number().nullable(),
  converted_pct: z.number().nullable(),
  avg_response_seconds: z.number().nullable(),
});

/**
 * One row per `form_slug` from `leads_by_service_group`. ALL-TIME group-wide
 * rollup — diverges from the country-admin equivalent which is today-only
 * per country. See plan 05-01 STATE entry for the rationale (mockup math
 * only reconciles to ALL-TIME totals).
 */
export const leadsByServiceGroupRowSchema = z.object({
  form_slug: z.string().nullable(),
  leads_count: z.number().nullable(),
});

/**
 * One row per UTC day in the requested window from
 * `group_speed_to_lead_series`. The RPC's WHERE clause filters
 * `first_contacted_at IS NOT NULL`, so days with zero contacted leads still
 * emit a row but median/p75 may be 0 — chart consumers should plot the
 * series as-is (the reference line at y=300 makes the SLA target obvious).
 *
 * UTC day boundaries (not country-tz) because the group view spans 12 IANA
 * tz; per-country boundary makes no sense in a single-axis trend.
 */
export const groupSpeedToLeadDaySchema = z.object({
  day: z.string(),
  median_seconds: z.number(),
  p75_seconds: z.number(),
});

/**
 * One row per country in the HQ Countries directory. Spans all 15 markets
 * (12 active + 3 coming-soon) — coming-soon rows have null performance
 * metrics and zero agent counts. Status drives which variant the card
 * renders.
 */
export const countryDirectoryRowSchema = z.object({
  country_code: z.string(),
  country_name: z.string(),
  timezone: z.string(),
  status: z.enum(['active', 'coming_soon']),
  total_leads: z.number().nullable(),
  new_today: z.number().nullable(),
  contacted_pct: z.number().nullable(),
  converted_pct: z.number().nullable(),
  avg_response_seconds: z.number().nullable(),
  agent_count: z.number(),
  country_admin_count: z.number(),
});

// ─── Inferred TS types ─────────────────────────────────────────────────────

export type GroupTodayStats = z.infer<typeof groupTodayStatsSchema>;
export type CountryPerformanceRow = z.infer<typeof countryPerformanceRowSchema>;
export type LeadsByServiceGroupRow = z.infer<typeof leadsByServiceGroupRowSchema>;
export type GroupSpeedToLeadDay = z.infer<typeof groupSpeedToLeadDaySchema>;
export type GroupSpeedToLeadSeriesInput = z.infer<
  typeof groupSpeedToLeadSeriesInput
>;
export type CountryDirectoryRow = z.infer<typeof countryDirectoryRowSchema>;

// ─── Status bucket helper ──────────────────────────────────────────────────

/**
 * Single source of truth for the "Status" dot in the country-performance
 * leaderboard and the "Avg Speed to Lead" KPI tile ring. Per plan 05 RESEARCH
 * open question 2 (recommendation: fixed in DAL):
 *
 *   - null      → red (no contacted leads is treated as "off target")
 *   - <  300s   → green ("On Target <5 min")
 *   - <= 480s   → amber ("Watch 5–8 min")
 *   - >  480s   → red   ("Critical >8 min")
 *
 * Pure function — lives in `schemas/` so client components, server components,
 * and route handlers can all import it without crossing the `server-only`
 * boundary in `dal/`. The `dal/group.ts` barrel re-exports for convenience.
 */
export const RESPONSE_STATUS_THRESHOLDS = {
  green: 300, // 5 minutes — same SLA as Phase 4's <ReferenceLine y={300} />
  amber: 480, // 8 minutes
} as const;

export type ResponseStatus = 'green' | 'amber' | 'red';

export function computeResponseStatus(
  seconds: number | null,
): ResponseStatus {
  if (seconds === null) return 'red';
  if (seconds < RESPONSE_STATUS_THRESHOLDS.green) return 'green';
  if (seconds <= RESPONSE_STATUS_THRESHOLDS.amber) return 'amber';
  return 'red';
}
