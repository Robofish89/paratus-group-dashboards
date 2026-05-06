import Link from "next/link";
import { cn } from "@repo/ui";
import type { GroupActivityRow } from "@repo/supabase/dal";

/**
 * "Recent group activity" panel for the HQ Overview. Surfaces the audit log
 * (Phase 6 plan 06-02) at group scope so the production-hardening work has
 * a visible home on the headline surface, not just buried in per-country
 * pages.
 *
 * Server Component — no realtime, no client state. Refresh comes for free
 * with `router.refresh()` triggered by the existing realtime broadcasts.
 */

interface RecentActivityCardProps {
  rows: GroupActivityRow[];
}

const ACTION_LABELS: Record<string, string> = {
  "lead.reassign": "Reassigned",
  "lead.complete": "Completed",
  "lead.callback": "Callback scheduled",
  "lead.no_answer": "No answer",
  "lead.contact": "First contact",
  "user_role.update": "User role updated",
};

const ACTION_COLOURS: Record<string, string> = {
  "lead.reassign": "bg-[#dbeafe] text-[#1d4ed8]",
  "lead.complete": "bg-[#d1fae5] text-[#065f46]",
  "lead.callback": "bg-[#fef3c7] text-[#92400e]",
  "lead.no_answer": "bg-[#f1f5f9] text-[#475569]",
  "lead.contact": "bg-[#dbeafe] text-[#1e40af]",
  "user_role.update": "bg-[#ede9fe] text-[#5b21b6]",
};

const ROLE_LABELS: Record<string, string> = {
  hq_admin: "HQ Admin",
  country_admin: "Country Admin",
  agent: "Agent",
  system: "System",
};

function formatRelativeTime(iso: string): string {
  const then = new Date(iso).getTime();
  const now = Date.now();
  const diffMs = Math.max(0, now - then);
  const sec = Math.floor(diffMs / 1000);
  if (sec < 60) return `${sec}s ago`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.floor(hr / 24);
  if (day < 30) return `${day}d ago`;
  return new Date(iso).toLocaleDateString();
}

export function RecentActivityCard({ rows }: RecentActivityCardProps) {
  return (
    <div
      className="bg-white rounded-xl border border-slate-100 overflow-hidden"
      data-testid="hq-recent-activity"
    >
      <div className="px-6 py-4 border-b border-slate-100 flex items-baseline justify-between">
        <h2 className="text-base font-semibold text-slate-900">
          Recent group activity
        </h2>
        <p className="text-[11px] text-slate-400 uppercase tracking-wider font-semibold">
          Audit log · live
        </p>
      </div>

      {rows.length === 0 ? (
        <p className="text-sm text-slate-400 py-12 text-center">
          No recorded activity yet — events appear as soon as agents act on
          leads.
        </p>
      ) : (
        <ul className="divide-y divide-slate-100">
          {rows.map((row) => {
            const slug = row.country_code.toLowerCase();
            const actionLabel = ACTION_LABELS[row.action] ?? row.action;
            const actionColour =
              ACTION_COLOURS[row.action] ?? "bg-slate-100 text-slate-600";
            const roleLabel = ROLE_LABELS[row.actor_role] ?? row.actor_role;
            const actor = row.actor_display_name ?? "—";
            return (
              <li
                key={row.id}
                className="px-6 py-3 flex items-center gap-4 text-sm hover:bg-slate-50/40"
              >
                <span
                  className={cn(
                    "inline-flex rounded-full px-2 py-0.5 text-[11px] font-medium shrink-0",
                    actionColour,
                  )}
                >
                  {actionLabel}
                </span>
                <Link
                  href={`/${slug}`}
                  className="text-slate-900 font-medium hover:text-[#2B479B] shrink-0"
                  title={`Open ${row.country_name ?? row.country_code} dashboard`}
                >
                  {row.country_name ?? row.country_code}
                </Link>
                <span className="text-slate-500 truncate flex-1 min-w-0">
                  {actor}{" "}
                  <span className="text-slate-300">·</span>{" "}
                  <span className="text-[11px] uppercase tracking-wider text-slate-400">
                    {roleLabel}
                  </span>
                </span>
                <Link
                  href={`/${slug}/audit`}
                  className="text-xs font-semibold text-slate-400 hover:text-[#2B479B] shrink-0"
                  title={new Date(row.created_at).toLocaleString()}
                >
                  {formatRelativeTime(row.created_at)}
                </Link>
              </li>
            );
          })}
        </ul>
      )}

      <div className="px-6 py-3 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-400">
        <span>Showing {rows.length} most recent events across the group</span>
        <span>Per-country drill-in via the country dashboard</span>
      </div>
    </div>
  );
}
