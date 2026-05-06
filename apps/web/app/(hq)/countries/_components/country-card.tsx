import Link from "next/link";
import { cn } from "@repo/ui";
import {
  computeResponseStatus,
  type CountryDirectoryRow,
  type ResponseStatus,
} from "@repo/supabase/schemas";

interface CountryCardProps {
  row: CountryDirectoryRow;
}

const STATUS_DOT: Record<ResponseStatus, string> = {
  green: "bg-emerald-500",
  amber: "bg-amber-500",
  red: "bg-red-500",
};

function formatPct(value: number | null): string {
  if (value === null) return "—";
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

function CountryCodeBadge({ code }: { code: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center justify-center",
        "w-10 h-10 rounded-lg",
        "bg-[#2B479B]/10 text-[#2B479B]",
        "text-sm font-bold tracking-wider tabular-nums",
      )}
    >
      {code}
    </span>
  );
}

export function CountryCard({ row }: CountryCardProps) {
  const isComingSoon = row.status === "coming_soon";
  const slug = row.country_code.toLowerCase();
  const responseStatus = computeResponseStatus(row.avg_response_seconds);

  if (isComingSoon) {
    return (
      <div
        className={cn(
          "bg-white rounded-xl border border-slate-100 p-5",
          "flex flex-col gap-4",
          "opacity-75",
        )}
        data-testid={`country-card-${row.country_code}`}
        data-status="coming_soon"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <CountryCodeBadge code={row.country_code} />
            <div>
              <h3 className="text-base font-semibold text-slate-900">
                {row.country_name}
              </h3>
              <p className="text-xs text-slate-400 mt-0.5">{row.timezone}</p>
            </div>
          </div>
          <span
            className={cn(
              "inline-flex items-center gap-1.5",
              "px-2.5 py-1 rounded-full",
              "bg-slate-100 text-slate-600",
              "text-[11px] font-semibold uppercase tracking-wider",
            )}
          >
            Coming soon
          </span>
        </div>

        <p className="text-sm text-slate-500 leading-relaxed">
          Seeded in the data model. Activates on rollout — single status flip
          plus invite flow, no schema change required.
        </p>

        <div className="border-t border-slate-100 pt-3 flex items-center justify-between">
          <span className="text-xs text-slate-400">
            {row.country_admin_count} country admin
            {row.country_admin_count === 1 ? "" : "s"} ·{" "}
            {row.agent_count} agent{row.agent_count === 1 ? "" : "s"}
          </span>
          <span className="text-xs text-slate-300">—</span>
        </div>
      </div>
    );
  }

  return (
    <div
      className={cn(
        "bg-white rounded-xl border border-slate-100 p-5",
        "flex flex-col gap-4",
        "transition-shadow duration-200 hover:shadow-md",
      )}
      data-testid={`country-card-${row.country_code}`}
      data-status="active"
      data-response-status={responseStatus}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <CountryCodeBadge code={row.country_code} />
          <div>
            <h3 className="text-base font-semibold text-slate-900">
              {row.country_name}
            </h3>
            <p className="text-xs text-slate-400 mt-0.5">{row.timezone}</p>
          </div>
        </div>
        <span
          className={cn(
            "inline-flex items-center gap-1.5",
            "px-2.5 py-1 rounded-full",
            "bg-emerald-50 text-emerald-700",
            "text-[11px] font-semibold uppercase tracking-wider",
          )}
        >
          <span
            className={cn(
              "inline-block w-1.5 h-1.5 rounded-full",
              STATUS_DOT[responseStatus],
            )}
          />
          Active
        </span>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <p className="text-[11px] font-semibold tracking-[0.1em] text-slate-400 uppercase mb-1">
            Total Leads
          </p>
          <p className="text-2xl font-bold text-slate-900 tabular-nums">
            {(row.total_leads ?? 0).toLocaleString()}
          </p>
        </div>
        <div>
          <p className="text-[11px] font-semibold tracking-[0.1em] text-slate-400 uppercase mb-1">
            New Today
          </p>
          <p className="text-2xl font-bold text-[#2B479B] tabular-nums">
            {(row.new_today ?? 0).toLocaleString()}
          </p>
        </div>
        <div>
          <p className="text-[11px] font-semibold tracking-[0.1em] text-slate-400 uppercase mb-1">
            Contacted
          </p>
          <p className="text-base font-semibold text-slate-700 tabular-nums">
            {formatPct(row.contacted_pct)}
          </p>
        </div>
        <div>
          <p className="text-[11px] font-semibold tracking-[0.1em] text-slate-400 uppercase mb-1">
            Avg Response
          </p>
          <p className="text-base font-semibold text-slate-700 tabular-nums">
            {formatDuration(row.avg_response_seconds)}
          </p>
        </div>
      </div>

      <div className="border-t border-slate-100 pt-3 flex items-center justify-between">
        <span className="text-xs text-slate-500">
          {row.country_admin_count} country admin
          {row.country_admin_count === 1 ? "" : "s"} ·{" "}
          {row.agent_count} active agent{row.agent_count === 1 ? "" : "s"}
        </span>
        <Link
          href={`/${slug}`}
          className={cn(
            "inline-flex items-center gap-1",
            "text-xs font-semibold text-[#2B479B]",
            "hover:text-[#1e3577] transition-colors",
          )}
        >
          View dashboard
          <span aria-hidden>→</span>
        </Link>
      </div>
    </div>
  );
}
