"use client";

import { cn, MetricCard, type MetricCardAccent } from "@repo/ui";
import { DateRangePicker } from "./date-range-picker";
import type { DateRangeKey } from "@/app/_lib/date-range";

/**
 * Stats strip for the agent queue header (plan 03-04 shape, refactored to
 * shared `MetricCard` primitive in plan 06-04 task 2):
 *
 *   To Call    (live, paratus-blue)
 *   Follow-ups (live, orange)
 *   Converted  (range-aware, emerald — gamification anchor)
 *   Lost       (range-aware, rose)
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
  accent: MetricCardAccent;
}

const TILES: StatTile[] = [
  { key: "to_call", label: "To Call", accent: "blue" },
  { key: "follow_ups", label: "Follow-ups", accent: "orange" },
  { key: "converted", label: "Converted", accent: "emerald" },
  { key: "lost", label: "Lost", accent: "rose" },
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
        <div
          data-live-indicator
          className={cn(
            "inline-flex self-start items-center gap-2 rounded-full",
            "bg-white border border-emerald-200 px-3 py-1",
          )}
        >
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75 animate-ping" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
          </span>
          <span className="text-[11px] font-semibold tracking-[0.1em] text-emerald-700 uppercase">
            Live data
          </span>
        </div>
        <DateRangePicker currentKey={rangeKey} currentLabel={rangeLabel} />
      </div>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-5">
        {TILES.map((tile) => (
          <MetricCard
            key={tile.key}
            label={tile.label}
            value={values[tile.key]}
            accent={tile.accent}
            dataAttrs={{ "data-tile": tile.key }}
          />
        ))}
      </div>
    </div>
  );
}
