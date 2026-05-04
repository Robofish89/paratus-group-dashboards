import { cn } from "@repo/ui";
import type { StatusPipelineTodayItem } from "@repo/supabase/dal";

/**
 * Today's lead-status pipeline funnel. The DB returns five rows (one per
 * `lead_status` enum value, including `qualified` for analytics back-compat);
 * we render five segments with decreasing widths matching the visual contract
 * in `docs/design-reference/country-admin-dashboard.html`.
 *
 * Width derivation: each segment is width-scaled by its share of the
 * top-of-funnel ("new") count. The mockup hardcodes 100/85/60/40 — the live
 * implementation derives the same shape from data so an unbalanced country
 * still reads correctly.
 *
 * Min width 25% so a small segment is still readable.
 */

const SEGMENTS = [
  {
    status: "new" as const,
    label: "New",
    bg: "bg-blue-50",
    border: "border-blue-100",
    dot: "bg-blue-500",
    text: "text-blue-600",
  },
  {
    status: "contacted" as const,
    label: "Contacted",
    bg: "bg-orange-50",
    border: "border-orange-100",
    dot: "bg-orange-400",
    text: "text-orange-500",
  },
  {
    status: "qualified" as const,
    label: "Qualified",
    bg: "bg-violet-50",
    border: "border-violet-100",
    dot: "bg-violet-500",
    text: "text-violet-600",
  },
  {
    status: "converted" as const,
    label: "Converted",
    bg: "bg-emerald-50",
    border: "border-emerald-100",
    dot: "bg-emerald-500",
    text: "text-emerald-600",
  },
  {
    status: "lost" as const,
    label: "Lost",
    bg: "bg-red-50",
    border: "border-red-100",
    dot: "bg-red-400",
    text: "text-red-500",
  },
];

interface StatusPipelineCardProps {
  items: StatusPipelineTodayItem[];
}

export function StatusPipelineCard({ items }: StatusPipelineCardProps) {
  const counts = new Map<string, number>();
  for (const row of items) {
    if (row.status) counts.set(row.status, row.count ?? 0);
  }

  const newCount = counts.get("new") ?? 0;
  const top = Math.max(newCount, 1); // avoid divide-by-zero
  const totalForPct = newCount > 0 ? newCount : 0;

  return (
    <div
      className={cn("bg-white rounded-xl p-6 border border-slate-100")}
      data-testid="status-pipeline-card"
    >
      <h2 className="text-base font-semibold text-slate-900 mb-4">
        Lead Status Pipeline
      </h2>

      {/* Legend (mirrors mockup) */}
      <div className="flex items-center gap-5 mb-6 flex-wrap">
        {SEGMENTS.map((seg) => (
          <div key={seg.status} className="flex items-center gap-1.5">
            <span
              className={cn("w-2.5 h-2.5 rounded-full", seg.dot)}
            />
            <span className="text-xs text-slate-500 font-medium">
              {seg.label}
            </span>
          </div>
        ))}
      </div>

      <div className="space-y-3">
        {SEGMENTS.map((seg, idx) => {
          const count = counts.get(seg.status) ?? 0;
          const widthPct = idx === 0
            ? 100
            : Math.max(25, Math.min(100, (count / top) * 100));
          const sharePct =
            totalForPct > 0 && idx > 0
              ? ((count / totalForPct) * 100).toFixed(1)
              : null;
          return (
            <div
              key={seg.status}
              data-testid={`status-pipeline-segment-${seg.status}`}
              className={cn(idx === 0 ? "" : "flex justify-center")}
            >
              <div
                className={cn(
                  "rounded-lg px-4 py-3 flex items-center justify-between border",
                  seg.bg,
                  seg.border,
                )}
                style={{ width: `${widthPct}%` }}
              >
                <div className="flex items-center gap-2">
                  <span className={cn("w-3 h-3 rounded-full", seg.dot)} />
                  <span className="text-sm font-medium text-slate-700">
                    {seg.label}
                  </span>
                </div>
                <div className="text-right">
                  <span
                    className={cn(
                      "text-xl font-bold tabular-nums",
                      seg.text,
                    )}
                  >
                    {count}
                  </span>
                  {sharePct !== null && (
                    <span className="text-xs text-slate-400 ml-1.5">
                      {sharePct}%
                    </span>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <div className="flex justify-center mt-4">
        <p className="text-xs text-slate-400">
          Pipeline narrows from capture to conversion
        </p>
      </div>
    </div>
  );
}
