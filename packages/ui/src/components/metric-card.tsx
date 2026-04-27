import { cn } from "../lib/utils";

const ACCENT_COLORS = [
  "#3B82F6", // blue
  "#8B5CF6", // violet
  "#10B981", // emerald
  "#F59E0B", // amber
  "#14B8A6", // teal
];

interface MetricCardTrend {
  value: string;
  direction: "up" | "down";
  label: string;
}

interface MetricCardProps {
  label: string;
  value: string | number;
  subtext?: string;
  trend?: MetricCardTrend;
  accentIndex?: number;
  className?: string;
}

function MetricCard({
  label,
  value,
  subtext,
  trend,
  accentIndex = 0,
  className,
}: MetricCardProps) {
  const accentColor = ACCENT_COLORS[accentIndex % ACCENT_COLORS.length];

  return (
    <div
      className={cn(
        "bg-white rounded-xl border border-slate-200/60 p-5 relative overflow-hidden shadow-sm",
        className
      )}
    >
      {/* Accent bar — fully inline, always renders */}
      <div
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          height: "4px",
          backgroundColor: accentColor,
        }}
      />

      <p className="text-[10px] font-semibold uppercase tracking-[0.06em] text-slate-400 mb-2 mt-0.5">
        {label}
      </p>
      <p className="text-[28px] font-bold text-slate-900 tracking-tight tabular-nums leading-none">
        {value}
      </p>
      {trend && (
        <p className="mt-1.5 text-[11px] text-slate-500 flex items-center gap-1">
          <span
            className="font-semibold"
            style={{ color: trend.direction === "up" ? "#ef4444" : "#10b981" }}
          >
            {trend.direction === "up" ? "↑" : "↓"} {trend.value}
          </span>
          {trend.label}
        </p>
      )}
      {!trend && subtext && (
        <p className="mt-1.5 text-[11px] text-slate-500">{subtext}</p>
      )}
    </div>
  );
}

export { MetricCard };
export type { MetricCardProps, MetricCardTrend };
