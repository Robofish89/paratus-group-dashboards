import { HorizontalBarChart, cn } from "@repo/ui";
import type { LeadsByServiceGroupRow } from "@repo/supabase/schemas";

/**
 * Group-wide leads broken down by `form_slug`. Wraps the locked
 * `<HorizontalBarChart>` primitive from `@repo/ui` inside a card matching
 * the visual contract in `docs/design-reference/hq-dashboard.html`.
 *
 * NOTE: This is the **all-time** group rollup, deliberately diverging from
 * the country-admin `<LeadsByServiceCard>` which is **today-only** per
 * country. The mockup math (bars summing to "Total Leads (Group)" 8,432
 * not "Leads Today" 127) confirms all-time is the right window — see
 * plan 05-01 STATE entry.
 */

interface LeadsByServiceCardProps {
  items: LeadsByServiceGroupRow[];
}

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

export function LeadsByServiceCard({ items }: LeadsByServiceCardProps) {
  const chartItems = items
    .filter((row) => row.form_slug !== null)
    .map((row) => ({
      label: prettifyFormSlug(row.form_slug as string),
      value: row.leads_count ?? 0,
    }));

  return (
    <div
      className={cn("bg-white rounded-xl border border-slate-100 overflow-hidden")}
      data-testid="leads-by-service-card"
    >
      <div className="px-6 py-4 border-b border-slate-100">
        <h2 className="text-base font-semibold text-slate-900">
          Leads by Service (Group)
        </h2>
      </div>
      <div className="px-6 py-5">
        {chartItems.length === 0 ? (
          <p className="text-sm text-slate-400 py-8 text-center">
            No service data yet.
          </p>
        ) : (
          <HorizontalBarChart items={chartItems} barColor="#2B479B" />
        )}
      </div>
    </div>
  );
}
