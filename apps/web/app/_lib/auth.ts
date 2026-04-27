import "server-only";

import { redirect } from "next/navigation";
import type { User } from "@supabase/supabase-js";
import { createClient } from "@repo/supabase/server";
import { getCurrentUserClaims } from "@repo/supabase/dal";
import {
  countryCodeToSlug,
  type AppRole,
  type UserClaims,
} from "@repo/supabase/types";

/**
 * Defense-in-depth auth helper for server components.
 *
 * Middleware already enforces auth and routes by role/country before a layout
 * renders. These helpers re-check inside the route layout so a future
 * middleware bypass (mis-config, edge case) cannot leak data into a layout.
 */
export async function requireUser(): Promise<{ user: User; claims: UserClaims }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const claims = await getCurrentUserClaims();
  if (!claims) {
    redirect("/login");
  }

  return { user, claims };
}

export async function requireRole(
  roles: AppRole[],
): Promise<{ user: User; claims: UserClaims }> {
  const { user, claims } = await requireUser();

  if (claims.user_active === false) {
    redirect("/unauthorized");
  }
  if (!claims.user_role || !roles.includes(claims.user_role)) {
    redirect("/unauthorized");
  }

  return { user, claims };
}

/**
 * For country-scoped layouts: ensure the URL slug matches the user's claim
 * country. HQ admins bypass this check (they have group-wide access).
 */
export function requireCountry(countryParam: string, claims: UserClaims): void {
  if (claims.user_role === "hq_admin") return;

  if (!claims.country_code) {
    redirect("/unauthorized");
  }
  const expected = countryCodeToSlug(claims.country_code);
  if (countryParam.toLowerCase() !== expected) {
    redirect(`/${expected}`);
  }
}

const ROLE_LABEL: Record<AppRole, string> = {
  hq_admin: "HQ Admin",
  country_admin: "Country Admin",
  agent: "Sales Agent",
};

/**
 * Build the `DashboardUser` payload the sidebar footer renders. We prefer the
 * Supabase `display_name` user metadata when present, falling back to the
 * email's local part so seeded test accounts still render a sensible name.
 */
export function dashboardUserFor(
  user: User,
  claims: UserClaims,
): { name: string; email: string; role: string } {
  const email = user.email ?? "";
  const metaName =
    typeof user.user_metadata?.display_name === "string"
      ? user.user_metadata.display_name
      : null;
  const name = metaName ?? (email ? email.split("@")[0]! : "User");
  const role = claims.user_role ? ROLE_LABEL[claims.user_role] : "User";
  return { name, email, role };
}
