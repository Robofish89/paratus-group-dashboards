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
  const [queue, completedToday, statsRow] = await Promise.all([
    getAgentQueue(),
    getAgentCompletedToday(),
    getAgentTodayStats(),
  ]);

  // Bridge the plan-03-04 view shape (done_today / follow_ups_count) back to
  // the plan-03-02 QueueStatsData shape consumed by the current
  // queue-view.tsx. Plan 03-04 task 5 rewrites both ends; this map is
  // transitional and disappears at that point.
  const stats = statsRow
    ? {
        to_call_count: statsRow.to_call_count,
        completed_today: statsRow.done_today,
        converted_today: statsRow.converted_today,
        callbacks_pending: statsRow.follow_ups_count,
      }
    : null;

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
