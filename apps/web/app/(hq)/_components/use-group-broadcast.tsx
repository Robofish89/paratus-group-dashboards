"use client";

import { usePrivateBroadcast, type BroadcastStatus } from "@repo/supabase/realtime";
import type { Database } from "@repo/supabase/types";

type LeadRow = Database["public"]["Tables"]["leads"]["Row"];

/**
 * Subscribe to the group-wide broadcast topic and forward every lead payload
 * up to the HQ overview dashboard. One trigger replaces 12 simultaneous
 * per-country subscriptions per HQ tab (plan 05-01 STATE entry).
 *
 * Migration 00013 added `leads_broadcast_group` which fires on `INSERT` and
 * `UPDATE OF assigned_to`. We listen on `event:'*'` because the webhook
 * path always lands as an UPDATE (insert with assigned_to NULL → assign_lead
 * sets it), so filtering to a single TG_OP would silently miss the
 * production code path — same logic as the country broadcast hook.
 *
 * `private: true` is required for the `hq_group_topic` RLS policy on
 * `realtime.messages` (added in 00013) to admit the subscribe; the
 * underlying `usePrivateBroadcast` hook sets it.
 */
export function useGroupBroadcast(
  onLead: (lead: LeadRow, operation: string) => void,
  onStatusChange?: (status: BroadcastStatus) => void,
) {
  usePrivateBroadcast<LeadRow>({
    topic: "group:all",
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
