import { requireRole } from "@/app/_lib/auth";

/**
 * Server-component gate for the HQ surface. Middleware already ensures only
 * authenticated `hq_admin` users see anything under `/`, but we re-check here
 * as defense-in-depth so a future middleware mis-config can't leak the layout.
 */
export default async function HQLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireRole(["hq_admin"]);

  return <>{children}</>;
}
