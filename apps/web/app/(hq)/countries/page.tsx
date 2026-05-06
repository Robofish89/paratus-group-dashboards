import { getCountriesDirectory } from "@repo/supabase/dal";
import { dashboardUserFor, requireRole } from "@/app/_lib/auth";
import { HQShell } from "../_components/hq-shell";
import { CountryCard } from "./_components/country-card";

/**
 * HQ Countries directory — every Paratus market in one place. 12 active
 * markets show live KPIs (Total Leads, New Today, Contacted %, Avg Response)
 * and link through to their per-country admin dashboard. The 3 coming-soon
 * markets render in a muted variant so the group surface honestly reflects
 * the rollout footprint.
 *
 * Defence-in-depth: middleware already gates `(hq)` to `hq_admin`; we
 * re-check at the route layer so a future middleware mis-config can't leak
 * this surface.
 */
export default async function HQCountriesPage() {
  const { user, claims } = await requireRole(["hq_admin"]);
  const rows = await getCountriesDirectory();

  const active = rows.filter((r) => r.status === "active");
  const comingSoon = rows.filter((r) => r.status === "coming_soon");

  return (
    <HQShell
      currentPath="/countries"
      title="Countries"
      subtitle={`${active.length} active · ${comingSoon.length} coming soon`}
      user={dashboardUserFor(user, claims)}
    >
      <div className="flex flex-col gap-8">
        <section className="flex flex-col gap-4">
          <header className="flex items-baseline justify-between">
            <h2 className="text-base font-semibold text-slate-900">
              Active markets
            </h2>
            <p className="text-xs text-slate-400">
              Click any country to drill into its admin dashboard
            </p>
          </header>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {active.map((row) => (
              <CountryCard key={row.country_code} row={row} />
            ))}
          </div>
        </section>

        {comingSoon.length > 0 && (
          <section className="flex flex-col gap-4">
            <header className="flex items-baseline justify-between">
              <h2 className="text-base font-semibold text-slate-900">
                Coming soon
              </h2>
              <p className="text-xs text-slate-400">
                Seeded in the data model — activates with a single flag flip
              </p>
            </header>
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {comingSoon.map((row) => (
                <CountryCard key={row.country_code} row={row} />
              ))}
            </div>
          </section>
        )}
      </div>
    </HQShell>
  );
}
