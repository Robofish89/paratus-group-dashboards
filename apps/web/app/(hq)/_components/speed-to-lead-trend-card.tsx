"use client";

import {
  AreaChart,
  Area,
  CartesianGrid,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { cn } from "@repo/ui";
import {
  RESPONSE_STATUS_THRESHOLDS,
  type GroupSpeedToLeadDay,
} from "@repo/supabase/schemas";

/**
 * 7-day group speed-to-lead trend. Recharts AreaChart with a reference line
 * at y=300 (the 5-minute target — DB stores seconds, not minutes; same
 * convention as Phase 4's `<SpeedToLeadChart>`).
 *
 * Only `median_seconds` is plotted in v1 (the mockup shows a single line);
 * `p75_seconds` is present in the data and ready for a v2 toggle.
 *
 * SSR pitfalls — same as Phase 4:
 *  - "use client" at top (Recharts is client-only).
 *  - `isAnimationActive={false}` to keep SSR + initial client render in sync.
 *  - Direct parent has explicit height so ResponsiveContainer doesn't
 *    collapse to 0×0 on first paint.
 *
 * Visual contract: matches `docs/design-reference/hq-dashboard.html` —
 * paratus-blue (#2B479B) stroke + gradient fill, dotted reference line.
 */

interface SpeedToLeadTrendCardProps {
  series: GroupSpeedToLeadDay[];
}

const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;

function dayLabel(iso: string): string {
  // The RPC emits a date string (UTC day boundary, plan 05-01). Parse as UTC
  // to keep the weekday stable across the 12-country tz set.
  const d = new Date(`${iso}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return iso;
  return DAY_LABELS[d.getUTCDay()] ?? iso;
}

function formatMSS(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.round(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

export function SpeedToLeadTrendCard({ series }: SpeedToLeadTrendCardProps) {
  const data = series.map((row) => ({
    day: dayLabel(row.day),
    median_seconds: row.median_seconds,
    p75_seconds: row.p75_seconds,
  }));

  return (
    <div
      className={cn("bg-white rounded-xl border border-slate-100 overflow-hidden")}
      data-testid="speed-to-lead-trend-card"
    >
      <div className="px-6 py-4 border-b border-slate-100">
        <h2 className="text-base font-semibold text-slate-900">
          Speed to Lead Trend
        </h2>
        <p className="text-xs text-slate-400 mt-0.5">
          Median response time - last 7 days
        </p>
      </div>
      <div className="px-6 py-5">
        {data.length === 0 ? (
          <p
            className="text-sm text-slate-400 py-8 text-center"
            data-testid="speed-to-lead-trend-empty"
          >
            No contacted leads in the last 7 days.
          </p>
        ) : (
          <div className="h-[220px]" data-testid="speed-to-lead-trend-chart">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart
                data={data}
                margin={{ top: 8, right: 8, left: 0, bottom: 0 }}
              >
                <defs>
                  <linearGradient id="hqSpeedGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#2B479B" stopOpacity={0.18} />
                    <stop offset="100%" stopColor="#2B479B" stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid
                  strokeDasharray="3 3"
                  stroke="#e2e8f0"
                  vertical={false}
                />
                <XAxis
                  dataKey="day"
                  axisLine={false}
                  tickLine={false}
                  tick={{ fontSize: 11, fill: "#94a3b8" }}
                />
                <YAxis
                  axisLine={false}
                  tickLine={false}
                  tick={{ fontSize: 10, fill: "#94a3b8" }}
                  tickFormatter={formatMSS}
                  width={40}
                />
                <Tooltip
                  formatter={(value) => [
                    typeof value === "number" ? formatMSS(value) : String(value),
                    "Median",
                  ]}
                  labelStyle={{ fontSize: 12, color: "#334155" }}
                  contentStyle={{
                    borderRadius: 8,
                    border: "1px solid #e2e8f0",
                    fontSize: 12,
                  }}
                />
                <ReferenceLine
                  y={RESPONSE_STATUS_THRESHOLDS.green}
                  stroke="#94a3b8"
                  strokeDasharray="3 3"
                  label={{
                    value: `${Math.round(
                      RESPONSE_STATUS_THRESHOLDS.green / 60,
                    )}m target`,
                    fontSize: 10,
                    fill: "#94a3b8",
                    position: "right",
                  }}
                />
                <Area
                  type="monotone"
                  dataKey="median_seconds"
                  stroke="#2B479B"
                  strokeWidth={2.5}
                  fill="url(#hqSpeedGrad)"
                  dot={{ r: 3, fill: "#2B479B" }}
                  activeDot={{ r: 5, stroke: "white", strokeWidth: 2 }}
                  isAnimationActive={false}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>
    </div>
  );
}
