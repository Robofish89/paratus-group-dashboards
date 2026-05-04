"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { MetricCard, type MetricCardAccent } from "@repo/ui";
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
 * Refactored in plan 06-04 task 2 to consume the shared `MetricCard`
 * primitive from `@repo/ui` (ring variant) — single source of truth across
 * the three dashboards.
 *
 * Counts arrive server-fetched as `today` (server-authoritative). The group
 * broadcast hook optimistically `+1`s `total_leads_group` and `new_today_group`
 * on each new-lead event; server-authoritative `router.refresh()` re-fetches
 * the underlying view shortly after each broadcast.
 *
 * Caveat — the "Avg Speed to Lead" tile shows the GROUP MEAN; a green tile
 * here doesn't mean every country is on target. The country leaderboard
 * below is the truth (RESEARCH.md pitfall 3, "misleading mean").
 */

interface KpiStripProps {
  today: GroupTodayStats;
}

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

function avgSpeedAccent(seconds: number | null): MetricCardAccent {
  const status = computeResponseStatus(seconds);
  if (status === "green") return "emerald";
  if (status === "amber") return "amber";
  return "rose";
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

  interface TileSpec {
    key: string;
    label: string;
    accent: MetricCardAccent;
    value: string;
  }

  const tiles: TileSpec[] = [
    {
      key: "total",
      label: "Total Leads (Group)",
      accent: "blue",
      value: totalLeads.toLocaleString(),
    },
    {
      key: "countries",
      label: "Countries Active",
      accent: "blue",
      value: activeCountries.toLocaleString(),
    },
    {
      key: "conversion",
      label: "Conversion Rate",
      accent: "amber",
      value: formatPct(conversionRate),
    },
    {
      key: "avg_speed",
      label: "Avg Speed to Lead",
      accent: avgSpeedAccent(avgSpeedSeconds),
      value: formatDuration(avgSpeedSeconds),
    },
    {
      key: "today",
      label: "Leads Today",
      accent: "emerald",
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
        <MetricCard
          key={tile.key}
          label={tile.label}
          value={tile.value}
          accent={tile.accent}
          dataAttrs={{ "data-testid": `kpi-strip-tile-${tile.key}` }}
        />
      ))}
    </div>
  );
}
