import {
  getCountryPerformanceToday,
  getGroupSpeedToLeadSeries,
  getGroupTodayStats,
  getLeadsByServiceGroup,
} from "@repo/supabase/dal";
import { dashboardUserFor, requireRole } from "@/app/_lib/auth";
import { HQShell } from "./_components/hq-shell";
import { KpiStrip } from "./_components/kpi-strip";
import { CountryLeaderboard } from "./_components/country-leaderboard";
import { LeadsByServiceCard } from "./_components/leads-by-service-card";
import { SpeedToLeadTrendCard } from "./_components/speed-to-lead-trend-card";

/**
 * Plan-05-02 surface — HQ overview. Server fetches all 4 dashboard sources in
 * parallel, hands props to client components.
 *
 * Realtime lives at the leaf (`<KpiStrip>` subscribes via `useGroupBroadcast`)
 * — the page itself is a Server Component and never opens a websocket.
 * Broadcasts trigger `router.refresh()` which re-fetches the four reads here.
 */
export default async function HQOverviewPage() {
  const { user, claims } = await requireRole(["hq_admin"]);

  const [today, countries, leadsByService, speedSeries] = await Promise.all([
    getGroupTodayStats(),
    getCountryPerformanceToday(),
    getLeadsByServiceGroup(),
    getGroupSpeedToLeadSeries(7),
  ]);

  return (
    <HQShell
      currentPath="/"
      title="Paratus Group Overview"
      subtitle="Real-time lead performance across all countries"
      user={dashboardUserFor(user, claims)}
    >
      <div className="flex flex-col gap-6">
        <KpiStrip today={today} />

        <CountryLeaderboard rows={countries} />

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <LeadsByServiceCard items={leadsByService} />
          <SpeedToLeadTrendCard series={speedSeries} />
        </div>
      </div>
    </HQShell>
  );
}
