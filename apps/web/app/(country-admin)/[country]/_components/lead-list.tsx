"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ChevronLeft, ChevronRight, Download, MoreVertical } from "lucide-react";
import {
  Button,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  cn,
} from "@repo/ui";
import { ReassignDialog } from "./reassign-dialog";

/**
 * Filterable + paginated lead list for the country admin surface (plan
 * 04-03). Server component fetches the page; this client component renders
 * the filter row, table, pagination, and the per-row reassign dialog.
 *
 * URL state contract (driven via router.replace, not router.push, so the
 * back button doesn't accumulate filter steps):
 *   ?status, ?service, ?from, ?to, ?q, ?page
 *
 * Reassignment posts to /api/country-admin/reassign — on success the dialog
 * calls router.refresh() so the list re-renders with the new assignee from
 * the server view.
 *
 * Realtime broadcast is intentionally NOT subscribed here: pagination +
 * concurrent inserts shifts indices (RESEARCH.md pitfall 8). The dashboard
 * tiles still bump live; admins can refresh the list manually.
 */

export type LeadStatus = "new" | "contacted" | "qualified" | "converted" | "lost";

export interface LeadListRow {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  status: LeadStatus;
  form_slug: string;
  service_label: string;
  assigned_to: string | null;
  assigned_to_name: string | null;
  country_code: string;
  created_at: string;
}

export interface LeadListAgent {
  user_id: string;
  display_name: string;
}

interface LeadListProps {
  rows: LeadListRow[];
  total: number;
  page: number;
  pageSize: number;
  agents: LeadListAgent[];
  formOptions: Array<{ slug: string; label: string }>;
  filters: {
    status: LeadStatus | null;
    service: string | null;
    from: string | null;
    to: string | null;
    q: string | null;
  };
  exportHref: string;
}

const STATUS_STYLES: Record<
  LeadStatus,
  { bg: string; text: string; dot: string; label: string }
> = {
  new: {
    bg: "bg-blue-50",
    text: "text-blue-700",
    dot: "bg-blue-500",
    label: "New",
  },
  contacted: {
    bg: "bg-orange-50",
    text: "text-orange-700",
    dot: "bg-orange-400",
    label: "Contacted",
  },
  qualified: {
    bg: "bg-violet-50",
    text: "text-violet-700",
    dot: "bg-violet-500",
    label: "Qualified",
  },
  converted: {
    bg: "bg-emerald-50",
    text: "text-emerald-700",
    dot: "bg-emerald-500",
    label: "Converted",
  },
  lost: {
    bg: "bg-rose-50",
    text: "text-rose-700",
    dot: "bg-rose-400",
    label: "Lost",
  },
};

function LeadStatusPill({ status }: { status: LeadStatus }) {
  const s = STATUS_STYLES[status];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-medium",
        s.bg,
        s.text,
      )}
    >
      <span className={cn("w-1.5 h-1.5 rounded-full", s.dot)} />
      {s.label}
    </span>
  );
}

function fmtDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

const ALL_STATUSES_VALUE = "__all__";
const ALL_SERVICES_VALUE = "__all__";

