"use client";

import { useState } from "react";
import { Phone } from "lucide-react";
import { cn } from "@repo/ui";
import type { QueueLead } from "@repo/supabase/dal";
import { OutcomeButtons } from "./outcome-buttons";
import { LostReasonChips } from "./lost-reason-chips";
import { CallbackQuickpick } from "./callback-quickpick";

/**
 * State-aware action area at the bottom of every queue card. Replaces the
 * plan-03-03 "Call Now → modal" pattern with inline buttons that surface
 * exactly the actions the agent can take given the lead's current state.
 *
 * State machine:
 *
 *   idle (showCallButton)
 *     ↓ tap Call
 *   contacting (parent's busy flag, optimistic status flip)
 *     ↓ POST /api/queue/contact resolves
 *   mid_call (OutcomeButtons + No-answer link)
 *     ↓ tap Lost          → lost_pending (LostReasonChips)
 *     ↓ tap Callback      → callback_pending (CallbackQuickpick)
 *     ↓ tap Converted     → parent fires complete; we close
 *     ↓ tap No answer     → parent fires record-no-answer; we close
 *
 * For terminal leads (status converted | lost), we render NO action — just a
 * status chip + the lost_reason note if present. This is the fix for the
 * plan-03-03 dead-button bug.
 */

type CardMode = "idle" | "mid_call" | "lost_pending" | "callback_pending";

interface CardActionAreaProps {
  lead: QueueLead;
  /** Future-scheduled callback present? (parent passes this in) */
  hasFutureCallback?: boolean;
  /** True while any of the network calls for this lead are in flight. */
  busy?: boolean;
  onCall: (lead: QueueLead) => void;
  onConverted: (lead: QueueLead) => void;
  onLost: (lead: QueueLead, reason: string | undefined) => void;
  onCallback: (lead: QueueLead, scheduledForIso: string) => void;
  onNoAnswer: (lead: QueueLead) => void;
}

export function CardActionArea({
  lead,
  hasFutureCallback = false,
  busy = false,
  onCall,
  onConverted,
  onLost,
  onCallback,
  onNoAnswer,
}: CardActionAreaProps) {
  // The parent passes a fresh component instance per lead.id by keying on
  // the card; lead-identity changes therefore reset this state naturally.
  // Terminal-status branches short-circuit before reading mode, so a stale
  // mode value while the lead transitions through 'converted' / 'lost' is
  // never observed.
  const [mode, setMode] = useState<CardMode>("idle");

  // Terminal status: NO button. Read-only chip + reason note.
  if (lead.status === "converted" || lead.status === "lost") {
    return (
      <div className="flex flex-col gap-1.5">
        <span
          className={cn(
            "self-start rounded-full px-2.5 py-0.5 text-[11px] font-semibold border",
            lead.status === "converted"
              ? "bg-emerald-50 text-emerald-700 border-emerald-200"
              : "bg-red-50 text-red-700 border-red-200",
          )}
        >
          {lead.status === "converted" ? "Converted" : "Lost"}
        </span>
        {lead.status === "lost" && lead.lost_reason && (
          <p className="text-[11px] text-slate-500 italic">
            “{lead.lost_reason}”
          </p>
        )}
      </div>
    );
  }

  // Mid-call branches handle Lost / Callback inline expansions.
  if (mode === "lost_pending") {
    return (
      <LostReasonChips
        busy={busy}
        onSubmit={(reason) => {
          onLost(lead, reason);
          // Parent will move the card; mode reset on next mount.
        }}
        onCancel={() => setMode("mid_call")}
      />
    );
  }

  if (mode === "callback_pending") {
    return (
      <CallbackQuickpick
        busy={busy}
        onSubmit={(iso) => {
          onCallback(lead, iso);
        }}
        onCancel={() => setMode("mid_call")}
      />
    );
  }

  if (mode === "mid_call") {
    return (
      <OutcomeButtons
        busy={busy}
        onConverted={() => onConverted(lead)}
        onLost={() => setMode("lost_pending")}
        onCallback={() => setMode("callback_pending")}
        onNoAnswer={() => onNoAnswer(lead)}
      />
    );
  }

  // Idle: pick the right primary CTA based on lead state.
  const isStalledNoAnswer =
    lead.status === "contacted" &&
    lead.last_outcome === "no_answer" &&
    lead.call_attempts >= 3;
  const callLabel = hasFutureCallback
    ? "Call back"
    : isStalledNoAnswer
      ? "Try again"
      : "Call";

  return (
    <button
      type="button"
      data-action="call-lead"
      data-lead-id={lead.id}
      disabled={busy}
      onClick={() => {
        onCall(lead);
        setMode("mid_call");
      }}
      className={cn(
        "w-full flex items-center justify-center gap-2 rounded-lg py-2.5 text-sm font-semibold",
        "bg-[#2B479B] text-white hover:bg-[#243d85] cursor-pointer transition-colors duration-150",
        "disabled:cursor-not-allowed disabled:opacity-60",
      )}
    >
      <Phone className="w-4 h-4" strokeWidth={2} />
      {busy ? "Connecting…" : callLabel}
    </button>
  );
}
