import { cn } from "../lib/utils";

type CallbackStatus = "pending" | "assigned" | "in_progress" | "resolved" | "not_resolved" | "no_answer" | "closed";

const STATUS_STYLES: Record<CallbackStatus, { bg: string; text: string; dot: string; label: string }> = {
  pending:      { bg: "bg-[#eff6ff]",  text: "text-[#1e40af]",  dot: "bg-[#3b82f6]",  label: "Pending" },
  assigned:     { bg: "bg-[#fef3c7]",  text: "text-[#92400e]",  dot: "bg-[#f59e0b]",  label: "Assigned" },
  in_progress:  { bg: "bg-[#fff7ed]",  text: "text-[#9a3412]",  dot: "bg-[#f97316]",  label: "In Progress" },
  resolved:     { bg: "bg-[#f0fdf4]",  text: "text-[#15803d]",  dot: "bg-[#10b981]",  label: "Resolved" },
  not_resolved: { bg: "bg-[#fef2f2]",  text: "text-[#991b1b]",  dot: "bg-[#ef4444]",  label: "Not Resolved" },
  no_answer:    { bg: "bg-[#f8fafc]",  text: "text-[#475569]",  dot: "bg-[#94a3b8]",  label: "No Answer" },
  closed:       { bg: "bg-[#f9fafb]",  text: "text-[#6b7280]",  dot: "bg-[#9ca3af]",  label: "Closed" },
};

interface StatusBadgeProps {
  status: CallbackStatus;
  className?: string;
}

function StatusBadge({ status, className }: StatusBadgeProps) {
  const style = STATUS_STYLES[status] ?? STATUS_STYLES.pending;

  return (
    <span className={cn("inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-medium", style.bg, style.text, className)}>
      <span className={cn("w-1.5 h-1.5 rounded-full", style.dot)} />
      {style.label}
    </span>
  );
}

export { StatusBadge, STATUS_STYLES };
export type { StatusBadgeProps };
