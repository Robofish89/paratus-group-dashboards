import { notFound } from "next/navigation";
import {
  getAgentPerformanceInRange,
  getCountrySpeedToLeadToday,
  getCountryStatsInRange,
  getCountryTodayStats,
  getLeadsByServiceToday,
  getSpeedToLeadSeries,
  getStatusPipelineToday,
} from "@repo/supabase/dal";
import { countryName, isActiveCountry } from "@/app/_lib/countries";
import {
  dashboardUserFor,
  requireCountry,
  requireRole,
} from "@/app/_lib/auth";
import { resolveDateRange } from "@/app/_lib/date-range";
import { CountryAdminShell } from "../_components/country-admin-shell";
import { KpiStrip } from "./_components/kpi-strip";
import { LeadsByServiceCard } from "./_components/leads-by-service-card";
import { StatusPipelineCard } from "./_components/status-pipeline-card";
import { AgentPerformanceTable } from "./_components/agent-performance-table";
import { SpeedToLeadCard } from "./_components/speed-to-lead-card";

/**
 * Plan-04-02 surface — country admin overview. Reads `[country]` from the
 * URL slug + `?range=` (defaults to today), fetches all dashboard data
 * server-side in parallel, hands props to client components.
 *
 * Mirrors the sales-rep queue pattern: every read is server-fetched, RLS
 * + RPC JWT guards do the country lock, the client components are
 * presentational + (KPI strip only) optimistic on broadcast.
 */
export default async function CountryAdminOverviewPage({
  params,
  searchParams,
}: {
  params: Promise<{ country: string }>;
  searchParams: Promise<{
    range?: string | string[];
    from?: string | string[];
    to?: string | string[];
  }>;
}) {
  const [{ country }, sp] = await Promise.all([params, searchParams]);

  if (!isActiveCountry(country)) {
    notFound();
  }

  const { user, claims } = await requireRole(["country_admin", "hq_admin"]);
  requireCountry(country, claims);

  const name = countryName(country);
  const range = resolveDateRange(sp);
  const fromIso = range.from.toISOString();
  const toIso = range.to.toISOString();

  // Country code is upper-case in the data model; URL slugs are lower-case.
  const countryCode = country.toUpperCase();

  const [
    todayStats,
    rangeStats,
    leadsByService,
    statusPipeline,
    speedToLeadToday,
    agentPerformance,
    speedToLeadSeries,
  ] = await Promise.all([
    getCountryTodayStats(countryCode),
    getCountryStatsInRange(countryCode, fromIso, toIso),
    getLeadsByServiceToday(countryCode),
    getStatusPipelineToday(countryCode),
    getCountrySpeedToLeadToday(countryCode),
    getAgentPerformanceInRange(countryCode, fromIso, toIso),
    getSpeedToLeadSeries(countryCode, fromIso, toIso),
  ]);

  const avgResponseSeconds = speedToLeadToday?.avg_response_seconds ?? null;
  const avgResponseText = (() => {
    if (avgResponseSeconds === null) return "—";
    const mins = Math.floor(avgResponseSeconds / 60);
    const secs = Math.round(avgResponseSeconds % 60);
    if (mins > 0) return secs > 0 ? `${mins}m ${secs}s` : `${mins}m`;
    return `${secs}s`;
  })();
  const avgResponseOnTarget =
    avgResponseSeconds !== null && avgResponseSeconds <= 300;

  return (
    <CountryAdminShell
      countrySlug={country}
      countryName={name}
      currentPath={`/${country}`}
      title="Dashboard"
      subtitle="Lead capture performance overview"
      user={dashboardUserFor(user, claims)}
    >
      <div className="flex flex-col gap-6">
        <KpiStrip
          countryCode={countryCode}
          today={todayStats}
          rangeConverted={rangeStats?.converted_count ?? 0}
          avgResponseText={avgResponseText}
          avgResponseOnTarget={avgResponseOnTarget}
        />

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <LeadsByServiceCard items={leadsByService} />
          <StatusPipelineCard items={statusPipeline} />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <AgentPerformanceTable rows={agentPerformance} />
          <SpeedToLeadCard
            today={speedToLeadToday}
            series={speedToLeadSeries}
          />
        </div>
      </div>
    </CountryAdminShell>
  );
}
