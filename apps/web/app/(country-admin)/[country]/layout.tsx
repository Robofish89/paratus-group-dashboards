import { notFound } from "next/navigation";
import { requireCountry, requireRole } from "@/app/_lib/auth";
import { isActiveCountry } from "@/app/_lib/countries";

/**
 * Server-component gate for the country-admin surface. HQ admins can drill
 * into any country (read-only intent — actual writes are still RLS-bound).
 * country_admins are pinned to their own country; trying to view another
 * redirects them home (middleware also enforces this — belt + suspenders).
 *
 * Unknown country slugs (e.g. /atlantis) must 404 before any role or country
 * redirect fires, otherwise an authenticated user sees /unauthorized or gets
 * bounced to their own country instead of a clean Not Found.
 */
export default async function CountryAdminLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ country: string }>;
}) {
  const { country } = await params;

  if (!isActiveCountry(country)) {
    notFound();
  }

  const { claims } = await requireRole(["country_admin", "hq_admin"]);
  requireCountry(country, claims);

  return <>{children}</>;
}
