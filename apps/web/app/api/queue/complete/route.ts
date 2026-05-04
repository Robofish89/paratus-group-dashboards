import "server-only";

import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@repo/supabase/server";
import {
  completeCall,
  computeDiff,
  getCurrentUserClaims,
  hashIpAddress,
  recordAudit,
} from "@repo/supabase/dal";
import { completeCallInput } from "@repo/supabase/schemas/queue";

/**
 * Phase 3 queue route — POST /api/queue/complete.
 *
 * Thin wrapper over the `complete_call` RPC (migrations 00009 + 00010). The
 * RPC is SECURITY DEFINER and gates auth.uid() / country_code internally;
 * the defence-in-depth role check here keeps non-agents out at the route
 * layer.
 *
 * Body: { lead_id, outcome, notes?, lost_reason? } — validated via
 *       completeCallInput Zod schema. Accepted outcomes (plan 03-04):
 *         - 'won'        → flips status to 'converted'
 *         - 'lost'       → flips status to 'lost' (lost_reason required)
 *         - 'no_answer'  → event-only (no status mutation)
 *         - 'callback'   → event-only; the actual callback row is written
 *                          by /api/queue/callback in a separate request
 *       'qualified' is rejected (Zod 400) — the UI collapses Qualified +
 *       Won into a single 'Converted' label at the surface layer.
 *
 * Phase 6 plan 06-02 — writes an `audit_log` row capturing the
 * status/outcome transition after the RPC succeeds. Audit failure is
 * structured-logged and never blocks the primary 200 response.
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

  // Capture the lead's current status BEFORE the RPC for the audit diff.
  const { data: leadBefore } = await supabase
    .from("leads")
    .select("status, country_code, last_outcome")
    .eq("id", parsed.data.lead_id)
    .maybeSingle();

  let result: Awaited<ReturnType<typeof completeCall>>;
  try {
    result = await completeCall(parsed.data);
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

  // Audit hook — non-blocking.
  try {
    const targetCountry = leadBefore?.country_code ?? null;
    if (targetCountry) {
      await recordAudit({
        action: "lead.complete",
        targetType: "lead",
        targetId: parsed.data.lead_id,
        countryCode: targetCountry,
        diff: computeDiff(
          {
            status: leadBefore?.status ?? null,
            last_outcome: leadBefore?.last_outcome ?? null,
          },
          { status: result.status, last_outcome: parsed.data.outcome },
        ),
        ipHash: hashIpAddress(req.headers.get("x-forwarded-for") ?? ""),
      });
    }
  } catch (auditErr) {
    const message =
      auditErr instanceof Error ? auditErr.message : "audit write failed";
    // eslint-disable-next-line no-console -- structured observability log
    console.warn(
      JSON.stringify({
        event: "audit_write_failed",
        action: "lead.complete",
        targetId: parsed.data.lead_id,
        message,
      }),
    );
  }

  return NextResponse.json(result, { status: 200 });
}
