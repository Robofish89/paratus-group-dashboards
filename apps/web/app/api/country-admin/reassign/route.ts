import "server-only";

import { NextResponse, type NextRequest } from "next/server";
import {
  ForbiddenError,
  NotFoundError,
  getCurrentUserClaims,
  reassignLead,
} from "@repo/supabase/dal";
import { reassignLeadInput } from "@repo/supabase/schemas";

/**
 * Phase 4 plan 04-03 — country admin reassign route.
 *
 * Thin wrapper over `reassignLead(...)` in `@repo/supabase/dal/country`. The
 * underlying `reassign_lead` RPC is SECURITY DEFINER and gates JWT role +
 * country + cross-country target internally; the role check here keeps
 * non-admins out at the route layer (defence-in-depth, mirrors
 * `apps/web/app/api/queue/complete/route.ts`).
 *
 * Body: { lead_id, to_agent_id } — validated via reassignLeadInput Zod schema.
 *
 * Errors:
 *   401 unauthorized   — no cookie session
 *   403 forbidden      — caller role is not country_admin / hq_admin, or RPC
 *                         raised forbidden_role / forbidden_country /
 *                         cross_country_assignment (Postgres 42501)
 *   404 not_found      — lead UUID or target agent UUID missing (P0002)
 *   400 invalid_payload— Zod parse failed
 *   500 internal_error — anything else (Vercel runtime logs capture)
 *   204 No Content     — success
 */
export const runtime = "nodejs";

export async function POST(req: NextRequest): Promise<NextResponse> {
  const claims = await getCurrentUserClaims();
  if (!claims || claims.user_active === false) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  if (
    claims.user_role !== "country_admin" &&
    claims.user_role !== "hq_admin"
  ) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const parsed = reassignLeadInput.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid_payload", detail: parsed.error.flatten() },
      { status: 400 },
    );
  }

  try {
    await reassignLead(parsed.data);
    return new NextResponse(null, { status: 204 });
  } catch (err) {
    if (err instanceof ForbiddenError) {
      return NextResponse.json({ error: "forbidden" }, { status: 403 });
    }
    if (err instanceof NotFoundError) {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }
    const message = err instanceof Error ? err.message : "internal_error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
