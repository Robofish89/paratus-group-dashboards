import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  cn,
} from "@repo/ui";
import { getLeadsByServiceGroup } from "@repo/supabase/dal";
import { dashboardUserFor, requireRole } from "@/app/_lib/auth";
import { HQShell } from "../_components/hq-shell";

/**
 * HQ Service Mix — group-wide breakdown of all-time lead volume by service
 * line. Diverges from the Overview's `<LeadsByServiceCard>` (bar chart) by
 * surfacing rank, count, and share-of-total in tabular form. Same data
 * source (`leads_by_service_group` view), richer presentation.
 *
 * Defence-in-depth: middleware already gates `(hq)` to `hq_admin`; we
 * re-check at the route layer so a future middleware mis-config can't leak
 * this surface.
 */
const FORM_DISPLAY_NAMES: Record<string, string> = {
  general_contact: "General Contact",
  carrier_services: "Carrier Services",
  satellite: "Satellite Services",
  data_centers: "Data Centers",
  broadband: "Broadband Services",
  oneweb: "OneWeb",
  starlink: "Starlink",
  essential_access: "Essential Access",
  connect2care: "Connect2Care",
  starlink_for_schools: "Starlink for Schools",
};

function prettifyFormSlug(slug: string): string {
  if (FORM_DISPLAY_NAMES[slug]) return FORM_DISPLAY_NAMES[slug];
  return slug
    .split(/[-_]/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export default async function HQServiceMixPage() {
  const { user, claims } = await requireRole(["hq_admin"]);
  const items = await getLeadsByServiceGroup();

  const rows = items
    .filter((row) => row.form_slug !== null)
    .map((row) => ({
      slug: row.form_slug as string,
      label: prettifyFormSlug(row.form_slug as string),
      count: row.leads_count ?? 0,
    }))
    .sort((a, b) => b.count - a.count);

  const total = rows.reduce((sum, r) => sum + r.count, 0);
  const max = rows.length > 0 ? Math.max(...rows.map((r) => r.count)) : 0;

  return (
    <HQShell
      currentPath="/service-mix"
      title="Service Mix"
      subtitle={`All-time lead volume across ${rows.length} service line${rows.length === 1 ? "" : "s"}`}
      user={dashboardUserFor(user, claims)}
    >
      <div className="bg-white rounded-xl border border-slate-100 overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-100 flex items-baseline justify-between">
          <h2 className="text-base font-semibold text-slate-900">
            Group-wide breakdown
          </h2>
          <p className="text-xs text-slate-400 tabular-nums">
            {total.toLocaleString()} total leads
          </p>
        </div>

        {rows.length === 0 ? (
          <p className="text-sm text-slate-400 py-12 text-center">
            No service data yet.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-left w-12">#</TableHead>
                  <TableHead className="text-left">Service line</TableHead>
                  <TableHead className="text-right">Leads</TableHead>
                  <TableHead className="text-right">Share</TableHead>
                  <TableHead className="text-left w-[240px] xl:w-[320px]">
                    Distribution
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((row, index) => {
                  const share = total > 0 ? (row.count / total) * 100 : 0;
                  const widthPct = max > 0 ? (row.count / max) * 100 : 0;
                  return (
                    <TableRow
                      key={row.slug}
                      className="hover:bg-slate-50 transition-colors"
                      data-testid={`service-mix-row-${row.slug}`}
                    >
                      <TableCell className="text-sm text-slate-400 font-medium tabular-nums">
                        {index + 1}
                      </TableCell>
                      <TableCell className="font-semibold text-slate-900">
                        {row.label}
                      </TableCell>
                      <TableCell className="text-right text-sm text-slate-700 font-medium tabular-nums">
                        {row.count.toLocaleString()}
                      </TableCell>
                      <TableCell className="text-right text-sm text-slate-700 tabular-nums">
                        {share.toFixed(1)}%
                      </TableCell>
                      <TableCell>
                        <div
                          className={cn(
                            "h-2 rounded-full bg-slate-100 overflow-hidden",
                          )}
                        >
                          <div
                            className="h-full bg-[#2B479B]"
                            style={{ width: `${widthPct}%` }}
                            aria-hidden
                          />
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}

        <div className="px-6 py-3 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-400">
          <span>Sorted by lead volume, descending</span>
          <span>Source: leads_by_service_group · all-time</span>
        </div>
      </div>
    </HQShell>
  );
}
