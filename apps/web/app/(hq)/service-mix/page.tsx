import { SectionCard } from "@repo/ui";
import { dashboardUserFor, requireRole } from "@/app/_lib/auth";
import { HQShell } from "../_components/hq-shell";

/**
 * Phase 5 plan 05-03 — sidebar stub. The HQ nav advertises "Service Mix" but
 * the canonical view today is the all-time Leads by Service card on the
 * Overview surface. Phase 6 will turn this into a group-wide breakdown of
 * lead volume by service line over time, with form-funnel performance per
 * service.
 *
 * Defence-in-depth: middleware already gates `(hq)` to `hq_admin`; we
 * re-check at the route layer so a future middleware mis-config can't
 * leak this surface.
 */
export default async function ServiceMixStubPage() {
  const { user, claims } = await requireRole(["hq_admin"]);

  return (
    <HQShell
      currentPath="/service-mix"
      title="Service Mix"
      subtitle="Phase 6 — coming soon"
      user={dashboardUserFor(user, claims)}
    >
      <SectionCard title="Service Mix" subtitle="Coming in Phase 6">
        <p className="text-sm text-slate-600 leading-relaxed">
          Group-wide breakdown of lead volume by service line over time,
          with form-funnel performance per service. Currently the Leads by
          Service card on the Overview captures the all-time totals.
        </p>
      </SectionCard>
    </HQShell>
  );
}
