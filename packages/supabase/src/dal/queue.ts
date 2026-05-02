import 'server-only';

// All queue read/write paths run against the server cookie client (RLS in
// force) — never service-role. The queue RPCs are SECURITY DEFINER but gate
// on auth.uid() internally, and EXECUTE is granted to `authenticated` only
// (see migrations 00009 + 00010). The cookie client carrying the agent's JWT
// is the right authority for every operation in this file.
import { createClient } from '../server';
import type {
  AgentStatsInRangeInput,
  CallOutcome,
  CompleteCallInput,
  ScheduleCallbackInput,
} from '../schemas/queue';
import type { Database } from '../types/database';

type QueueLeadRow = Database['public']['Tables']['leads']['Row'];
type CallbackRow = Database['public']['Tables']['callbacks']['Row'];
type AgentTodayStatsRow = Database['public']['Views']['agent_today_stats']['Row'];

/**
 * The shape the queue UI consumes. Plan 03-04 adds `call_attempts` and
 * `last_outcome` so the client can drive the Follow-ups predicate without a
 * second fetch.
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
  | 'call_attempts'
  | 'last_outcome'
  | 'created_at'
  | 'updated_at'
>;

export type AgentTodayStats = AgentTodayStatsRow;
export type CallbackDue = CallbackRow;

const QUEUE_LEAD_COLS =
  'id, country_code, form_slug, status, assigned_to, name, email, phone, message, submitted_at, first_contacted_at, qualified_at, converted_at, lost_at, lost_reason, call_attempts, last_outcome, created_at, updated_at';

// ─── Reads ─────────────────────────────────────────────────────────────────

/**
 * The "To Call" list — leads in 'new' or 'contacted' status that aren't yet
 * stalled on no-answers. The DB-side `agent_today_stats.to_call_count` column
 * carries the same predicate, so the badge on the tab matches the list size.
 *
 * RLS on leads scopes to assigned_to=auth.uid() AND
 * country_code=jwt.country_code; the predicates here are UI-side narrowing,
 * not security boundaries.
 */
export async function getAgentQueue(): Promise<QueueLead[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('leads')
    .select(QUEUE_LEAD_COLS)
    .in('status', ['new', 'contacted'])
    // Stalled no-answers (>=3 attempts AND last_outcome=no_answer) live in
    // Follow-ups instead. Express the inverse here.
    .or('last_outcome.is.null,last_outcome.neq.no_answer,call_attempts.lt.3')
    .order('submitted_at', { ascending: true });

  if (error) {
    throw new Error(`getAgentQueue failed: ${error.message}`);
  }
  return (data ?? []) as QueueLead[];
}

/**
 * The "Follow-ups" list — stalled no-answers OR future-scheduled callbacks.
 * Two queries combined in code; each is RLS-gated independently.
 */
export async function getAgentFollowUps(): Promise<QueueLead[]> {
  const supabase = await createClient();
  // Stalled no-answers at the lead level.
  const stalledQuery = supabase
    .from('leads')
    .select(QUEUE_LEAD_COLS)
    .eq('status', 'contacted')
    .eq('last_outcome', 'no_answer')
    .gte('call_attempts', 3)
    .order('updated_at', { ascending: false });

  // Pending callbacks scheduled for the future, joined back to the lead.
  const callbackQuery = supabase
    .from('callbacks')
    .select(`lead:leads!inner(${QUEUE_LEAD_COLS}), scheduled_for, status`)
    .eq('status', 'pending')
    .gt('scheduled_for', new Date().toISOString())
    .order('scheduled_for', { ascending: true });

  const [stalledRes, callbackRes] = await Promise.all([
    stalledQuery,
    callbackQuery,
  ]);

  if (stalledRes.error) {
    throw new Error(
      `getAgentFollowUps (stalled) failed: ${stalledRes.error.message}`,
    );
  }
  if (callbackRes.error) {
    throw new Error(
      `getAgentFollowUps (callbacks) failed: ${callbackRes.error.message}`,
    );
  }

  const stalled = (stalledRes.data ?? []) as QueueLead[];
  // PostgREST returns the joined relation as an array even on `inner` joins
  // when the parent type isn't pre-narrowed; flatten and cast through unknown.
  const callbackRows = (callbackRes.data ?? []) as unknown as Array<{
    lead: QueueLead | QueueLead[] | null;
  }>;
  const callbackLeads = callbackRows
    .flatMap((row) => (Array.isArray(row.lead) ? row.lead : row.lead ? [row.lead] : []))
    .filter((l): l is QueueLead => Boolean(l));

  // De-duplicate by lead id (stalled lead might also have a future callback).
  const seen = new Set<string>();
  const merged: QueueLead[] = [];
  for (const lead of [...stalled, ...callbackLeads]) {
    if (seen.has(lead.id)) continue;
    seen.add(lead.id);
    merged.push(lead);
  }
  return merged;
}