export function LeadList({
  rows,
  total,
  page,
  pageSize,
  agents,
  formOptions,
  filters,
  exportHref,
}: LeadListProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [reassignTarget, setReassignTarget] = useState<LeadListRow | null>(
    null,
  );

  // Local input state for the search box — debounced via Apply on Enter or
  // blur so we don't fire a navigation per keystroke.
  const [searchInput, setSearchInput] = useState(filters.q ?? "");
  const [fromInput, setFromInput] = useState(filters.from ?? "");
  const [toInput, setToInput] = useState(filters.to ?? "");

  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const fromIndex = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const toIndex = Math.min(total, page * pageSize);

  function pushFilters(next: Partial<LeadListProps["filters"]> & {
    page?: number;
  }) {
    const merged = {
      status: filters.status,
      service: filters.service,
      from: filters.from,
      to: filters.to,
      q: filters.q,
      ...next,
    };
    const params = new URLSearchParams();
    if (merged.status) params.set("status", merged.status);
    if (merged.service) params.set("service", merged.service);
    if (merged.from) params.set("from", merged.from);
    if (merged.to) params.set("to", merged.to);
    if (merged.q) params.set("q", merged.q);
    const targetPage = next.page ?? 1;
    if (targetPage > 1) params.set("page", String(targetPage));
    const qs = params.toString();
    startTransition(() => {
      router.replace(qs ? `?${qs}` : "?", { scroll: false });
    });
  }

  function applySearch() {
    const trimmed = searchInput.trim();
    pushFilters({ q: trimmed.length > 0 ? trimmed : null, page: 1 });
  }

  function applyDates() {
    pushFilters({
      from: fromInput || null,
      to: toInput || null,
      page: 1,
    });
  }

  function clearFilters() {
    setSearchInput("");
    setFromInput("");
    setToInput("");
    startTransition(() => {
      router.replace("?", { scroll: false });
    });
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Filter row */}
      <div className="bg-white rounded-xl p-4 border border-slate-100 flex flex-wrap items-end gap-3">
        <div className="flex flex-col gap-1">
          <label className="text-[11px] font-semibold tracking-wider text-slate-400 uppercase">
            Status
          </label>
          <Select
            value={filters.status ?? ALL_STATUSES_VALUE}
            onValueChange={(v) =>
              pushFilters({
                status: v === ALL_STATUSES_VALUE ? null : (v as LeadStatus),
                page: 1,
              })
            }
          >
            <SelectTrigger className="w-44">
              <SelectValue placeholder="All statuses" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL_STATUSES_VALUE}>All statuses</SelectItem>
              <SelectItem value="new">New</SelectItem>
              <SelectItem value="contacted">Contacted</SelectItem>
              <SelectItem value="qualified">Qualified</SelectItem>
              <SelectItem value="converted">Converted</SelectItem>
              <SelectItem value="lost">Lost</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="flex flex-col gap-1">
          <label className="text-[11px] font-semibold tracking-wider text-slate-400 uppercase">
            Service
          </label>
          <Select
            value={filters.service ?? ALL_SERVICES_VALUE}
            onValueChange={(v) =>
              pushFilters({
                service: v === ALL_SERVICES_VALUE ? null : v,
                page: 1,
              })
            }
          >
            <SelectTrigger className="w-52">
              <SelectValue placeholder="All services" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL_SERVICES_VALUE}>All services</SelectItem>
              {formOptions.map((f) => (
                <SelectItem key={f.slug} value={f.slug}>
                  {f.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex flex-col gap-1">
          <label className="text-[11px] font-semibold tracking-wider text-slate-400 uppercase">
            From
          </label>
          <Input
            type="date"
            value={fromInput}
            onChange={(e) => setFromInput(e.target.value)}
            onBlur={applyDates}
            className="w-40"
          />
        </div>

        <div className="flex flex-col gap-1">
          <label className="text-[11px] font-semibold tracking-wider text-slate-400 uppercase">
            To
          </label>
          <Input
            type="date"
            value={toInput}
            onChange={(e) => setToInput(e.target.value)}
            onBlur={applyDates}
            className="w-40"
          />
        </div>

        <div className="flex flex-col gap-1 flex-1 min-w-[220px]">
          <label className="text-[11px] font-semibold tracking-wider text-slate-400 uppercase">
            Search
          </label>
          <Input
            type="search"
            placeholder="Name, email, phone…"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") applySearch();
            }}
            onBlur={applySearch}
          />
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={clearFilters}
            disabled={pending}
          >
            Clear
          </Button>
          <a
            href={exportHref}
            data-testid="export-csv-link"
            className={cn(
              "inline-flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium",
              "bg-[#2B479B] text-white hover:bg-[#243d85] transition-colors",
            )}
          >
            <Download className="w-4 h-4" />
            Export CSV
          </a>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-slate-100 overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="text-left text-[11px] font-semibold tracking-wider text-slate-400 uppercase py-3 px-4">
                Name
              </TableHead>
              <TableHead className="text-left text-[11px] font-semibold tracking-wider text-slate-400 uppercase py-3 px-4">
                Service
              </TableHead>
              <TableHead className="text-left text-[11px] font-semibold tracking-wider text-slate-400 uppercase py-3 px-4">
                Status
              </TableHead>
              <TableHead className="text-left text-[11px] font-semibold tracking-wider text-slate-400 uppercase py-3 px-4">
                Assigned To
              </TableHead>
              <TableHead className="text-left text-[11px] font-semibold tracking-wider text-slate-400 uppercase py-3 px-4">
                Created
              </TableHead>
              <TableHead className="text-right text-[11px] font-semibold tracking-wider text-slate-400 uppercase py-3 px-4">
                Actions
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={6}
                  className="text-center text-sm text-slate-400 py-12"
                >
                  No leads match the current filters.
                </TableCell>
              </TableRow>
            ) : (
              rows.map((row) => (
                <TableRow
                  key={row.id}
                  data-testid={`lead-list-row-${row.id}`}
                  className="border-b border-slate-50 hover:bg-slate-50/50"
                >
                  <TableCell className="py-3.5 px-4">
                    <div className="flex flex-col">
                      <span className="text-sm font-medium text-slate-800">
                        {row.name}
                      </span>
                      <span className="text-[11px] text-slate-400">
                        {row.phone ?? row.email ?? "—"}
                      </span>
                    </div>
                  </TableCell>
                  <TableCell className="py-3.5 px-4 text-sm text-slate-600">
                    {row.service_label}
                  </TableCell>
                  <TableCell className="py-3.5 px-4">
                    <LeadStatusPill status={row.status} />
                  </TableCell>
                  <TableCell
                    className="py-3.5 px-4 text-sm text-slate-600"
                    data-testid={`lead-list-row-${row.id}-assigned-to`}
                  >
                    {row.assigned_to_name ?? (
                      <span className="text-slate-400 italic">Unassigned</span>
                    )}
                  </TableCell>
                  <TableCell className="py-3.5 px-4 text-sm text-slate-500">
                    {fmtDate(row.created_at)}
                  </TableCell>
                  <TableCell className="py-3.5 px-4 text-right">
                    <button
                      type="button"
                      onClick={() => setReassignTarget(row)}
                      className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-slate-600 hover:bg-slate-100 cursor-pointer"
                      data-testid={`lead-actions-${row.id}`}
                    >
                      <MoreVertical className="w-3.5 h-3.5" />
                      Reassign
                    </button>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>

        {/* Pagination */}
        <div className="flex items-center justify-between px-4 py-3 border-t border-slate-100 bg-slate-50/40">
          <span className="text-xs text-slate-500">
            {total === 0
              ? "0 leads"
              : `${fromIndex.toLocaleString()}–${toIndex.toLocaleString()} of ${total.toLocaleString()} leads`}
          </span>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={page <= 1 || pending}
              onClick={() => pushFilters({ page: page - 1 })}
            >
              <ChevronLeft className="w-4 h-4" />
              Prev
            </Button>
            <span className="text-xs text-slate-500 tabular-nums">
              Page {page} / {totalPages}
            </span>
            <Button
              variant="outline"
              size="sm"
              disabled={page >= totalPages || pending}
              onClick={() => pushFilters({ page: page + 1 })}
            >
              Next
              <ChevronRight className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </div>

      {/* Reassign Dialog (controlled — only mounts when a target is set) */}
      {reassignTarget && (
        <ReassignDialog
          lead={{
            id: reassignTarget.id,
            name: reassignTarget.name,
            current_assignee_name: reassignTarget.assigned_to_name,
            current_assignee_id: reassignTarget.assigned_to,
          }}
          agents={agents}
          onClose={() => setReassignTarget(null)}
          onReassigned={() => {
            setReassignTarget(null);
            // Re-fetch the list from the server (RLS-authed view).
            router.refresh();
          }}
        />
      )}
    </div>
  );
}
