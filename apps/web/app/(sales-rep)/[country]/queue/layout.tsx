import { notFound } from "next/navigation";
import { requireCountry, requireRole } from "@/app/_lib/auth";
import { isActiveCountry } from "@/app/_lib/countries";

/**
 * Server-component gate for the agent queue. HQ admins can observe the queue
 * for support purposes. country_admins do NOT enter via this layout — their
 * surface lives one level up at `/[country]`.
 *
 * Unknown country slugs (e.g. /atlantis/queue) must 404 before any role or
 * country redirect fires.
 */
export default async function SalesRepQueueLayout({
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

  const { claims } = await requireRole(["agent", "hq_admin"]);
  requireCountry(country, claims);

  return <>{children}</>;
}
