import { notFound } from "next/navigation";
import {
  getAgentQueue,
  getAgentFollowUps,
  getAgentConvertedInRange,
  getAgentLostInRange,
  getAgentTodayStats,
  getAgentStatsInRange,
} from "@repo/supabase/dal";
import { createClient } from "@repo/supabase/server";
import { countryName, isActiveCountry } from "@/app/_lib/countries";
import {
  dashboardUserFor,
  requireCountry,
  requireRole,
} from "@/app/_lib/auth";
import { resolveDateRange } from "@/app/_lib/date-range";
import { SalesRepShell } from "../../_components/sales-rep-shell";
import { QueueView } from "../../_components/queue-view";

/**
 * Plan-03-04 surface. Reads the date range from `?range=` (defaults to today),
 * fetches four lists (To Call / Follow-ups / Converted / Lost) plus the live
 * stats view + the range stats RPC in parallel, hands everything to the
 * client view.
 *
 * Range-aware reads (Converted + Lost) get a fresh server fetch on every
 * URL change because Next.js re-runs the server component when the
 * `searchParams` shape changes.
 */
export default async function SalesRepQueuePage({
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

  const { user, claims } = await requireRole(["agent", "hq_admin"]);
  requireCountry(country, claims);

  const name = countryName(country);
  const range = resolveDateRange(sp);
  const fromIso = range.from.toISOString();
  const toIso = range.to.toISOString();

  // Fetch initial state in parallel — RLS scopes everything to this agent.
  // For an HQ admin "observing" the route, all reads return empty
  // (RLS hides every row whose assigned_to !== auth.uid()).
  const [
    toCall,
    followUps,
    converted,
    lost,
    liveStatsRow,
    rangeStats,
    futureCallbacksRes,
  ] = await Promise.all([
    getAgentQueue(),
    getAgentFollowUps(),
    getAgentConvertedInRange({ from: fromIso, to: toIso }),
    getAgentLostInRange({ from: fromIso, to: toIso }),
    getAgentTodayStats(),
    getAgentStatsInRange({ from: fromIso, to: toIso }),
    // Future-scheduled callbacks: drive the per-card "Call back" CTA label.
    (async () => {
      const supabase = await createClient();
      const { data, error } = await supabase
        .from("callbacks")
        .select("lead_id")
        .eq("status", "pending")
        .gt("scheduled_for", new Date().toISOString());
      if (error) {
        // Non-fatal; absence just means cards default to "Call".
        return [] as Array<{ lead_id: string }>;
      }
      return data ?? [];
    })(),
  ]);

  const liveStats = {
    to_call_count: liveStatsRow?.to_call_count ?? 0,
    follow_ups_count: liveStatsRow?.follow_ups_count ?? 0,
  };

  const futureCallbackLeadIds = futureCallbacksRes.map((row) => row.lead_id);

  const observerNotice =
    claims.user_role === "hq_admin"
      ? "HQ observing — agent-scoped data is empty by RLS. Open the country admin dashboard to drill into a specific agent."
      : undefined;

  return (
    <SalesRepShell
      countrySlug={country}
      countryName={name}
      currentPath={`/${country}/queue`}
      title="My Leads"
      subtitle="Phone the lead, then log how the call went."
      user={dashboardUserFor(user, claims)}
    >
      <QueueView
        agentId={user.id}
        initialToCall={toCall}
        initialFollowUps={followUps}
        initialConverted={converted}
        initialLost={lost}
        futureCallbackLeadIds={futureCallbackLeadIds}
        liveStats={liveStats}
        rangeStats={rangeStats}
        rangeKey={range.key}
        rangeLabel={range.label}
        observerNotice={observerNotice}
      />
    </SalesRepShell>
  );
}
