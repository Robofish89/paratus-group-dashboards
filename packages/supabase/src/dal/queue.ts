import 'server-only';

// All queue read/write paths run against the server cookie client (RLS in
// force) — never service-role. The three queue RPCs are SECURITY DEFINER but
// gate on auth.uid() internally, and EXECUTE is granted to `authenticated`
// only (see migration 00009). So the cookie client carrying the agent's JWT
// is the right authority for every operation in this file.
import { createClient } from '../server';
import type {
  CallOutcome,
  CompleteCallInput,
  ScheduleCallbackInput,
} from '../schemas/queue';
import type { Database } from '../types/database';

type QueueLeadRow = Database['public']['Tables']['leads']['Row'];
type CallbackRow = Database['public']['Tables']['callbacks']['Row'];
type AgentTodayStatsRow = Database['public']['Views']['agent_today_stats']['Row'];

/**
 * The shape the queue UI consumes — same as the leads row, just narrower so
 * future callers can extend without breaking us. Keep in sync with the SELECT
 * lists below.
 */
export type QueueLead = Pick<
  QueueLeadRow,
  | 'id'
  | 'country_code'
  | 'form_slug'
  | 'status'
  | 'assigned_to'
  | 'name'
  | 'email'
  | 'phone'
  | 'message'
  | 'submitted_at'
  | 'first_contacted_at'
  | 'qualified_at'
  | 'converted_at'
  | 'lost_at'
  | 'lost_reason'
  | 'created_at'
  | 'updated_at'
>;

export type AgentTodayStats = AgentTodayStatsRow;
export type CallbackDue = CallbackRow;

const QUEUE_LEAD_COLS =
  'id, country_code, form_slug, status, assigned_to, name, email, phone, message, submitted_at, first_contacted_at, qualified_at, converted_at, lost_at, lost_reason, created_at, updated_at';

// ─── Reads ─────────────────────────────────────────────────────────────────

/**
 * Live queue for the agent — leads in 'new' or 'contacted' status, oldest first.
 * RLS on leads scopes to assigned_to=auth.uid() AND country_code=jwt.country_code,
 * so the SELECT here is implicitly filtered. The `in('status', ...)` is a
 * UI-side narrowing, not a security boundary.
 */
export async function getAgentQueue(): Promise<QueueLead[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('leads')
    .select(QUEUE_LEAD_COLS)
    .in('status', ['new', 'contacted'])
    .order('submitted_at', { ascending: true });

  if (error) {
    throw new Error(`getAgentQueue failed: ${error.message}`);
  }
  return (data ?? []) as QueueLead[];
}

/**
 * Today's completed work for the agent — leads that moved to a terminal
 * status (qualified/converted/lost) since the start of the local day. Used
 * for the "today" tab on the queue UI.
 */
export async function getAgentCompletedToday(): Promise<QueueLead[]> {
  const supabase = await createClient();
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);

  const { data, error } = await supabase
    .from('leads')
    .select(QUEUE_LEAD_COLS)
    .in('status', ['qualified', 'converted', 'lost'])
    .gte('updated_at', startOfDay.toISOString())
    .order('updated_at', { ascending: false });

  if (error) {
    throw new Error(`getAgentCompletedToday failed: ${error.message}`);
  }
  return (data ?? []) as QueueLead[];
}

/**
 * Counters for the queue header strip. View is RLS-gated via security_invoker,
 * so an agent gets exactly one row (their own). Returns null when no row
 * exists (caller should treat this as zero counters).
 */
export async function getAgentTodayStats(): Promise<AgentTodayStats | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('agent_today_stats')
    .select('*')
    .maybeSingle();

  if (error) {
    throw new Error(`getAgentTodayStats failed: ${error.message}`);
  }
  return data;
}

/**
 * Pending callbacks whose scheduled_for is now or in the past — the "due now"
 * badge on the queue. Same RLS filter applies (assigned_to=auth.uid).
 */
export async function getAgentCallbacksDue(): Promise<CallbackDue[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('callbacks')
    .select('*')
    .eq('status', 'pending')
    .lte('scheduled_for', new Date().toISOString())
    .order('scheduled_for', { ascending: true });

  if (error) {
    throw new Error(`getAgentCallbacksDue failed: ${error.message}`);
  }
  return data ?? [];
}

// ─── Writes ────────────────────────────────────────────────────────────────

export interface MarkLeadContactedResult {
  lead_id: string;
  first_contacted_at: string;
}

/**
 * Calls the `mark_lead_contacted` RPC. SECURITY DEFINER; the function checks
 * auth.uid()=assigned_to AND auth.jwt().country_code=leads.country_code
 * internally and raises 'forbidden' otherwise.
 */
export async function markLeadContacted(
  leadId: string,
): Promise<MarkLeadContactedResult> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('mark_lead_contacted', {
    p_lead_id: leadId,
  });

  if (error) {
    throw new Error(`mark_lead_contacted RPC failed: ${error.message}`);
  }
  return data as unknown as MarkLeadContactedResult;
}

export interface CompleteCallResult {
  lead_id: string;
  status: string;
  outcome: CallOutcome;
}

/**
 * Calls the `complete_call` RPC with the agent's outcome capture. Caller is
 * expected to validate input via `completeCallInput` Zod schema; this wrapper
 * trusts the shape.
 */
export async function completeCall(
  input: CompleteCallInput,
): Promise<CompleteCallResult> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('complete_call', {
    p_lead_id: input.lead_id,
    p_outcome: input.outcome,
    p_notes: input.notes,
    p_lost_reason: input.lost_reason,
  });

  if (error) {
    throw new Error(`complete_call RPC failed: ${error.message}`);
  }
  return data as unknown as CompleteCallResult;
}

export interface ScheduleCallbackResult {
  callback_id: string;
  lead_id: string;
  scheduled_for: string;
}

/**
 * Calls the `schedule_callback` RPC. Past timestamps raise 'invalid_schedule'
 * inside the function — caller does not need to pre-check.
 */
export async function scheduleCallback(
  input: ScheduleCallbackInput,
): Promise<ScheduleCallbackResult> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('schedule_callback', {
    p_lead_id: input.lead_id,
    p_scheduled_for: input.scheduled_for,
    p_notes: input.notes,
  });

  if (error) {
    throw new Error(`schedule_callback RPC failed: ${error.message}`);
  }
  return data as unknown as ScheduleCallbackResult;
}
