// @repo/supabase — shared Supabase client utilities
//
// Prefer specific imports for tree-shaking:
//   import { createClient } from '@repo/supabase/client'
//   import { createClient } from '@repo/supabase/server'
//   import { createAuthMiddleware } from '@repo/supabase/middleware'
//   import { createAdminClient } from '@repo/supabase/admin'
//   import type { AppRole, UserWithRole } from '@repo/supabase/types'
//   import { getCallbackQueue } from '@repo/supabase/dal'
//   import { UpdateCallbackSchema } from '@repo/supabase/schemas'

export { createClient as createBrowserClient } from './client.js';
export { createAuthMiddleware, matcherConfig, AUTH_EXCLUDED_PATHS } from './middleware.js';
export type {
  AppRole,
  UserWithRole,
  AppJwtClaims,
  Database,
  CallbackStatus,
  CallbackQueueRow,
  ChatSessionRow,
  ChatMessage,
  Channel,
  OutageStatus,
  OutageSeverity,
  OutageRow,
} from './types/index.js';

// Note: server, admin, dal, and schemas are NOT re-exported here because they
// import 'server-only' which would break client-side imports of this barrel.
// Import them directly:
//   import { createClient } from '@repo/supabase/server'
//   import { createAdminClient } from '@repo/supabase/admin'
//   import { getCallbackQueue } from '@repo/supabase/dal'
//   import { UpdateCallbackSchema } from '@repo/supabase/schemas'
