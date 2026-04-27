import { requireCountry, requireRole } from "@/app/_lib/auth";

/**
 * Server-component gate for the country-admin surface. HQ admins can drill
 * into any country (read-only intent — actual writes are still RLS-bound).
 * country_admins are pinned to their own country; trying to view another
 * redirects them home (middleware also enforces this — belt + suspenders).
 */
export default async function CountryAdminLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ country: string }>;
}) {
  const { country } = await params;
  const { claims } = await requireRole(["country_admin", "hq_admin"]);
  requireCountry(country, claims);

  return <>{children}</>;
}
