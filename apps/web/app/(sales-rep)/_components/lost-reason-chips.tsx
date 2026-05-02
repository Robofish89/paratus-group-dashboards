"use client";

import { useState } from "react";
import { cn } from "@repo/ui";

/**
 * Lost-reason capture. Four chips (Not interested / Wrong number / Bad fit /
 * Other). Picking "Other" reveals a small inline text field. All optional —
 * agent can hit Save without picking anything.
 *
 * The selected value (chip label or the typed "Other" text) is passed to the
 * parent's onSubmit, which forwards it as `lost_reason` to /api/queue/complete.
 */

const PRESET_REASONS = [
  "Not interested",
  "Wrong number",
  "Bad fit",
  "Other",
] as const;

type PresetReason = (typeof PRESET_REASONS)[number];

interface LostReasonChipsProps {
  onSubmit: (reason: string | undefined) => void;
  onCancel: () => void;
  busy?: boolean;
}

export function LostReasonChips({
  onSubmit,
  onCancel,
  busy = false,
}: LostReasonChipsProps) {
  const [picked, setPicked] = useState<PresetReason | null>(null);
  const [otherText, setOtherText] = useState("");

  function handleSave() {
    if (!picked) {
      onSubmit(undefined);
      return;
    }
    if (picked === "Other") {
      const trimmed = otherText.trim();
      onSubmit(trimmed.length > 0 ? trimmed : undefined);
      return;
    }
    onSubmit(picked);
  }

  return (
    <div className="flex flex-col gap-2">
      <p className="text-[11px] font-semibold tracking-[0.08em] text-slate-500 uppercase">
        Why lost?
      </p>
      <div className="flex flex-wrap gap-1.5">
        {PRESET_REASONS.map((reason) => (
          <button
            key={reason}
            type="button"
            data-chip={reason.toLowerCase().replace(/\s+/g, "-")}
            disabled={busy}
            onClick={() => setPicked(reason)}
            className={cn(
              "rounded-full px-2.5 py-1 text-[11px] font-medium border transition-colors",
              picked === reason
                ? "bg-red-50 text-red-700 border-red-300"
                : "bg-white text-slate-600 border-slate-300 hover:bg-slate-50",
              "cursor-pointer disabled:cursor-not-allowed disabled:opacity-60",
            )}
          >
            {reason}
          </button>
        ))}
      </div>
      {picked === "Other" && (
        <input
          type="text"
          value={otherText}
          onChange={(e) => setOtherText(e.target.value)}
          placeholder="What happened?"
          maxLength={500}
          disabled={busy}
          className={cn(
            "rounded-lg border border-slate-300 px-2.5 py-1.5 text-[12px]",
            "focus:outline-none focus:ring-2 focus:ring-red-300 focus:border-transparent",
            "disabled:bg-slate-50 disabled:cursor-not-allowed",
          )}
        />
      )}
      <div className="flex gap-2 mt-1">
        <button
          type="button"
          disabled={busy}
          onClick={handleSave}
          className={cn(
            "flex-1 rounded-lg py-2 text-xs font-semibold transition-colors",
            "bg-red-600 text-white hover:bg-red-700 cursor-pointer",
            "disabled:cursor-not-allowed disabled:opacity-60",
          )}
        >
          {busy ? "Saving…" : "Save"}
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={onCancel}
          className={cn(
            "rounded-lg px-3 py-2 text-xs font-semibold transition-colors",
            "bg-white text-slate-600 border border-slate-300 hover:bg-slate-50",
            "cursor-pointer disabled:cursor-not-allowed disabled:opacity-60",
          )}
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
