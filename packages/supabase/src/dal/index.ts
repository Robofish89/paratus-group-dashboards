// Server-only Data Access Layer barrel. Every file under ./dal/ starts with
// `import 'server-only'`; importing this barrel from a client component will
// produce a build error at compile time (the desired behaviour).

export {
  getCurrentUserClaims,
  getUserRoleRow,
  getCountryAdminEmails,
  getAgentDisplayName,
  getCountryName,
} from './users';
export { ingestLead, isIngestLeadError } from './leads';
export type { IngestLeadResult, IngestLeadSuccess, IngestLeadError } from './leads';
export { appendEvent } from './events';
export type { AppendEventInput, LeadEventType } from './events';

export {
  getAgentQueue,
  getAgentFollowUps,
  getAgentConvertedInRange,
  getAgentLostInRange,
  getAgentTodayStats,
  getAgentCallbacksDue,
  getAgentStatsInRange,
  markLeadContacted,
  completeCall,
  scheduleCallback,
  recordNoAnswer,
} from './queue';
export type {
  QueueLead,
  AgentTodayStats,
  CallbackDue,
  MarkLeadContactedResult,
  CompleteCallResult,
  ScheduleCallbackResult,
  RecordNoAnswerResult,
  AgentStatsInRangeResult,
} from './queue';

export {
  getCountryTodayStats,
  getCountryStatsInRange,
  getLeadsByServiceToday,
  getStatusPipelineToday,
  getCountrySpeedToLeadToday,
  getAgentPerformanceInRange,
  getSpeedToLeadSeries,
  getCountryAgents,
  reassignLead,
  ForbiddenError,
  NotFoundError,
} from './country';
export type {
  CountryTodayStats,
  LeadsByServiceTodayItem,
  StatusPipelineTodayItem,
  CountrySpeedToLeadToday,
  CountryStatsInRange,
  CountryAgent,
} from './country';

export {
  getGroupTodayStats,
  getCountryPerformanceToday,
  getLeadsByServiceGroup,
  getGroupSpeedToLeadSeries,
  getCountriesDirectory,
  computeResponseStatus,
  RESPONSE_STATUS_THRESHOLDS,
} from './group';
export type {
  GroupTodayStats,
  CountryPerformanceRow,
  LeadsByServiceGroupRow,
  GroupSpeedToLeadDay,
  ResponseStatus,
  CountryDirectoryRow,
} from './group';

export { getOpenBreaches, markBreachAlerted } from './sla';
export type { BreachLead } from './sla';

export {
  recordAudit,
  getAuditLog,
  computeDiff,
  hashIpAddress,
  AUDIT_LOG_PAGE_SIZE,
} from './audit';
export type {
  AuditAction,
  AuditTarget,
  AuditRow,
  AuditDiff,
  RecordAuditInput,
  GetAuditLogInput,
  GetAuditLogResult,
} from './audit';
