import "server-only";

import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { createClient as createServerClient } from "@repo/supabase/server";
// RLS BYPASS: service_role admin client. Required to call `auth.admin.generateLink`
// (privileged-only). Reachable only behind the E2E_AUTH_ENABLED guard below.
import { createAdminClient } from "@repo/supabase/admin";

/**
 * Test-only auth bridge — Phase 3 plan 03-03 Playwright golden path.
 *
 * Flow: caller POSTs `{ email }` for one of the seeded test users. The route
 * asks the service-role admin to mint a magic-link, then redeems the
 * `hashed_token` via the SSR cookie client's `verifyOtp`. The SSR client sets
 * the session cookies on the outgoing response, so a Playwright browser that
 * receives this response is now authenticated as that user.
 *
 * Hard-gated behind `E2E_AUTH_ENABLED=true` — Vercel production never sets
 * this flag, so the route is dead code in prod. Belt-and-braces: also require
 * a non-production NODE_ENV. If either guard is missing, return 404 (which
 * looks like a typo to a probe rather than a deliberate test back-door).
 *
 * Why a route and not a Playwright server-side fixture? Cookie injection into
 * a Playwright BrowserContext requires reverse-engineering the @supabase/ssr
 * cookie chunking (sb-<ref>-auth-token, sometimes split across multiple
 * cookies). Letting the SSR client set them via Set-Cookie headers is the
 * single source of truth and tracks any future Supabase format changes.
 */
export const runtime = "nodejs";

const bodySchema = z.object({
  email: z.string().email(),
});

function isEnabled(): boolean {
  return (
    process.env.E2E_AUTH_ENABLED === "true" &&
    process.env.NODE_ENV !== "production"
  );
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  if (!isEnabled()) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.flatten() },
      { status: 400 },
    );
  }

  // RLS BYPASS: service_role admin mints the magic link (privileged API).
  const admin = createAdminClient();
  const { data, error } = await admin.auth.admin.generateLink({
    type: "magiclink",
    email: parsed.data.email,
  });
  if (error || !data?.properties?.hashed_token) {
    return NextResponse.json(
      { error: error?.message ?? "generateLink_failed" },
      { status: 500 },
    );
  }

  // Redeem via the SSR cookie client so the resulting session lands as
  // Set-Cookie on the response.
  const supabase = await createServerClient();
  const { error: verifyErr } = await supabase.auth.verifyOtp({
    type: "magiclink",
    token_hash: data.properties.hashed_token,
  });
  if (verifyErr) {
    return NextResponse.json(
      { error: verifyErr.message },
      { status: 401 },
    );
  }

  return NextResponse.json({ ok: true }, { status: 200 });
}
