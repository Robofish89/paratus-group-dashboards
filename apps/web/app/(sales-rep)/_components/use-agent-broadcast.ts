'use client';

import { usePrivateBroadcast } from '@repo/supabase/realtime';
import type { Database } from '@repo/supabase/types';

type LeadRow = Database['public']['Tables']['leads']['Row'];

/**
 * Subscribe to the per-agent broadcast topic and forward every lead payload
 * up to the queue view.
 *
 * The trigger in migration 00008 fires on `INSERT` (new lead created with
 * assigned_to set) and on `UPDATE OF assigned_to` (round-robin assignment of
 * a previously unassigned lead). We listen on `event:'*'` because the webhook
 * path always lands as an UPDATE (insert with assigned_to NULL → assign_lead
 * sets it), so filtering to INSERT would miss the production code path —
 * see `apps/web/tests/realtime.broadcast.test.ts` JSDoc.
 *
 * `private: true` is required for the realtime.messages RLS policy to admit
 * the subscribe; the underlying `usePrivateBroadcast` hook sets it.
 */
export function useAgentBroadcast(
  agentId: string,
  onLead: (lead: LeadRow, operation: string) => void,
) {
  usePrivateBroadcast<LeadRow>({
    topic: `agent:${agentId}`,
    event: '*',
    onMessage: (env) => {
      const record = env.payload?.record;
      if (record) {
        onLead(record, env.payload?.operation ?? 'UPDATE');
      }
    },
  });
}
