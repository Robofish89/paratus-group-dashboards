import { SectionCard } from "@repo/ui";
import { dashboardUserFor, requireRole } from "@/app/_lib/auth";
import { HQShell } from "../_components/hq-shell";

/**
 * Phase 5 plan 05-03 — sidebar stub. The HQ nav advertises "Settings" but
 * no group-level settings exist yet. Phase 6 will turn this into a group
 * admin surface for feature flags, SLA targets, and country activation
 * toggles.
 *
 * Defence-in-depth: middleware already gates `(hq)` to `hq_admin`; we
 * re-check at the route layer so a future middleware mis-config can't
 * leak this surface.
 */
export default async function SettingsStubPage() {
  const { user, claims } = await requireRole(["hq_admin"]);

  return (
    <HQShell
      currentPath="/settings"
      title="Settings"
      subtitle="Phase 6 — coming soon"
      user={dashboardUserFor(user, claims)}
    >
      <SectionCard title="Settings" subtitle="Coming in Phase 6">
        <p className="text-sm text-slate-600 leading-relaxed">
          Group-level admin — feature flags, SLA targets, country activation
          toggles. Currently no group-level settings exist.
        </p>
      </SectionCard>
    </HQShell>
  );
}
