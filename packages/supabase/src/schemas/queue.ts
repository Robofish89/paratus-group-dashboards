import { z } from 'zod';

/**
 * Sales-rep queue input schemas. Validation contract for the call-outcome and
 * callback-scheduling Server Actions in plan 03-02. Mirrors the parameter
 * contract of the three SECURITY DEFINER RPCs shipped in migration 00009
 * (`mark_lead_contacted`, `complete_call`, `schedule_callback`).
 *
 * Pure validation — safe to import from server, client, or middleware code.
 */

export const callOutcomeEnum = z.enum([
  'qualified',
  'won',
  'lost',
  'no_answer',
  'callback',
]);

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

export type CallOutcome = z.infer<typeof callOutcomeEnum>;
export type CompleteCallInput = z.infer<typeof completeCallInput>;
export type ScheduleCallbackInput = z.infer<typeof scheduleCallbackInput>;
