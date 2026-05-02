import { z } from 'zod';

/**
 * Sales-rep queue input schemas. Validation contract for the queue route
 * handlers. Mirrors the parameter contract of the SECURITY DEFINER RPCs in
 * migrations 00009 (`mark_lead_contacted`, `complete_call`,
 * `schedule_callback`) and 00010 (`record_no_answer`,
 * `agent_stats_in_range`).
 *
 * Plan 03-04 narrows the call-outcome enum: `'qualified'` is dropped (the UI
 * collapses Qualified + Won into a single "Converted" outcome at the label
 * layer; the DB enum value `'won'` is preserved for back-compat).
 *
 * Pure validation — safe to import from server, client, or middleware code.
 */

export const callOutcomeEnum = z.enum(['won', 'lost', 'no_answer', 'callback']);

export const completeCallInput = z
  .object({
    lead_id: z.string().uuid(),
    outcome: callOutcomeEnum,
    notes: z.string().max(2000).optional(),
    lost_reason: z.string().max(500).optional(),
  })
  .refine((v) => v.outcome !== 'lost' || Boolean(v.lost_reason), {
    message: 'lost_reason required when outcome=lost',
    path: ['lost_reason'],
  });

export const scheduleCallbackInput = z.object({
  lead_id: z.string().uuid(),
  scheduled_for: z.string().datetime(), // ISO8601
  notes: z.string().max(2000).optional(),
});

export const recordNoAnswerInput = z.object({
  lead_id: z.string().uuid(),
});

export const dateRangeKeyEnum = z.enum(['today', 'week', 'month', 'custom']);

export const agentStatsInRangeInput = z
  .object({
    from: z.string().datetime(),
    to: z.string().datetime(),
  })
  .refine((v) => new Date(v.to) > new Date(v.from), {
    message: 'to must be after from',
    path: ['to'],
  });

export type CallOutcome = z.infer<typeof callOutcomeEnum>;
export type CompleteCallInput = z.infer<typeof completeCallInput>;
export type ScheduleCallbackInput = z.infer<typeof scheduleCallbackInput>;
export type RecordNoAnswerInput = z.infer<typeof recordNoAnswerInput>;
export type DateRangeKey = z.infer<typeof dateRangeKeyEnum>;
export type AgentStatsInRangeInput = z.infer<typeof agentStatsInRangeInput>;
