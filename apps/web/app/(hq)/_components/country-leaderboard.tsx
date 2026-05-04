import Link from "next/link";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  cn,
} from "@repo/ui";
import {
  computeResponseStatus,
  RESPONSE_STATUS_THRESHOLDS,
  type CountryPerformanceRow,
  type ResponseStatus,
} from "@repo/supabase/schemas";

/**
 * Country performance leaderboard — 12 rows from `country_performance_today`.
 * Already ordered by `total_leads DESC` at the view layer; we render in the
 * order received.
 *
 * Status dot is computed via `computeResponseStatus(row.avg_response_seconds)`
 * — single source of truth. The legend reads `RESPONSE_STATUS_THRESHOLDS`
 * from the same module so the boundaries can never drift.
 *
 * Drill-in: each country name is a `<Link>` to `/<slug>` (lower-case slug).
 * The country-admin layout's role gate accepts `hq_admin` (Phase 4 plan
 * 04-03) so navigation Just Works. *Any future tightening of that allow-list
 * MUST keep `hq_admin` in.*
 */

interface CountryLeaderboardProps {
  rows: CountryPerformanceRow[];
}

const STATUS_DOT: Record<ResponseStatus, string> = {
  green: "bg-emerald-500",
  amber: "bg-amber-500",
  red: "bg-red-500",
};

function formatPct(value: number | null): string {
  if (value === null) return "—";
  // The view emits a number 0-100; one decimal matches the mockup.
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

function thresholdMinutes(seconds: number): string {
  // 300 → "5", 480 → "8". Whole-minute thresholds only.
  return String(Math.round(seconds / 60));
}

export function CountryLeaderboard({ rows }: CountryLeaderboardProps) {
  return (
    <div
      className={cn("bg-white rounded-xl border border-slate-100 overflow-hidden")}
      data-testid="country-leaderboard"
    >
      <div className="px-6 py-4 border-b border-slate-100">
        <h2 className="text-base font-semibold text-slate-900">
          Country Performance
        </h2>
      </div>

      {rows.length === 0 ? (
        <p className="text-sm text-slate-400 py-12 text-center">
          No country data yet.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-left">Country</TableHead>
                <TableHead className="text-right">Total Leads</TableHead>
                <TableHead className="text-right">New Today</TableHead>
                <TableHead className="text-right">Contacted %</TableHead>
                <TableHead className="text-right">Converted %</TableHead>
                <TableHead className="text-right">Avg Response</TableHead>
                <TableHead className="text-center">Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => {
                const status = computeResponseStatus(
                  row.avg_response_seconds,
                );
                const slug = (row.country_code ?? "").toLowerCase();
                return (
                  <TableRow
                    key={row.country_code ?? "unknown"}
                    className="hover:bg-slate-50 transition-colors"
                    data-testid={`country-leaderboard-row-${row.country_code}`}
                  >
                    <TableCell className="font-semibold text-slate-900">
                      {slug ? (
                        <Link
                          href={`/${slug}`}
                          className="hover:text-[#2B479B] transition-colors"
                        >
                          {row.country_name ?? row.country_code}
                        </Link>
                      ) : (
                        (row.country_name ?? "—")
                      )}
                    </TableCell>
                    <TableCell className="text-right text-sm text-slate-700 font-medium tabular-nums">
                      {(row.total_leads ?? 0).toLocaleString()}
                    </TableCell>
                    <TableCell className="text-right text-sm text-slate-700 tabular-nums">
                      {(row.new_today ?? 0).toLocaleString()}
                    </TableCell>
                    <TableCell className="text-right text-sm text-slate-700 tabular-nums">
                      {formatPct(row.contacted_pct)}
                    </TableCell>
                    <TableCell className="text-right text-sm text-slate-700 tabular-nums">
                      {formatPct(row.converted_pct)}
                    </TableCell>
                    <TableCell className="text-right text-sm text-slate-700 tabular-nums">
                      {formatDuration(row.avg_response_seconds)}
                    </TableCell>
                    <TableCell className="text-center">
                      <span
                        className={cn(
                          "inline-block w-2.5 h-2.5 rounded-full",
                          STATUS_DOT[status],
                        )}
                        data-testid={`country-leaderboard-status-${row.country_code}`}
                        data-status={status}
                      />
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}

      {/* Legend — boundaries pulled from RESPONSE_STATUS_THRESHOLDS. */}
      <div className="px-6 py-3 border-t border-slate-100 flex items-center gap-6">
        <div className="flex items-center gap-1.5">
          <span
            className={cn("inline-block w-2 h-2 rounded-full", STATUS_DOT.green)}
          />
          <span className="text-[11px] text-slate-400">
            &lt; {thresholdMinutes(RESPONSE_STATUS_THRESHOLDS.green)} min
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          <span
            className={cn("inline-block w-2 h-2 rounded-full", STATUS_DOT.amber)}
          />
          <span className="text-[11px] text-slate-400">
            {thresholdMinutes(RESPONSE_STATUS_THRESHOLDS.green)} -{" "}
            {thresholdMinutes(RESPONSE_STATUS_THRESHOLDS.amber)} min
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          <span
            className={cn("inline-block w-2 h-2 rounded-full", STATUS_DOT.red)}
          />
          <span className="text-[11px] text-slate-400">
            &gt; {thresholdMinutes(RESPONSE_STATUS_THRESHOLDS.amber)} min
          </span>
        </div>
      </div>
    </div>
  );
}
