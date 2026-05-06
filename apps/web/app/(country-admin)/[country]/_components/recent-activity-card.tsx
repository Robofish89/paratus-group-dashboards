import Link from "next/link";
import { cn } from "@repo/ui";
import type { GroupActivityRow } from "@repo/supabase/dal";

/**
 * Compact "Recent activity" teaser for the country-admin Overview. Shows
 * the last few audit-log events for this country with a link through to
 * the full audit page (`/<slug>/audit`). Mirrors the HQ Overview's
 * Recent Activity panel but hides the country column (every row is the
 * same country here) and surfaces the country audit page as the canonical
 * deep-dive.
 *
 * Server Component — no realtime, no client state. Re-renders for free
 * with the existing realtime broadcast → router.refresh() loop.
 */

interface CountryRecentActivityCardProps {
  rows: GroupActivityRow[];
  countrySlug: string;
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

export function CountryRecentActivityCard({
  rows,
  countrySlug,
}: CountryRecentActivityCardProps) {
  return (
    <div
      className="bg-white rounded-xl border border-slate-100 overflow-hidden"
      data-testid="country-recent-activity"
    >
      <div className="px-6 py-4 border-b border-slate-100 flex items-baseline justify-between">
        <h2 className="text-base font-semibold text-slate-900">
          Recent activity
        </h2>
        <Link
          href={`/${countrySlug}/audit`}
          className="text-xs font-semibold text-[#2B479B] hover:text-[#1e3577]"
        >
          View all →
        </Link>
      </div>

      {rows.length === 0 ? (
        <p className="text-sm text-slate-400 py-10 text-center">
          No recorded activity yet — events appear as soon as the team acts on
          leads.
        </p>
      ) : (
        <ul className="divide-y divide-slate-100">
          {rows.map((row) => {
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
                <span className="text-slate-700 truncate flex-1 min-w-0">
                  {actor}{" "}
                  <span className="text-slate-300">·</span>{" "}
                  <span className="text-[11px] uppercase tracking-wider text-slate-400">
                    {roleLabel}
                  </span>
                </span>
                <span
                  className="text-xs text-slate-400 shrink-0"
                  title={new Date(row.created_at).toLocaleString()}
                >
                  {formatRelativeTime(row.created_at)}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
