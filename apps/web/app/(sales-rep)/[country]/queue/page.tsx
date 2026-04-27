import { notFound } from "next/navigation";
import { SectionCard } from "@repo/ui";
import { countryName, isActiveCountry } from "@/app/_lib/countries";
import {
  dashboardUserFor,
  requireCountry,
  requireRole,
} from "@/app/_lib/auth";
import { SalesRepShell } from "../../_components/sales-rep-shell";

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

  return (
    <SalesRepShell
      countrySlug={country}
      countryName={name}
      currentPath={`/${country}/queue`}
      title="My Queue"
      subtitle={name}
      user={dashboardUserFor(user, claims)}
    >
      <SectionCard
        title="Phase 1 placeholder"
        subtitle="Foundation in place. Phase 3 wires the realtime queue."
      >
        <p className="text-sm text-slate-500">
          The Sales Rep call queue lands in Phase 3 — realtime lead arrivals,
          one-click call action, outcome capture, and callback scheduling.
        </p>
      </SectionCard>
    </SalesRepShell>
  );
}
