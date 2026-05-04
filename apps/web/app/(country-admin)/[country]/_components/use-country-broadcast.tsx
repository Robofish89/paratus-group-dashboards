"use client";

import {
  usePrivateBroadcast,
  type BroadcastStatus,
} from "@repo/supabase/realtime";
import type { Database } from "@repo/supabase/types";

type LeadRow = Database["public"]["Tables"]["leads"]["Row"];

/**
 * Subscribe to the per-country broadcast topic and forward every lead
 * payload up to the country-admin dashboard.
 *
 * The trigger in migration 00008 fires on `INSERT` and `UPDATE OF
 * assigned_to`. We listen on `event:'*'` because the webhook path always
 * lands as an UPDATE (insert with assigned_to NULL → assign_lead sets it),
 * so filtering to a single TG_OP would miss the production code path —
 * same logic as the agent broadcast hook.
 *
 * `private: true` is required for the realtime.messages RLS policy to
 * admit the subscribe; the underlying `usePrivateBroadcast` hook sets it.
 */
export function useCountryBroadcast(
  country_code: string,
  onLead: (lead: LeadRow, operation: string) => void,
  onStatusChange?: (status: BroadcastStatus) => void,
) {
  usePrivateBroadcast<LeadRow>({
    topic: `country:${country_code}`,
    event: "*",
    onMessage: (env) => {
      const record = env.payload?.record;
      if (record) {
        onLead(record, env.payload?.operation ?? "UPDATE");
      }
    },
    onStatusChange,
  });
}
