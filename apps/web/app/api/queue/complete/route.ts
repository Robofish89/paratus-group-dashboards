import "server-only";

import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@repo/supabase/server";
import { getCurrentUserClaims, completeCall } from "@repo/supabase/dal";
import { completeCallInput } from "@repo/supabase/schemas/queue";

/**
 * Phase 3 queue route — POST /api/queue/complete.
 *
 * Thin wrapper over the `complete_call` RPC (migration 00009). The RPC is
 * SECURITY DEFINER and gates auth.uid() / country_code internally; the
 * defence-in-depth role check here keeps non-agents out at the route layer.
 *
 * Body: { lead_id, outcome, notes?, lost_reason? } — validated via
 *       completeCallInput Zod schema (which enforces lost_reason required
 *       when outcome=lost).
 *
 * Returns: { lead_id, status, outcome } on 200; { error } on 4xx/5xx.
 */
export const runtime = "nodejs";

export async function POST(req: NextRequest): Promise<NextResponse> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const claims = await getCurrentUserClaims();
  if (
    !claims ||
    claims.user_active === false ||
    (claims.user_role !== "agent" && claims.user_role !== "hq_admin")
  ) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const parsed = completeCallInput.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.flatten() },
      { status: 400 },
    );
  }

  try {
    const result = await completeCall(parsed.data);
    return NextResponse.json(result, { status: 200 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "rpc failed";
    if (/forbidden/i.test(message)) {
      return NextResponse.json({ error: "forbidden" }, { status: 403 });
    }
    if (/lead_not_found/i.test(message)) {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }
    if (/invalid_status/i.test(message)) {
      return NextResponse.json({ error: "invalid_status" }, { status: 409 });
    }
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
