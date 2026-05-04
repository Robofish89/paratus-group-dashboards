import { SectionCard } from "@repo/ui";
import { dashboardUserFor, requireRole } from "@/app/_lib/auth";
import { HQShell } from "../_components/hq-shell";

/**
 * Phase 5 plan 05-03 — sidebar stub. The HQ nav advertises "Countries" but
 * the canonical view today is the leaderboard on the Overview surface.
 * Phase 6 will turn this into a drill-in directory with per-country health,
 * agent rosters, and provisioning status.
 *
 * Defence-in-depth: middleware already gates `(hq)` to `hq_admin`; we
 * re-check at the route layer so a future middleware mis-config can't
 * leak this surface.
 */
export default async function CountriesStubPage() {
  const { user, claims } = await requireRole(["hq_admin"]);

  return (
    <HQShell
      currentPath="/countries"
      title="Countries"
      subtitle="Phase 6 — coming soon"
      user={dashboardUserFor(user, claims)}
    >
      <SectionCard title="Countries" subtitle="Coming in Phase 6">
        <p className="text-sm text-slate-600 leading-relaxed">
          A drill-in directory of every active country with per-country
          health, agent rosters, and provisioning status. Currently the
          leaderboard on the Overview is the canonical view.
        </p>
      </SectionCard>
    </HQShell>
  );
}
