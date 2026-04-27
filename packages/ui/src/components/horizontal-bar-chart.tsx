import { cn } from "../lib/utils";

interface BarChartItem {
  label: string;
  value: number;
  color?: string;
}

interface HorizontalBarChartProps {
  items: BarChartItem[];
  barColor?: string;
  className?: string;
}

function HorizontalBarChart({
  items,
  barColor = "#2B479B",
  className,
}: HorizontalBarChartProps) {
  const maxValue = Math.max(...items.map((item) => item.value), 1);

  return (
    <div className={cn("space-y-4", className)}>
      {items.map((item) => {
        const widthPct = (item.value / maxValue) * 100;
        return (
          <div key={item.label} className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-[13px] text-slate-500">{item.label}</span>
              <span className="text-[13px] font-semibold text-slate-900 tabular-nums">
                {item.value.toLocaleString()}
              </span>
            </div>
            <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
              <div
                className="h-full rounded-full transition-all duration-500"
                style={{
                  width: `${widthPct}%`,
                  backgroundColor: item.color ?? barColor,
                }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}

export { HorizontalBarChart };
export type { HorizontalBarChartProps, BarChartItem };
