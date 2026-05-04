import { z } from 'zod';

/**
 * Country-admin Zod schemas. Validation contract for the country-admin DAL +
 * (plan 04-03) the reassign route handler. Mirrors the parameter contract of
 * the SECURITY DEFINER views/RPCs in migration 00011 (plan 04-01):
 *   - country_today_stats, leads_by_service_today, status_pipeline_today,
 *     country_speed_to_lead_today (security_invoker views — no input shape)
 *   - country_stats_in_range(p_country, p_from, p_to)
 *   - agent_performance_in_range(p_country, p_from, p_to)
 *   - speed_to_lead_series(p_country, p_from, p_to)
 *   - reassign_lead(p_lead_id, p_to_agent_id)
 *
 * Pure validation — safe to import from server, client, or middleware code.
 */

// ISO-3166 alpha-2 country code from the active set seeded in migration
// 00004. Lower-case URL slugs (e.g. /na, /bw) are normalised to upper-case
// before they reach the DAL — this schema is the upper-case contract the RPCs
// expect.
export const countryCodeSchema = z.string().regex(/^[A-Z]{2}$/, {
  message: 'country_code must be 2 uppercase letters',
});

export const countryStatsInRangeInput = z
  .object({
    country_code: countryCodeSchema,
    from: z.string().datetime(),
    to: z.string().datetime(),
  })
  .refine((v) => new Date(v.to) > new Date(v.from), {
    message: 'to must be after from',
    path: ['to'],
  });

export const countryStatsInRangeOutput = z.object({
  converted_count: z.number(),
  lost_count: z.number(),
  contacted_count: z.number(),
  new_count: z.number(),
});

// One row per agent the country has on roll. Zero-work agents get a row with
// every metric at 0 / NULL — see plan 04-01 LEFT-JOIN-from-anchor.
export const agentPerformanceRow = z.object({
  agent_id: z.string().uuid(),
  full_name: z.string().nullable(),
  leads_assigned: z.number(),
  leads_contacted: z.number(),
  leads_converted: z.number(),
  leads_lost: z.number(),
  avg_response_seconds: z.number().nullable(),
});

// One row per day in the requested range; days with zero contacted leads
// are still emitted by the RPC (so the chart's x-axis is complete).
export const speedToLeadDay = z.object({
  day: z.string(),
  median_seconds: z.number(),
  p75_seconds: z.number(),
});

export const reassignLeadInput = z.object({
  lead_id: z.string().uuid(),
  to_agent_id: z.string().uuid(),
});

export type CountryCode = z.infer<typeof countryCodeSchema>;
export type CountryStatsInRangeInput = z.infer<typeof countryStatsInRangeInput>;
export type CountryStatsInRangeOutput = z.infer<typeof countryStatsInRangeOutput>;
export type AgentPerformanceRow = z.infer<typeof agentPerformanceRow>;
export type SpeedToLeadDay = z.infer<typeof speedToLeadDay>;
export type ReassignLeadInput = z.infer<typeof reassignLeadInput>;
