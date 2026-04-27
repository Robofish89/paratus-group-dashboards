import { SectionCard } from "@repo/ui";
import { dashboardUserFor, requireRole } from "@/app/_lib/auth";
import { HQShell } from "./_components/hq-shell";

export default async function HQOverviewPage() {
  const { user, claims } = await requireRole(["hq_admin"]);

  return (
    <HQShell
      currentPath="/"
      title="Paratus Group Overview"
      subtitle="Real-time lead performance across all countries"
      user={dashboardUserFor(user, claims)}
    >
      <SectionCard
        title="Phase 1 placeholder"
        subtitle="Foundation in place. Phase 5 wires the live data."
      >
        <p className="text-sm text-slate-500">
          The HQ Overview surface will land in Phase 5 — group KPIs, country
          leaderboard, group pipeline, and drill-in to any country&apos;s admin
          view.
        </p>
      </SectionCard>
    </HQShell>
  );
}
