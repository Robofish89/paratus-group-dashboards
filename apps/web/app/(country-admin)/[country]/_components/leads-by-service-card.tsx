import { HorizontalBarChart, cn } from "@repo/ui";
import type { LeadsByServiceTodayItem } from "@repo/supabase/dal";

/**
 * Today's leads broken down by `form_slug`. Wraps the locked
 * `<HorizontalBarChart>` primitive from `@repo/ui` inside a card matching
 * the visual contract in `docs/design-reference/country-admin-dashboard.html`.
 *
 * The view already orders DESC at the SQL layer; we cap at the top 8
 * services to keep the card's vertical rhythm when a country has many
 * forms (the mockup shows 5–8 rows).
 */

interface LeadsByServiceCardProps {
  items: LeadsByServiceTodayItem[];
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
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export function LeadsByServiceCard({ items }: LeadsByServiceCardProps) {
  const chartItems = items
    .filter((row) => row.form_slug !== null)
    .slice(0, 8)
    .map((row) => ({
      label: prettifyFormSlug(row.form_slug as string),
      value: row.leads_count ?? 0,
    }));

  return (
    <div
      className={cn("bg-white rounded-xl p-6 border border-slate-100")}
      data-testid="leads-by-service-card"
    >
      <div className="flex items-center justify-between mb-5">
        <h2 className="text-base font-semibold text-slate-900">
          Leads by Service
        </h2>
        <span
          className={cn(
            "inline-flex items-center gap-1.5 rounded-full",
            "bg-emerald-50 border border-emerald-200 px-2.5 py-0.5",
          )}
        >
          <span className="relative flex h-1.5 w-1.5">
            <span className="absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75 animate-ping" />
            <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-500" />
          </span>
          <span className="text-[10px] font-semibold tracking-[0.1em] text-emerald-700 uppercase">
            Live
          </span>
        </span>
      </div>
      {chartItems.length === 0 ? (
        <p className="text-sm text-slate-400 py-8 text-center">
          No leads today.
        </p>
      ) : (
        <HorizontalBarChart items={chartItems} barColor="#2B479B" />
      )}
    </div>
  );
}
