import { cn } from "../lib/utils";

const SEVERITY_BADGE_STYLES: Record<string, { bg: string; text: string; border: string }> = {
  critical: { bg: "bg-red-50", text: "text-red-700", border: "border-red-200" },
  major: { bg: "bg-amber-50", text: "text-amber-700", border: "border-amber-200" },
  minor: { bg: "bg-blue-50", text: "text-blue-700", border: "border-blue-200" },
};

const STATUS_DOT_COLORS: Record<string, string> = {
  investigating: "bg-red-500",
  identified: "bg-amber-500",
  monitoring: "bg-blue-500",
  resolved: "bg-emerald-500",
};

interface OutageCardProps {
  id: number;
  service: string;
  severity: string;
  affectedArea: string;
  description: string;
  status: string;
  startedAt: string;
  onClick?: (id: number) => void;
  className?: string;
}

function formatTimestamp(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString("en-ZA", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatStatus(status: string): string {
  return status.charAt(0).toUpperCase() + status.slice(1);
}

function OutageCard({
  id,
  service,
  severity,
  affectedArea,
  description,
  status,
  startedAt,
  onClick,
  className,
}: OutageCardProps) {
  const sevStyle = SEVERITY_BADGE_STYLES[severity] ?? SEVERITY_BADGE_STYLES["minor"];
  const dotColor = STATUS_DOT_COLORS[status] ?? "bg-slate-400";

  return (
    <div
      onClick={() => onClick?.(id)}
      className={cn(
        "bg-white rounded-xl border border-slate-200 shadow-sm p-5 flex flex-col hover:shadow-md transition-shadow",
        onClick && "cursor-pointer",
        className
      )}
    >
      <div className="flex items-start justify-between gap-2 mb-3">
        <h3 className="text-[15px] font-bold text-slate-900 leading-tight">{service}</h3>
        <span className={cn("inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-semibold border shrink-0", sevStyle.bg, sevStyle.text, sevStyle.border)}>
          {severity.charAt(0).toUpperCase() + severity.slice(1)}
        </span>
      </div>
      <div className="space-y-2 flex-1">
        <div className="flex items-center gap-2 text-[13px] text-slate-600">
          <svg className="w-4 h-4 text-slate-400 shrink-0" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 10.5a3 3 0 11-6 0 3 3 0 016 0z" />
            <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 0115 0z" />
          </svg>
          {affectedArea}
        </div>
        {description && (
          <p className="text-[13px] text-slate-500 line-clamp-2 pl-6">{description}</p>
        )}
      </div>
      <div className="flex items-center justify-between mt-3 pt-3 border-t border-slate-100">
        <div className="flex items-center gap-1.5">
          <span className={cn("w-2 h-2 rounded-full", dotColor)} />
          <span className="text-[12px] font-medium text-slate-600">{formatStatus(status)}</span>
        </div>
        <span className="text-[11px] text-slate-400">{formatTimestamp(startedAt)}</span>
      </div>
    </div>
  );
}

export { OutageCard, SEVERITY_BADGE_STYLES };
export type { OutageCardProps };
