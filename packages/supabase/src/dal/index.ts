// Server-only Data Access Layer barrel. Every file under ./dal/ starts with
// `import 'server-only'`; importing this barrel from a client component will
// produce a build error at compile time (the desired behaviour).

export { getCurrentUserClaims, getUserRoleRow } from './users';
export { ingestLead, isIngestLeadError } from './leads';
export type { IngestLeadResult, IngestLeadSuccess, IngestLeadError } from './leads';
export { appendEvent } from './events';
export type { AppendEventInput, LeadEventType } from './events';

export {
  getAgentQueue,
  getAgentCompletedToday,
  getAgentTodayStats,
  getAgentCallbacksDue,
  markLeadContacted,
  completeCall,
  scheduleCallback,
} from './queue';
export type {
  QueueLead,
  AgentTodayStats,
  CallbackDue,
  MarkLeadContactedResult,
  CompleteCallResult,
  ScheduleCallbackResult,
} from './queue';
