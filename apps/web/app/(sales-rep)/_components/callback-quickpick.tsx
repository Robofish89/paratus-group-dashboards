"use client";

import { useMemo, useState } from "react";
import { cn } from "@repo/ui";

/**
 * Callback scheduling input. Three quick-pick chips (Today 5pm / Tomorrow 9am
 * / Next Mon 9am — past chips hidden) plus a `<input type="datetime-local">`
 * fallback. Submits ISO 8601 to the parent.
 */

interface CallbackQuickpickProps {
  onSubmit: (scheduledForIso: string) => void;
  onCancel: () => void;
  busy?: boolean;
}

interface QuickChip {
  label: string;
  date: Date;
}

function buildChips(now: Date): QuickChip[] {
  const chips: QuickChip[] = [];

  // Today 5pm — only if still in the future.
  const today5 = new Date(now);
  today5.setHours(17, 0, 0, 0);
  if (today5.getTime() > now.getTime()) {
    chips.push({ label: "Today 5pm", date: today5 });
  }

  // Tomorrow 9am.
  const tomorrow9 = new Date(now);
  tomorrow9.setDate(tomorrow9.getDate() + 1);
  tomorrow9.setHours(9, 0, 0, 0);
  chips.push({ label: "Tomorrow 9am", date: tomorrow9 });

  // Next Monday 9am.
  const nextMon = new Date(now);
  const day = nextMon.getDay() === 0 ? 7 : nextMon.getDay();
  const daysToMon = ((8 - day) % 7) || 7; // always next, never today
  nextMon.setDate(nextMon.getDate() + daysToMon);
  nextMon.setHours(9, 0, 0, 0);
  chips.push({ label: "Next Mon 9am", date: nextMon });

  return chips;
}

function localDatetimeMin(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function CallbackQuickpick({
  onSubmit,
  onCancel,
  busy = false,
}: CallbackQuickpickProps) {
  const chips = useMemo(() => buildChips(new Date()), []);
  const [pickedChip, setPickedChip] = useState<number | null>(null);
  const [customDatetime, setCustomDatetime] = useState("");
  const [error, setError] = useState<string | null>(null);

  function handleSchedule() {
    setError(null);

    if (pickedChip !== null) {
      onSubmit(chips[pickedChip].date.toISOString());
      return;
    }

    if (!customDatetime) {
      setError("Pick a date and time, or tap a quick chip.");
      return;
    }
    const d = new Date(customDatetime);
    if (Number.isNaN(d.getTime())) {
      setError("Invalid date.");
      return;
    }
    if (d.getTime() <= Date.now()) {
      setError("Callback time must be in the future.");
      return;
    }
    onSubmit(d.toISOString());
  }

  return (
    <div className="flex flex-col gap-2">
      <p className="text-[11px] font-semibold tracking-[0.08em] text-slate-500 uppercase">
        Call back when?
      </p>
      <div className="flex flex-wrap gap-1.5">
        {chips.map((chip, idx) => (
          <button
            key={chip.label}
            type="button"
            data-chip={chip.label.toLowerCase().replace(/\s+/g, "-")}
            disabled={busy}
            onClick={() => {
              setPickedChip(idx);
              setCustomDatetime("");
            }}
            className={cn(
              "rounded-full px-2.5 py-1 text-[11px] font-medium border transition-colors",
              pickedChip === idx
                ? "bg-amber-50 text-amber-700 border-amber-300"
                : "bg-white text-slate-600 border-slate-300 hover:bg-slate-50",
              "cursor-pointer disabled:cursor-not-allowed disabled:opacity-60",
            )}
          >
            {chip.label}
          </button>
        ))}
      </div>
      <input
        type="datetime-local"
        value={customDatetime}
        min={localDatetimeMin()}
        onChange={(e) => {
          setCustomDatetime(e.target.value);
          setPickedChip(null);
        }}
        disabled={busy}
        className={cn(
          "rounded-lg border border-slate-300 px-2.5 py-1.5 text-[12px]",
          "focus:outline-none focus:ring-2 focus:ring-amber-300 focus:border-transparent",
          "disabled:bg-slate-50 disabled:cursor-not-allowed",
        )}
        aria-label="Pick exact callback time"
      />
      {error && (
        <p role="alert" className="text-[11px] text-red-600">
          {error}
        </p>
      )}
      <div className="flex gap-2 mt-1">
        <button
          type="button"
          disabled={busy}
          onClick={handleSchedule}
          className={cn(
            "flex-1 rounded-lg py-2 text-xs font-semibold transition-colors",
            "bg-amber-600 text-white hover:bg-amber-700 cursor-pointer",
            "disabled:cursor-not-allowed disabled:opacity-60",
          )}
        >
          {busy ? "Scheduling…" : "Schedule"}
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
