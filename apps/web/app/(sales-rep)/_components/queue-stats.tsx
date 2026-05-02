"use client";

import { cn } from "@repo/ui";
import { DateRangePicker } from "./date-range-picker";
import type { DateRangeKey } from "@/app/_lib/date-range";

/**
 * Stats strip for the agent queue header (plan 03-04 shape):
 *
 *   To Call (live, paratus-blue)
 *   Follow-ups (live, orange-500)
 *   Converted (range-aware, emerald-500 — gamification anchor with green ring)
 *   Lost (range-aware, slate-500)
 *
 * The range picker sits to the right on desktop and stacks below on mobile.
 *
 * Counts come split: live counts arrive from agent_today_stats; range counts
 * arrive from agent_stats_in_range. The page server-fetches both and passes
 * pre-resolved values down so this component is purely presentational.
 */

export interface QueueStatsLiveData {
  to_call_count: number;
  follow_ups_count: number;
}

export interface QueueStatsRangeData {
  converted_count: number;
  lost_count: number;
}

interface QueueStatsProps {
  live: QueueStatsLiveData;
  range: QueueStatsRangeData;
  rangeKey: DateRangeKey;
  rangeLabel: string;
}

interface StatTile {
  key: "to_call" | "follow_ups" | "converted" | "lost";
  label: string;
  numberClass: string;
  ring?: string;
}

const TILES: StatTile[] = [
  {
    key: "to_call",
    label: "To Call",
    numberClass: "text-[#2B479B]",
    ring: "ring-2 ring-blue-100",
  },
  {
    key: "follow_ups",
    label: "Follow-ups",
    numberClass: "text-orange-500",
    ring: "ring-2 ring-orange-100",
  },
  {
    key: "converted",
    label: "Converted",
    numberClass: "text-emerald-500",
    ring: "ring-2 ring-emerald-100",
  },
  {
    key: "lost",
    label: "Lost",
    numberClass: "text-red-500",
    ring: "ring-2 ring-red-100",
  },
];

export function QueueStats({
  live,
  range,
  rangeKey,
  rangeLabel,
}: QueueStatsProps) {
  const values: Record<StatTile["key"], number> = {
    to_call: live.to_call_count,
    follow_ups: live.follow_ups_count,
    converted: range.converted_count,
    lost: range.lost_count,
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <p className="text-[11px] font-semibold tracking-[0.1em] text-slate-400 uppercase">
          Showing <span className="text-slate-600">{rangeLabel}</span> for
          Converted &amp; Lost
        </p>
        <DateRangePicker currentKey={rangeKey} currentLabel={rangeLabel} />
      </div>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-5">
        {TILES.map((tile) => (
          <div
            key={tile.key}
            data-tile={tile.key}
            className={cn(
              "bg-white rounded-xl border border-slate-200 px-4 py-3 sm:px-5 sm:py-4",
              tile.ring,
            )}
          >
            <p className="text-[11px] font-semibold tracking-[0.1em] text-slate-400 uppercase mb-1">
              {tile.label}
            </p>
            <p
              className={cn(
                "text-3xl font-bold tabular-nums",
                tile.numberClass,
              )}
            >
              {values[tile.key]}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}
