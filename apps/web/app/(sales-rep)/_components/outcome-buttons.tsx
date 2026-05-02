"use client";

import { cn } from "@repo/ui";

/**
 * Three pill buttons + a small "No answer" text link. Rendered inline on the
 * card after the agent taps "Call" (mid-call state).
 *
 * Visual: emerald Converted (the gamification anchor) / red Lost / amber
 * Callback / muted slate text-link "No answer". All taps surface to the
 * parent which fires the right route + clears the mid-call state.
 */

interface OutcomeButtonsProps {
  onConverted: () => void;
  onLost: () => void;
  onCallback: () => void;
  onNoAnswer: () => void;
  busy?: boolean;
  /** Total prior call attempts; surfaced inline next to the No-answer link. */
  attempts?: number;
}

export function OutcomeButtons({
  onConverted,
  onLost,
  onCallback,
  onNoAnswer,
  busy = false,
  attempts = 0,
}: OutcomeButtonsProps) {
  return (
    <div className="flex flex-col gap-2">
      <div className="grid grid-cols-3 gap-2">
        <button
          type="button"
          data-action="converted"
          disabled={busy}
          onClick={onConverted}
          className={cn(
            "rounded-lg py-2 text-xs font-semibold transition-colors",
            "bg-emerald-50 text-emerald-700 border border-emerald-200",
            "hover:bg-emerald-100 cursor-pointer",
            "disabled:cursor-not-allowed disabled:opacity-60",
          )}
        >
          Converted
        </button>
        <button
          type="button"
          data-action="lost"
          disabled={busy}
          onClick={onLost}
          className={cn(
            "rounded-lg py-2 text-xs font-semibold transition-colors",
            "bg-red-50 text-red-700 border border-red-200",
            "hover:bg-red-100 cursor-pointer",
            "disabled:cursor-not-allowed disabled:opacity-60",
          )}
        >
          Lost
        </button>
        <button
          type="button"
          data-action="callback"
          disabled={busy}
          onClick={onCallback}
          className={cn(
            "rounded-lg py-2 text-xs font-semibold transition-colors",
            "bg-amber-50 text-amber-700 border border-amber-200",
            "hover:bg-amber-100 cursor-pointer",
            "disabled:cursor-not-allowed disabled:opacity-60",
          )}
        >
          Callback
        </button>
      </div>
      <div className="flex items-center justify-end gap-2">
        {attempts > 0 && (
          <span
            data-attempts-inline={attempts}
            className={cn(
              "rounded-full px-1.5 py-0.5 text-[10px] font-semibold",
              "bg-amber-50 text-amber-700 border border-amber-200",
            )}
          >
            tried {attempts}×
          </span>
        )}
        <button
          type="button"
          data-action="no-answer"
          disabled={busy}
          onClick={onNoAnswer}
          className={cn(
            "text-[11px] font-medium text-slate-500 hover:text-slate-700",
            "underline decoration-slate-300 decoration-1 underline-offset-2",
            "cursor-pointer disabled:cursor-not-allowed disabled:opacity-60",
          )}
        >
          No answer
        </button>
      </div>
    </div>
  );
}
