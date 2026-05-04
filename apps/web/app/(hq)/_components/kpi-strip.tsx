"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { cn } from "@repo/ui";
import {
  computeResponseStatus,
  type GroupTodayStats,
} from "@repo/supabase/schemas";
import type { BroadcastStatus } from "@repo/supabase/realtime";
import { useGroupBroadcast } from "./use-group-broadcast";

/**
 * 5 KPI tiles matching `docs/design-reference/hq-dashboard.html`:
 *   Total Leads (Group) | Countries Active | Conversion Rate |
 *   Avg Speed to Lead | Leads Today
 *
 * Counts arrive server-fetched as `today` (server-authoritative). The group
 * broadcast hook optimistically `+1`s `total_leads_group` and `new_today_group`
 * on each new-lead event; server-authoritative `router.refresh()` re-fetches
 * the underlying view shortly after each broadcast.
 *
 * Ring-around-card pattern locked in plan 04-04 (cross-dashboard congruence
 * with the queue-stats tiles). Phase 5 inherits.
 *
 * Caveat — the "Avg Speed to Lead" tile shows the GROUP MEAN; a green tile
 * here doesn't mean every country is on target. The country leaderboard
 * below is the truth (RESEARCH.md pitfall 3, "misleading mean").
 */

interface KpiStripProps {
  today: GroupTodayStats;
}

const TONE = {
  total: { number: "text-[#2B479B]", ring: "ring-2 ring-blue-100" },
  countries: { number: "text-[#2B479B]", ring: "ring-2 ring-blue-100" },
  conversion: { number: "text-amber-500", ring: "ring-2 ring-amber-100" },
  avg_speed_green: {
    number: "text-emerald-500",
    ring: "ring-2 ring-emerald-100",
  },
  avg_speed_amber: { number: "text-amber-500", ring: "ring-2 ring-amber-100" },
  avg_speed_red: { number: "text-red-500", ring: "ring-2 ring-red-100" },
  today: { number: "text-emerald-500", ring: "ring-2 ring-emerald-100" },
} as const;

function formatPct(value: number | null): string {
  if (value === null) return "—";
  // The view emits a number 0-100; one decimal matches the mockup ("14.2%").
  return `${value.toFixed(1)}%`;
}

function formatDuration(seconds: number | null): string {
  if (seconds === null) return "—";
  const mins = Math.floor(seconds / 60);
  const secs = Math.round(seconds % 60);
  if (mins > 0) {
    return secs > 0 ? `${mins}m ${secs}s` : `${mins}m`;
  }
  return `${secs}s`;
}

interface KpiTone {
  number: string;
  ring: string;
}

function avgSpeedTone(seconds: number | null): KpiTone {
  const status = computeResponseStatus(seconds);
  if (status === "green") return TONE.avg_speed_green;
  if (status === "amber") return TONE.avg_speed_amber;
  return TONE.avg_speed_red;
}

export function KpiStrip({ today }: KpiStripProps) {
  const router = useRouter();
  // Optimistic bumps per broadcast event. Reset back to server values when
  // a new server-fetched `today` prop arrives — implemented via the
  // "store-prev-prop-in-state" pattern (no useEffect → no setState-in-effect).
  // See https://react.dev/learn/you-might-not-need-an-effect#adjusting-some-state-when-a-prop-changes
  const [bumpTotal, setBumpTotal] = useState(0);
  const [bumpToday, setBumpToday] = useState(0);
  const [prevToday, setPrevToday] = useState<GroupTodayStats | null>(today);
  const [realtimeStatus, setRealtimeStatus] = useState<BroadcastStatus | "PENDING">(
    "PENDING",
  );
  if (prevToday !== today) {
    setPrevToday(today);
    setBumpTotal(0);
    setBumpToday(0);
  }

  useGroupBroadcast(
    (lead, operation) => {
      // Same logic as country broadcast: webhook emits UPDATE (the assignment
      // flip) rather than INSERT, so any UPDATE with non-null assigned_to is
      // a fresh lead.
      if (
        operation === "INSERT" ||
        (operation === "UPDATE" && lead.assigned_to)
      ) {
        setBumpTotal((n) => n + 1);
        setBumpToday((n) => n + 1);
        router.refresh();
      }
    },
    (status) => setRealtimeStatus(status),
  );

  const totalLeads = (today.total_leads_group ?? 0) + bumpTotal;
  const newToday = (today.new_today_group ?? 0) + bumpToday;
  const activeCountries = today.active_country_count ?? 0;
  const conversionRate = today.conversion_rate_alltime;
  const avgSpeedSeconds = today.avg_speed_to_lead_seconds_today;

  const tiles = [
    {
      key: "total",
      label: "Total Leads (Group)",
      tone: TONE.total,
      value: totalLeads.toLocaleString(),
    },
    {
      key: "countries",
      label: "Countries Active",
      tone: TONE.countries,
      value: activeCountries.toLocaleString(),
    },
    {
      key: "conversion",
      label: "Conversion Rate",
      tone: TONE.conversion,
      value: formatPct(conversionRate),
    },
    {
      key: "avg_speed",
      label: "Avg Speed to Lead",
      tone: avgSpeedTone(avgSpeedSeconds),
      value: formatDuration(avgSpeedSeconds),
    },
    {
      key: "today",
      label: "Leads Today",
      tone: TONE.today,
      value: newToday.toLocaleString(),
    },
  ];

  return (
    <div
      className="grid grid-cols-2 lg:grid-cols-5 gap-4"
      data-testid="kpi-strip"
      data-realtime-status={realtimeStatus}
    >
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
        </div>
      ))}
    </div>
  );
}
