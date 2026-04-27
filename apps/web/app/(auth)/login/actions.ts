"use server";

import "server-only";

import { redirect } from "next/navigation";
import { createClient } from "@repo/supabase/server";
import { getUserRoleRow } from "@repo/supabase/dal";
import { loginSchema } from "@repo/supabase/schemas";
import { countryCodeToSlug } from "@repo/supabase/types";

export interface LoginActionResult {
  error?: "invalid_input" | "invalid_credentials" | "no_role";
}

/**
 * Compute the post-login destination from the user's role row. Falls back to
 * `/unauthorized` if no role row exists (a new user provisioned in Supabase
 * but not yet inserted into `user_roles`).
 */
function destinationFor(
  role: "hq_admin" | "country_admin" | "agent",
  countryCode: string | null,
): string {
  if (role === "hq_admin") return "/";
  if (!countryCode) return "/unauthorized";
  const slug = countryCodeToSlug(countryCode as never);
  if (role === "country_admin") return `/${slug}`;
  return `/${slug}/queue`;
}

export async function loginAction(
  _prev: LoginActionResult | undefined,
  formData: FormData,
): Promise<LoginActionResult> {
  const parsed = loginSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });
  if (!parsed.success) {
    return { error: "invalid_input" };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithPassword(parsed.data);
  if (error || !data.user) {
    return { error: "invalid_credentials" };
  }

  const roleRow = await getUserRoleRow(data.user.id);
  if (!roleRow || !roleRow.is_active) {
    await supabase.auth.signOut();
    return { error: "no_role" };
  }

  // Optional redirect-after-login. Light guard against open-redirect: only
  // permit same-origin paths.
  const requested = formData.get("redirectTo");
  const safeRedirect =
    typeof requested === "string" &&
    requested.startsWith("/") &&
    !requested.startsWith("//")
      ? requested
      : null;

  const destination =
    safeRedirect ?? destinationFor(roleRow.role, roleRow.country_code);

  redirect(destination);
}
