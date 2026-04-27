import { notFound } from "next/navigation";
import { SectionCard } from "@repo/ui";
import { countryName, isActiveCountry } from "@/app/_lib/countries";
import { CountryAdminShell } from "../_components/country-admin-shell";

export default async function CountryAdminPage({
  params,
}: {
  params: Promise<{ country: string }>;
}) {
  const { country } = await params;

  if (!isActiveCountry(country)) {
    notFound();
  }

  const name = countryName(country);

  return (
    <CountryAdminShell
      countrySlug={country}
      countryName={name}
      currentPath={`/${country}`}
      title={`${name} — Country Admin`}
      subtitle="Pipeline performance, agents, and leads"
    >
      <SectionCard
        title="Phase 1 placeholder"
        subtitle="Foundation in place. Phase 4 wires the live data."
      >
        <p className="text-sm text-slate-500">
          The Country Admin dashboard ships in Phase 4 — KPIs, pipeline funnel,
          speed-to-lead chart, agent performance, and the lead list with
          reassignment.
        </p>
      </SectionCard>
    </CountryAdminShell>
  );
}
