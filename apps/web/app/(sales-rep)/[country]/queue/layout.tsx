import { requireCountry, requireRole } from "@/app/_lib/auth";

/**
 * Server-component gate for the agent queue. HQ admins can observe the queue
 * for support purposes. country_admins do NOT enter via this layout — their
 * surface lives one level up at `/[country]`.
 */
export default async function SalesRepQueueLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ country: string }>;
}) {
  const { country } = await params;
  const { claims } = await requireRole(["agent", "hq_admin"]);
  requireCountry(country, claims);

  return <>{children}</>;
}
