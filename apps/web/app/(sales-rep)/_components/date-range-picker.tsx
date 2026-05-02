"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ChevronDown } from "lucide-react";
import { cn } from "@repo/ui";
import {
  buildRangeQuery,
  type DateRangeKey,
} from "@/app/_lib/date-range";

/**
 * Date-range dropdown for the stats strip. Drives `?range=` URL state +
 * `?from=` / `?to=` for custom mode. The server component re-runs and
 * re-fetches the Converted/Lost lists + tile counts on the next render.
 */

const PRESET_OPTIONS: Array<{ key: DateRangeKey; label: string }> = [
  { key: "today", label: "Today" },
  { key: "week", label: "This week" },
  { key: "month", label: "This month" },
  { key: "custom", label: "Custom…" },
];

interface DateRangePickerProps {
  /** Current resolved key (read on the server, passed in for SSR-stable copy). */
  currentKey: DateRangeKey;
  /** Current resolved label, e.g. "today", "Apr 1 – Apr 28". */
  currentLabel: string;
}

export function DateRangePicker({
  currentKey,
  currentLabel,
}: DateRangePickerProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [open, setOpen] = useState(false);
  const [customMode, setCustomMode] = useState(currentKey === "custom");
  const [from, setFrom] = useState(searchParams.get("from") ?? "");
  const [to, setTo] = useState(searchParams.get("to") ?? "");
  const rootRef = useRef<HTMLDivElement>(null);

  // Close on outside click — keeps the dropdown out of the way.
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  function applyPreset(key: DateRangeKey) {
    if (key === "custom") {
      setCustomMode(true);
      return;
    }
    const qs = buildRangeQuery({ key });
    router.replace(`?${qs}`, { scroll: false });
    setOpen(false);
    setCustomMode(false);
  }

  function applyCustom() {
    if (!from || !to) return;
    const fromD = new Date(`${from}T00:00:00`);
    const toD = new Date(`${to}T00:00:00`);
    if (Number.isNaN(fromD.getTime()) || Number.isNaN(toD.getTime())) return;
    if (toD < fromD) return;
    const qs = buildRangeQuery({ key: "custom", from: fromD, to: toD });
    router.replace(`?${qs}`, { scroll: false });
    setOpen(false);
  }

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        data-testid="date-range-picker-trigger"
        onClick={() => setOpen((v) => !v)}
        className={cn(
          "flex items-center gap-2 rounded-lg border border-slate-200 bg-white",
          "px-3 py-2 text-xs font-semibold text-slate-700",
          "hover:bg-slate-50 cursor-pointer transition-colors",
        )}
      >
        <span className="text-slate-400 uppercase tracking-[0.08em] text-[10px]">
          Range
        </span>
        <span className="capitalize">{currentLabel}</span>
        <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
      </button>
      {open && (
        <div
          className={cn(
            "absolute right-0 z-20 mt-1 w-60 rounded-xl border border-slate-200 bg-white shadow-lg",
            "p-2",
          )}
        >
          <ul className="flex flex-col">
            {PRESET_OPTIONS.map((opt) => (
              <li key={opt.key}>
                <button
                  type="button"
                  onClick={() => applyPreset(opt.key)}
                  className={cn(
                    "w-full text-left px-2.5 py-1.5 rounded-md text-[13px]",
                    "hover:bg-slate-100 cursor-pointer",
                    currentKey === opt.key && !customMode
                      ? "text-[#2B479B] font-semibold"
                      : "text-slate-700",
                    opt.key === "custom" && customMode
                      ? "text-[#2B479B] font-semibold"
                      : "",
                  )}
                >
                  {opt.label}
                </button>
              </li>
            ))}
          </ul>
          {customMode && (
            <div className="mt-2 border-t border-slate-100 pt-2 flex flex-col gap-1.5">
              <label className="text-[11px] font-semibold text-slate-500 uppercase tracking-[0.08em]">
                From
                <input
                  type="date"
                  value={from}
                  onChange={(e) => setFrom(e.target.value)}
                  className={cn(
                    "mt-1 w-full rounded-md border border-slate-300 px-2 py-1 text-[12px]",
                    "focus:outline-none focus:ring-2 focus:ring-[#2B479B]/40",
                  )}
                />
              </label>
              <label className="text-[11px] font-semibold text-slate-500 uppercase tracking-[0.08em]">
                To
                <input
                  type="date"
                  value={to}
                  onChange={(e) => setTo(e.target.value)}
                  className={cn(
                    "mt-1 w-full rounded-md border border-slate-300 px-2 py-1 text-[12px]",
                    "focus:outline-none focus:ring-2 focus:ring-[#2B479B]/40",
                  )}
                />
              </label>
              <button
                type="button"
                onClick={applyCustom}
                disabled={!from || !to}
                className={cn(
                  "mt-1 rounded-md py-1.5 text-xs font-semibold",
                  "bg-[#2B479B] text-white hover:bg-[#243d85] cursor-pointer",
                  "disabled:cursor-not-allowed disabled:opacity-60",
                )}
              >
                Apply
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
