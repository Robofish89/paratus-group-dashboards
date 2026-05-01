import { notFound } from "next/navigation";
import {
  getAgentQueue,
  getAgentCompletedToday,
  getAgentTodayStats,
} from "@repo/supabase/dal";
import { countryName, isActiveCountry } from "@/app/_lib/countries";
import {
  dashboardUserFor,
  requireCountry,
  requireRole,
} from "@/app/_lib/auth";
import { SalesRepShell } from "../../_components/sales-rep-shell";
import { QueueView } from "../../_components/queue-view";

export default async function SalesRepQueuePage({
  params,
}: {
  params: Promise<{ country: string }>;
}) {
  const { country } = await params;

  if (!isActiveCountry(country)) {
    notFound();
  }

  const { user, claims } = await requireRole(["agent", "hq_admin"]);
  requireCountry(country, claims);

  const name = countryName(country);

  // Fetch initial state in parallel — RLS scopes everything to this agent.
  // For an HQ admin "observing" the route, all three reads return empty
  // (RLS hides every row whose assigned_to !== auth.uid()), and the
  // QueueView renders the observer notice instead of an empty grid.
  const [queue, completedToday, stats] = await Promise.all([
    getAgentQueue(),
    getAgentCompletedToday(),
    getAgentTodayStats(),
  ]);

  const observerNotice =
    claims.user_role === "hq_admin"
      ? "HQ observing — agent-scoped data is empty by RLS. Pick an agent in the country admin dashboard once Phase 4 ships."
      : undefined;

  return (
    <SalesRepShell
      countrySlug={country}
      countryName={name}
      currentPath={`/${country}/queue`}
      title="Call Queue"
      subtitle="Contact leads and record call outcomes."
      user={dashboardUserFor(user, claims)}
    >
      <QueueView
        agentId={user.id}
        initialQueue={queue}
        initialCompleted={completedToday}
        initialStats={stats}
        observerNotice={observerNotice}
      />
    </SalesRepShell>
  );
}
