import Link from "next/link";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@repo/ui";
import type { AuditRow } from "@repo/supabase/dal";

/**
 * Plan-06-02 audit log table — striped AMA-mirror primitive with a
 * `<details>` drill-down for the JSON diff (zero-JS expand). Server
 * Component because every row's content is server-rendered; no realtime,
 * no client state.
 */

interface AuditTableProps {
  rows: AuditRow[];
  actorMeta: Array<{ user_id: string; display_name: string | null }>;
  countryName: string;
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
  "lead.reassign": "bg-[#dbeafe] text-[#1d4ed8]",       // blue family
  "lead.complete": "bg-[#d1fae5] text-[#065f46]",       // emerald — symmetric "done" colour
  "lead.callback": "bg-[#fef3c7] text-[#92400e]",       // amber
  "lead.no_answer": "bg-[#f1f5f9] text-[#475569]",      // slate
  "lead.contact": "bg-[#dbeafe] text-[#1e40af]",        // blue (first-touch)
  "user_role.update": "bg-[#ede9fe] text-[#5b21b6]",    // violet
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
  const diffMs = now - then;
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

export function AuditTable({
  rows,
  actorMeta,
  countryName,
  countrySlug,
}: AuditTableProps) {
  const actorById = new Map(
    actorMeta.map((a) => [a.user_id, a.display_name ?? null]),
  );

  if (rows.length === 0) {
    return (
      <div className="rounded-lg border border-slate-200 bg-white px-6 py-16 text-center text-sm text-slate-500">
        No audit entries yet for {countryName}.
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-slate-200 bg-white overflow-hidden">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>When</TableHead>
            <TableHead>Actor</TableHead>
            <TableHead>Action</TableHead>
            <TableHead>Target</TableHead>
            <TableHead>Diff</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row) => {
            const actorName =
              row.actor_id && actorById.get(row.actor_id)
                ? actorById.get(row.actor_id)
                : null;
            const roleLabel =
              ROLE_LABELS[row.actor_role] ?? row.actor_role;
            const actionLabel = ACTION_LABELS[row.action] ?? row.action;
            const actionColour =
              ACTION_COLOURS[row.action] ?? "bg-slate-100 text-slate-600";
            const targetIsLead = row.target_type === "lead";
            return (
              <TableRow
                key={row.id}
                className="hover:bg-slate-50/40"
              >
                <TableCell className="align-top">
                  <span title={new Date(row.created_at).toLocaleString()}>
                    {formatRelativeTime(row.created_at)}
                  </span>
                </TableCell>
                <TableCell className="align-top">
                  <div className="flex flex-col">
                    <span className="text-[13px] text-slate-900">
                      {actorName ?? "—"}
                    </span>
                    <span className="mt-0.5 inline-flex w-fit rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-slate-500">
                      {roleLabel}
                    </span>
                  </div>
                </TableCell>
                <TableCell className="align-top">
                  <span
                    className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-medium ${actionColour}`}
                  >
                    {actionLabel}
                  </span>
                </TableCell>
                <TableCell className="align-top">
                  {targetIsLead ? (
                    <Link
                      href={`/${countrySlug}/leads?q=${encodeURIComponent(
                        row.target_id,
                      )}`}
                      className="text-[#2B479B] hover:underline"
                    >
                      {row.target_id.slice(0, 8)}
                    </Link>
                  ) : (
                    <span className="text-slate-500">
                      {row.target_type}: {row.target_id.slice(0, 8)}
                    </span>
                  )}
                </TableCell>
                <TableCell className="align-top">
                  <details className="group">
                    <summary className="cursor-pointer text-[#2B479B] hover:underline list-none">
                      <span className="group-open:hidden">Show</span>
                      <span className="hidden group-open:inline">Hide</span>
                    </summary>
                    <pre className="mt-2 max-w-md overflow-x-auto rounded bg-slate-50 p-2 text-[11px] leading-snug text-slate-700">
                      {JSON.stringify(row.diff, null, 2)}
                    </pre>
                  </details>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
