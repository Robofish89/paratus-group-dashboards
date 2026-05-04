"use client";

import {
  AreaChart,
  Area,
  ReferenceLine,
  ResponsiveContainer,
} from "recharts";
import type { SpeedToLeadDay } from "@repo/supabase/schemas";

/**
 * 7-day speed-to-lead sparkline. Recharts AreaChart with a reference line at
 * y=300 (the 5-minute target — DB stores seconds, so 300 = 5 min).
 *
 * SSR / sizing pitfalls:
 *  - "use client" at the top of the file (Recharts is a client-only lib).
 *  - Direct parent has `h-12` (48px) so ResponsiveContainer doesn't collapse
 *    to 0×0 on first paint.
 *  - `isAnimationActive={false}` so SSR + initial client render produce the
 *    same DOM (avoids hydration jitter).
 *
 * Visual contract: matches the green sparkline in
 * `docs/design-reference/country-admin-dashboard.html` — emerald stroke +
 * gradient fill, dotted grey reference line.
 */

interface SpeedToLeadChartProps {
  data: SpeedToLeadDay[];
}

export function SpeedToLeadChart({ data }: SpeedToLeadChartProps) {
  if (data.length === 0) {
    return (
      <div
        className="h-12 flex items-center text-xs text-slate-400"
        data-testid="speed-to-lead-sparkline"
        data-empty="true"
      >
        No data
      </div>
    );
  }

  return (
    <div className="h-12" data-testid="speed-to-lead-sparkline">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart
          data={data}
          margin={{ top: 4, right: 0, left: 0, bottom: 0 }}
        >
          <defs>
            <linearGradient id="speedGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#10b981" stopOpacity={0.15} />
              <stop offset="100%" stopColor="#10b981" stopOpacity={0.02} />
            </linearGradient>
          </defs>
          <ReferenceLine
            y={300}
            stroke="#94a3b8"
            strokeDasharray="3 3"
          />
          <Area
            type="monotone"
            dataKey="median_seconds"
            stroke="#10b981"
            strokeWidth={2.5}
            fill="url(#speedGrad)"
            dot={{ r: 3, fill: "#10b981" }}
            activeDot={{ r: 4, stroke: "white", strokeWidth: 2 }}
            isAnimationActive={false}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