/**
 * Converted leads in [from, to). Powers the Converted tab list, range-aware.
 */
export async function getAgentConvertedInRange({
  from,
  to,
}: AgentStatsInRangeInput): Promise<QueueLead[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('leads')
    .select(QUEUE_LEAD_COLS)
    .eq('status', 'converted')
    .gte('converted_at', from)
    .lt('converted_at', to)
    .order('converted_at', { ascending: false });

  if (error) {
    throw new Error(`getAgentConvertedInRange failed: ${error.message}`);
  }
  return (data ?? []) as QueueLead[];
}

/**
 * Lost leads in [from, to). Powers the Lost tab list, range-aware.
 */
export async function getAgentLostInRange({
  from,
  to,
}: AgentStatsInRangeInput): Promise<QueueLead[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('leads')
    .select(QUEUE_LEAD_COLS)
    .eq('status', 'lost')
    .gte('lost_at', from)
    .lt('lost_at', to)
    .order('lost_at', { ascending: false });

  if (error) {
    throw new Error(`getAgentLostInRange failed: ${error.message}`);
  }
  return (data ?? []) as QueueLead[];
}

/**
 * @deprecated Plan 03-04: replaced by getAgentConvertedInRange + getAgentLostInRange.
 * Kept transitionally so the queue-page compiles between Task 2 and Task 5.
 * Returns terminal-status leads from the start of the local day.
 */
export async function getAgentCompletedToday(): Promise<QueueLead[]> {
  const supabase = await createClient();
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);

  const { data, error } = await supabase
    .from('leads')
    .select(QUEUE_LEAD_COLS)
    .in('status', ['converted', 'lost'])
    .gte('updated_at', startOfDay.toISOString())
    .order('updated_at', { ascending: false });

  if (error) {
    throw new Error(`getAgentCompletedToday failed: ${error.message}`);
  }
  return (data ?? []) as QueueLead[];
}

/**
 * Live counters from the agent_today_stats view (plan 03-04 shape):
 * to_call_count + follow_ups_count are LIVE; done_today + converted_today +
 * lost_today are gated to today. View is RLS-gated via security_invoker.
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
 * pool. Used by Phase 4 country-admin dashboards; agent UI prefers the
 * Follow-ups list (which scopes to FUTURE callbacks).
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
 * Calls the `complete_call` RPC with the agent's outcome capture (plan 03-04
 * accepts won|lost|no_answer|callback only — `'qualified'` is rejected by
 * both Zod and the RPC).
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

export interface RecordNoAnswerResult {
  lead_id: string;
  call_attempts: number;
}

/**
 * Calls the `record_no_answer` RPC. Increments `leads.call_attempts`, sets
 * `last_outcome='no_answer'`, writes a call event. Status is unchanged —
 * the Follow-ups tab predicate routes the lead once attempts >= 3.
 */
export async function recordNoAnswer(
  leadId: string,
): Promise<RecordNoAnswerResult> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('record_no_answer', {
    p_lead_id: leadId,
  });

  if (error) {
    throw new Error(`record_no_answer RPC failed: ${error.message}`);
  }
  return data as unknown as RecordNoAnswerResult;
}

export interface AgentStatsInRangeResult {
  converted_count: number;
  lost_count: number;
  done_count: number;
}

/**
 * Calls the `agent_stats_in_range` RPC for the date-range stat tiles
 * (Today / This Week / This Month / Custom).
 */
export async function getAgentStatsInRange({
  from,
  to,
}: AgentStatsInRangeInput): Promise<AgentStatsInRangeResult> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('agent_stats_in_range', {
    p_from: from,
    p_to: to,
  });

  if (error) {
    throw new Error(`agent_stats_in_range RPC failed: ${error.message}`);
  }
  return data as unknown as AgentStatsInRangeResult;
}
