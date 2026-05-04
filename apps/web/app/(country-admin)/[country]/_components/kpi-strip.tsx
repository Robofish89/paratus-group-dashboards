"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { cn } from "@repo/ui";
import type { CountryTodayStats } from "@repo/supabase/dal";
import { useCountryBroadcast } from "./use-country-broadcast";

/**
 * 5 KPI tiles matching `docs/design-reference/country-admin-dashboard.html`:
 *   Total Leads | New Today | Contacted | Converted | Avg Response Time
 *
 * Counts arrive server-fetched as `today` (server-authoritative). The
 * country broadcast hook optimistically `+1`s `total_leads` and `new_today`
 * on each new-lead event; server-authoritative `router.refresh()` re-fetches
 * the underlying view on a cadence (today: throttled to once per broadcast).
 *
 * "vs yesterday" delta is computed in TS from `(today - yesterday) / yesterday`
 * — a 0/0 case renders "—".
 */

interface KpiStripProps {
  countryCode: string;
  today: CountryTodayStats | null;
  /**
   * Range-aware Converted + Lost counts (the rest of the strip is "today
   * only" per the mockup; the mockup's Converted tile is range-aware in the
   * Phase 4 product because admins want to filter the leaderboard window).
   */
  rangeConverted: number;
  /** Pre-formatted avg response text from speed-to-lead view. */
  avgResponseText: string;
  avgResponseOnTarget: boolean;
}

interface DeltaResult {
  text: string;
  tone: "up" | "down" | "flat";
}

function computeDelta(today: number | null, yesterday: number | null): DeltaResult | null {
  if (today === null || yesterday === null) return null;
  if (yesterday === 0) {
    if (today === 0) return { text: "—", tone: "flat" };
    return { text: "new today", tone: "up" };
  }
  const pct = ((today - yesterday) / yesterday) * 100;
  const rounded = Math.round(pct);
  if (rounded === 0) return { text: "0%", tone: "flat" };
  return {
    text: `${rounded > 0 ? "+" : ""}${rounded}%`,
    tone: rounded > 0 ? "up" : "down",
  };
}

const TONE = {
  total: { number: "text-[#2B479B]", ring: "ring-2 ring-blue-100" },
  new_today: { number: "text-emerald-500", ring: "ring-2 ring-emerald-100" },
  contacted: { number: "text-blue-500", ring: "ring-2 ring-blue-100" },
  converted: { number: "text-amber-500", ring: "ring-2 ring-amber-100" },
  avg_response: { number: "text-emerald-500", ring: "ring-2 ring-emerald-100" },
} as const;

export function KpiStrip({
  countryCode,
  today,
  rangeConverted,
  avgResponseText,
  avgResponseOnTarget,
}: KpiStripProps) {
  const router = useRouter();
  // Optimistic bumps per broadcast event. Reset back to server values when
  // a new server-fetched `today` prop arrives — implemented via the
  // "store-prev-prop-in-state" pattern (no useEffect → no setState-in-effect).
  // See https://react.dev/learn/you-might-not-need-an-effect#adjusting-some-state-when-a-prop-changes
  const [bumpTotal, setBumpTotal] = useState(0);
  const [bumpNewToday, setBumpNewToday] = useState(0);
  const [prevToday, setPrevToday] = useState<CountryTodayStats | null>(today);
  if (prevToday !== today) {
    setPrevToday(today);
    setBumpTotal(0);
    setBumpNewToday(0);
  }

  useCountryBroadcast(countryCode, (lead, operation) => {
    // Only count INSERT-equivalent events. The webhook path emits an UPDATE
    // (the assignment flip), not an INSERT — but the `created` event_type is
    // captured by `assigned_to` going from NULL → uuid. We treat any UPDATE
    // payload where `assigned_to` is now non-null as a fresh assignment.
    if (operation === "INSERT" || (operation === "UPDATE" && lead.assigned_to)) {
      setBumpTotal((n) => n + 1);
      setBumpNewToday((n) => n + 1);
      // Coalesce server-authoritative refresh so the tiles re-sync after the
      // optimistic bump. router.refresh() is debounced internally by Next.
      router.refresh();
    }
  });

  const totalLeads = (today?.total_leads ?? 0) + bumpTotal;
  const newToday = (today?.new_today ?? 0) + bumpNewToday;
  const contactedToday = today?.contacted_today ?? 0;

  const newDelta = computeDelta(today?.new_today ?? null, today?.new_yesterday ?? null);
  const contactedDelta = computeDelta(
    today?.contacted_today ?? null,
    today?.contacted_yesterday ?? null,
  );
  const convertedDelta = computeDelta(
    today?.converted_today ?? null,
    today?.converted_yesterday ?? null,
  );

  const tiles = [
    {
      key: "total",
      label: "Total Leads",
      tone: TONE.total,
      value: totalLeads.toLocaleString(),
      subtext: "All sources",
      delta: null as DeltaResult | null,
    },
    {
      key: "new_today",
      label: "New Today",
      tone: TONE.new_today,
      value: newToday.toLocaleString(),
      subtext: null,
      delta: newDelta,
    },
    {
      key: "contacted",
      label: "Contacted",
      tone: TONE.contacted,
      value: contactedToday.toLocaleString(),
      subtext: null,
      delta: contactedDelta,
    },
    {
      key: "converted",
      label: "Converted",
      tone: TONE.converted,
      value: rangeConverted.toLocaleString(),
      subtext: null,
      delta: convertedDelta,
    },
    {
      key: "avg_response",
      label: "Avg Response Time",
      tone: TONE.avg_response,
      value: avgResponseText,
      subtext: avgResponseOnTarget ? "Target: <5 min" : "Above 5 min target",
      delta: null,
    },
  ];

  return (
    <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
      {tiles.map((tile) => (
        <div
          key={tile.key}
          data-testid={`kpi-strip-tile-${tile.key}`}
          className={cn(
            "bg-white rounded-xl px-4 py-3 sm:px-5 sm:py-4 border border-slate-200",
            "transition-shadow duration-200 hover:shadow-md",
            tile.tone.ring,
          )}
        >
          <p className="text-[11px] font-semibold tracking-[0.1em] text-slate-400 uppercase mb-1">
            {tile.label}
          </p>
          <p className={cn("text-3xl font-bold tabular-nums", tile.tone.number)}>
            {tile.value}
          </p>
          {tile.delta ? (
            <p
              className={cn(
                "text-xs font-medium mt-1.5",
                tile.delta.tone === "up"
                  ? "text-emerald-600"
                  : tile.delta.tone === "down"
                    ? "text-red-500"
                    : "text-slate-400",
              )}
            >
              {tile.delta.text} vs yesterday
            </p>
          ) : (
            <p
              className={cn(
                "text-xs mt-1.5",
                tile.key === "avg_response" && tile.subtext === "Target: <5 min"
                  ? "text-emerald-600 font-medium"
                  : "text-slate-400",
              )}
            >
              {tile.subtext}
            </p>
          )}
        </div>
      ))}
    </div>
  );
}
