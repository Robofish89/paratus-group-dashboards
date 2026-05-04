"use client";

import { cn } from "@repo/ui";
import type { CountrySpeedToLeadToday } from "@repo/supabase/dal";
import type { SpeedToLeadDay } from "@repo/supabase/schemas";
import { SpeedToLeadChart } from "./speed-to-lead-chart";

/**
 * Speed-to-lead gauge tile + 7-day sparkline. Custom SVG gauge ring
 * (~12 lines of stroke-dasharray math); the sparkline is Recharts via
 * `<SpeedToLeadChart>`.
 *
 * Visual contract: matches `docs/design-reference/country-admin-dashboard.html`
 * — gauge at the left (160×160), text + sparkline at the right.
 */

const RING_RADIUS = 60;
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS; // ≈ 376.99
const TARGET_SECONDS = 300; // 5 minutes — DB stores seconds.

interface SpeedToLeadCardProps {
  today: CountrySpeedToLeadToday | null;
  series: SpeedToLeadDay[];
}

function formatResponse(seconds: number | null | undefined): string {
  if (seconds === null || seconds === undefined) return "—";
  const mins = Math.floor(seconds / 60);
  const secs = Math.round(seconds % 60);
  if (mins > 0) {
    return secs > 0 ? `${mins}m ${secs}s` : `${mins}m`;
  }
  return `${secs}s`;
}

export function SpeedToLeadCard({ today, series }: SpeedToLeadCardProps) {
  const onTargetPctRaw = today?.on_target_pct;
  const onTargetPct = onTargetPctRaw === null || onTargetPctRaw === undefined
    ? null
    : Math.round(onTargetPctRaw);
  const dashOffset =
    onTargetPct === null
      ? RING_CIRCUMFERENCE
      : RING_CIRCUMFERENCE * (1 - onTargetPct / 100);

  const avgResponseSeconds = today?.avg_response_seconds ?? null;
  const responseText = formatResponse(avgResponseSeconds);
  const onTargetVsAvg =
    avgResponseSeconds !== null && avgResponseSeconds <= TARGET_SECONDS;

  return (
    <div
      className={cn("bg-white rounded-xl p-6 border border-slate-100")}
      data-testid="speed-to-lead-card"
    >
      <h2 className="text-base font-semibold text-slate-900 mb-4">
        Speed to Lead
      </h2>
      <div className="flex flex-col sm:flex-row items-center gap-6 sm:gap-8">
        {/* Gauge ring */}
        <div className="relative shrink-0">
          <svg
            width="160"
            height="160"
            viewBox="0 0 160 160"
            data-testid="speed-to-lead-gauge"
          >
            {/* Background ring */}
            <circle
              cx="80"
              cy="80"
              r={RING_RADIUS}
              fill="none"
              stroke="#f1f5f9"
              strokeWidth="14"
            />
            {/* Progress ring */}
            <circle
              cx="80"
              cy="80"
              r={RING_RADIUS}
              fill="none"
              stroke="#10b981"
              strokeWidth="14"
              strokeLinecap="round"
              strokeDasharray={RING_CIRCUMFERENCE}
              strokeDashoffset={dashOffset}
              transform="rotate(-90 80 80)"
            />
            {/* Centre text */}
            {onTargetPct === null ? (
              <text
                x="80"
                y="86"
                textAnchor="middle"
                fontSize="20"
                fontWeight="600"
                fill="#94a3b8"
              >
                —
              </text>
            ) : (
              <>
                <text
                  x="80"
                  y="78"
                  textAnchor="middle"
                  fontSize="36"
                  fontWeight="700"
                  fill="#0f172a"
                >
                  {onTargetPct}
                </text>
                <text
                  x="116"
                  y="64"
                  textAnchor="middle"
                  fontSize="16"
                  fontWeight="600"
                  fill="#0f172a"
                >
                  %
                </text>
                <text
                  x="80"
                  y="100"
                  textAnchor="middle"
                  fontSize="11"
                  fontWeight="500"
                  fill="#94a3b8"
                >
                  on target
                </text>
              </>
            )}
          </svg>
        </div>

        {/* Details */}
        <div className="flex-1 w-full">
          <p className="text-sm text-slate-600 leading-relaxed">
            Leads contacted within{" "}
            <span className="font-semibold text-slate-800">5 minutes</span> of
            submission
          </p>

          <div className="mt-4 flex items-center gap-6">
            <div>
              <p className="text-[10px] font-semibold tracking-[0.06em] text-slate-400 uppercase mb-0.5">
                Avg Response
              </p>
              <p
                className={cn(
                  "text-lg font-bold tabular-nums",
                  avgResponseSeconds === null
                    ? "text-slate-400"
                    : onTargetVsAvg
                      ? "text-emerald-600"
                      : "text-red-500",
                )}
              >
                {responseText}
              </p>
            </div>
            <div>
              <p className="text-[10px] font-semibold tracking-[0.06em] text-slate-400 uppercase mb-0.5">
                Target
              </p>
              <p className="text-lg font-bold text-slate-700 tabular-nums">
                5m
              </p>
            </div>
          </div>

          <div className="mt-4">
            <p className="text-[10px] font-semibold tracking-[0.06em] text-slate-400 uppercase mb-2">
              Last 7 days trend
            </p>
            <SpeedToLeadChart data={series} />
          </div>
        </div>
      </div>
    </div>
  );
}
