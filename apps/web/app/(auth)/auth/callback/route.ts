import "server-only";

import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@repo/supabase/server";

/**
 * Handles Supabase email-link callbacks (password reset, magic link, email
 * confirmation). Exchanges the `code` query param for a session, then sends
 * the user to `/` so middleware can route them by role.
 *
 * Phase 1 doesn't expose any flow that depends on this handler, but Phase 6
 * (password recovery) will, and shipping it now means we don't need to revisit
 * the auth surface to bolt it on later.
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next");

  const safeNext =
    next && next.startsWith("/") && !next.startsWith("//") ? next : "/";

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) {
      return NextResponse.redirect(`${origin}/login?error=callback_failed`);
    }
  }

  return NextResponse.redirect(`${origin}${safeNext}`);
}
