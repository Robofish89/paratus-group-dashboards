"use client";

import { useMemo } from "react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  cn,
} from "@repo/ui";
import type { AgentPerformanceRow } from "@repo/supabase/schemas";

/**
 * Sales-rep performance leaderboard. Wraps the locked `<Table>` primitive
 * from `@repo/ui` with the columns from
 * `docs/design-reference/country-admin-dashboard.html`:
 *   Rep Name | Leads Assigned | Contacted | Converted | Avg Response
 *
 * The DAL returns one row per active agent (LEFT JOIN from user_roles), so
 * a country with zero work in the window still shows the agent list with
 * blanks rather than an empty card.
 *
 * "use client" only because we anticipate row-click drill-in in plan 04-03.
 * For now, row click is a no-op — drill-in is a Phase 5 / retainer concern
 * per ROADMAP scope cut.
 *
 * Sorted by `leads_converted` DESC by default; TS-only sort because the RPC
 * returns one row per agent (small N) and re-rendering on different sorts
 * is cheap.
 */

interface AgentPerformanceTableProps {
  rows: AgentPerformanceRow[];
}

function initialsOf(fullName: string | null): string {
  if (!fullName) return "—";
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "—";
  const first = parts[0]?.[0] ?? "";
  const last = parts.length > 1 ? parts[parts.length - 1]?.[0] ?? "" : "";
  return (first + last).toUpperCase();
}

function formatResponse(seconds: number | null): { text: string; tone: "fast" | "slow" | "neutral" | "none" } {
  if (seconds === null || seconds === undefined) {
    return { text: "—", tone: "none" };
  }
  const mins = Math.floor(seconds / 60);
  const secs = Math.round(seconds % 60);
  const text =
    mins > 0
      ? secs > 0
        ? `${mins}m ${secs}s`
        : `${mins}m`
      : `${secs}s`;
  // 5 min target — under 5 min is fast (green), over 5 min is slow (red).
  if (seconds < 300) return { text, tone: "fast" };
  if (seconds > 300) return { text, tone: "slow" };
  return { text, tone: "neutral" };
}

export function AgentPerformanceTable({
  rows,
}: AgentPerformanceTableProps) {
  const sorted = useMemo(
    () =>
      [...rows].sort(
        (a, b) =>
          (b.leads_converted ?? 0) - (a.leads_converted ?? 0) ||
          (b.leads_contacted ?? 0) - (a.leads_contacted ?? 0),
      ),
    [rows],
  );

  return (
    <div
      className={cn("bg-white rounded-xl p-6 border border-slate-100")}
      data-testid="agent-performance-table"
    >
      <h2 className="text-base font-semibold text-slate-900 mb-4">
        Sales Rep Performance
      </h2>
      {sorted.length === 0 ? (
        <p className="text-sm text-slate-400 py-8 text-center">
          No agents in this country yet.
        </p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="text-left">Rep Name</TableHead>
              <TableHead className="text-center">Assigned</TableHead>
              <TableHead className="text-center">Contacted</TableHead>
              <TableHead className="text-center">Converted</TableHead>
              <TableHead className="text-center">Lost</TableHead>
              <TableHead className="text-right">Avg Response</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sorted.map((row) => {
              const response = formatResponse(row.avg_response_seconds);
              const responseClass =
                response.tone === "fast"
                  ? "text-emerald-600"
                  : response.tone === "slow"
                    ? "text-red-500"
                    : response.tone === "none"
                      ? "text-slate-400"
                      : "text-slate-600";
              return (
                <TableRow
                  key={row.agent_id}
                  className="hover:bg-slate-50/50 transition-colors"
                  data-testid={`agent-performance-row-${row.agent_id}`}
                >
                  <TableCell>
                    <div className="flex items-center gap-2.5">
                      <div className="w-7 h-7 rounded-full bg-blue-100 flex items-center justify-center shrink-0">
                        <span className="text-[10px] font-semibold text-[#2B479B]">
                          {initialsOf(row.full_name)}
                        </span>
                      </div>
                      <span className="text-sm font-medium text-slate-700">
                        {row.full_name ?? "Unnamed agent"}
                      </span>
                    </div>
                  </TableCell>
                  <TableCell className="text-center text-sm text-slate-600">
                    {row.leads_assigned ?? 0}
                  </TableCell>
                  <TableCell className="text-center text-sm text-slate-600">
                    {row.leads_contacted ?? 0}
                  </TableCell>
                  <TableCell className="text-center">
                    <span className="text-sm font-semibold text-emerald-600">
                      {row.leads_converted ?? 0}
                    </span>
                  </TableCell>
                  <TableCell className="text-center">
                    <span className="text-sm font-semibold text-red-500">
                      {row.leads_lost ?? 0}
                    </span>
                  </TableCell>
                  <TableCell
                    className={cn("text-right text-sm font-medium", responseClass)}
                  >
                    {response.text}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
