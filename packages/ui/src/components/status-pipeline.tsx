import { cn } from "../lib/utils";
import { STATUS_STYLES } from "./status-badge";

type CallbackStatus = "pending" | "assigned" | "in_progress" | "resolved" | "not_resolved" | "no_answer" | "closed";

interface PipelineItem {
  status: CallbackStatus;
  count: number;
}

interface StatusPipelineProps {
  items: PipelineItem[];
  className?: string;
}

function StatusPipeline({ items, className }: StatusPipelineProps) {
  return (
    <div className={cn("flex flex-wrap gap-3", className)}>
      {items.map((item) => {
        const style = STATUS_STYLES[item.status] ?? STATUS_STYLES.pending;
        return (
          <div
            key={item.status}
            className={cn("flex items-center gap-2 px-3.5 py-2.5 rounded-lg", style.bg)}
          >
            <div className={cn("w-2 h-2 rounded-full", style.dot)} />
            <span className={cn("text-sm font-bold tabular-nums", style.text)}>
              {item.count}
            </span>
            <span className={cn("text-xs opacity-70", style.text)}>
              {style.label}
            </span>
          </div>
        );
      })}
    </div>
  );
}

export { StatusPipeline };
export type { StatusPipelineProps, PipelineItem };
