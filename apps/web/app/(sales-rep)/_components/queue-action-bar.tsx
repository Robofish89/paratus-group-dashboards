"use client";

import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import {
  CallOutcomeModal,
  type CallOutcomeModalSubmit,
} from "@repo/ui";
import type { QueueLead } from "@repo/supabase/dal";

/**
 * Owns the modal state machine for one selected lead so queue-view stays
 * focused on list state. Wires the Phase 3 outcome surface against the
 * thin route handlers under /api/queue/*.
 *
 * Flow:
 *   1. Parent calls onOpen(lead) (e.g. when Call Now is clicked AFTER the
 *      contact POST has succeeded).
 *   2. Modal renders. Agent picks an outcome.
 *   3. Submit fires either /api/queue/complete or /api/queue/callback.
 *   4. On success: parent's onCompleted(lead, outcome) settles the local
 *      lists (remove from To Call, add to Completed when terminal). Parent
 *      then closes the modal via setActiveLead(null).
 *   5. On failure: error bubbles up from fetch → modal's catch → inline
 *      error surface; modal stays open.
 *
 * router.refresh() runs after every successful settle so the four counters
 * in QueueStats re-fetch from the authoritative agent_today_stats view.
 */

interface QueueActionBarProps {
  activeLead: QueueLead | null;
  onClose: () => void;
  onCompleted: (lead: QueueLead, outcome: CallOutcomeModalSubmit["outcome"]) => void;
}

export function QueueActionBar({
  activeLead,
  onClose,
  onCompleted,
}: QueueActionBarProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  const handleSubmit = useCallback(
    async (input: CallOutcomeModalSubmit) => {
      if (!activeLead) return;
      setLoading(true);
      try {
        if (input.outcome === "callback") {
          if (!input.callback_at) {
            throw new Error("callback_at missing");
          }
          const res = await fetch("/api/queue/callback", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              lead_id: activeLead.id,
              scheduled_for: input.callback_at,
              notes: input.notes,
            }),
          });
          if (!res.ok) {
            const body = (await res.json().catch(() => null)) as
              | { error?: unknown }
              | null;
            const msg =
              typeof body?.error === "string"
                ? body.error
                : `Callback failed (${res.status})`;
            throw new Error(msg);
          }
        } else {
          const res = await fetch("/api/queue/complete", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              lead_id: activeLead.id,
              outcome: input.outcome,
              notes: input.notes,
              lost_reason: input.lost_reason,
            }),
          });
          if (!res.ok) {
            const body = (await res.json().catch(() => null)) as
              | { error?: unknown }
              | null;
            const msg =
              typeof body?.error === "string"
                ? body.error
                : `Submit failed (${res.status})`;
            throw new Error(msg);
          }
        }

        onCompleted(activeLead, input.outcome);
        router.refresh();
        onClose();
      } finally {
        setLoading(false);
      }
    },
    [activeLead, onCompleted, onClose, router],
  );

  if (!activeLead) return null;

  return (
    <CallOutcomeModal
      open={!!activeLead}
      lead={{ id: activeLead.id, name: activeLead.name }}
      onSubmit={handleSubmit}
      onClose={loading ? () => {} : onClose}
      loading={loading}
    />
  );
}
