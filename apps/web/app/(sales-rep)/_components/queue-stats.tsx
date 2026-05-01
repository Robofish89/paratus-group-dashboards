"use client";

import { cn } from "@repo/ui";

/**
 * Stats strip for the agent queue header. Mockup lines 79–100:
 * To Call (paratus blue), Completed (emerald-500), Converted (amber-500),
 * Callbacks (orange-500). 4 cards on lg+, 2 on mobile.
 *
 * `stats` is null when the agent_today_stats view returned no row (only
 * possible if RLS hides every row, e.g. an HQ admin "observing" — see
 * page.tsx empty-state explainer). In that case all counters render 0.
 */

export interface QueueStatsData {
  to_call_count: number | null;
  completed_today: number | null;
  converted_today: number | null;
  callbacks_pending: number | null;
}

interface QueueStatsProps {
  stats: QueueStatsData | null;
}

const ITEMS = [
  { key: "to_call", label: "To Call", colorClass: "text-[#2B479B]" },
  { key: "completed", label: "Completed", colorClass: "text-emerald-500" },
  { key: "converted", label: "Converted", colorClass: "text-amber-500" },
  { key: "callbacks", label: "Callbacks", colorClass: "text-orange-500" },
] as const;

export function QueueStats({ stats }: QueueStatsProps) {
  const values: Record<(typeof ITEMS)[number]["key"], number> = {
    to_call: stats?.to_call_count ?? 0,
    completed: stats?.completed_today ?? 0,
    converted: stats?.converted_today ?? 0,
    callbacks: stats?.callbacks_pending ?? 0,
  };

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-5">
      {ITEMS.map((item) => (
        <div
          key={item.key}
          className="bg-white rounded-xl border border-slate-200 px-4 py-3 sm:px-5 sm:py-4"
        >
          <p className="text-[11px] font-semibold tracking-[0.1em] text-slate-400 uppercase mb-1">
            {item.label}
          </p>
          <p
            className={cn(
              "text-3xl font-bold tabular-nums",
              item.colorClass,
            )}
          >
            {values[item.key]}
          </p>
        </div>
      ))}
    </div>
  );
}
