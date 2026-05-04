import "server-only";

import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@repo/supabase/server";
import {
  computeDiff,
  getCurrentUserClaims,
  hashIpAddress,
  recordAudit,
  recordNoAnswer,
} from "@repo/supabase/dal";
import { recordNoAnswerInput } from "@repo/supabase/schemas/queue";

/**
 * Phase 3 plan 04 queue route — POST /api/queue/no-answer.
 *
 * Thin wrapper over `record_no_answer` (migration 00010). The RPC is
 * SECURITY DEFINER and gates auth.uid() / country_code internally; the
 * defence-in-depth role check here keeps non-agents out at the route layer.
 *
 * Phase 6 plan 06-02 — writes an `audit_log` row capturing the call_attempts
 * before/after delta. The RPC already rejects converted/lost leads with
 * `invalid_status` so we don't have to defend against that here. Audit
 * failure is structured-logged and never blocks the response.
 *
 * Body: { lead_id: uuid }
 * Returns: { lead_id, call_attempts } on 200; { error } on 4xx/5xx.
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

  const parsed = recordNoAnswerInput.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.flatten() },
      { status: 400 },
    );
  }

  // Capture call_attempts + country BEFORE the RPC for the audit diff.
  const { data: leadBefore } = await supabase
    .from("leads")
    .select("call_attempts, country_code")
    .eq("id", parsed.data.lead_id)
    .maybeSingle();

  let result: Awaited<ReturnType<typeof recordNoAnswer>>;
  try {
    result = await recordNoAnswer(parsed.data.lead_id);
  } catch (err) {
    const message = err instanceof Error ? err.message : "rpc failed";
    if (/forbidden/i.test(message)) {
      return NextResponse.json({ error: "forbidden" }, { status: 403 });
    }
    if (/lead_not_found/i.test(message)) {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }
    return NextResponse.json({ error: message }, { status: 500 });
  }

  // Audit hook — non-blocking.
  try {
    const targetCountry = leadBefore?.country_code ?? null;
    if (targetCountry) {
      await recordAudit({
        action: "lead.no_answer",
        targetType: "lead",
        targetId: parsed.data.lead_id,
        countryCode: targetCountry,
        diff: computeDiff(
          { call_attempts: leadBefore?.call_attempts ?? 0 },
          { call_attempts: result.call_attempts },
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
        action: "lead.no_answer",
        targetId: parsed.data.lead_id,
        message,
      }),
    );
  }

  return NextResponse.json(result, { status: 200 });
}
