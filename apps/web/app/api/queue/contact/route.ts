import "server-only";

import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { createClient } from "@repo/supabase/server";
import {
  computeDiff,
  getCurrentUserClaims,
  hashIpAddress,
  markLeadContacted,
  recordAudit,
} from "@repo/supabase/dal";

/**
 * Phase 3 queue route — POST /api/queue/contact.
 *
 * Thin wrapper over `mark_lead_contacted` RPC. The RPC itself is SECURITY
 * DEFINER and gates `auth.uid() = leads.assigned_to AND
 * jwt.country_code = leads.country_code` internally; this handler adds a
 * defence-in-depth role check (must be agent or hq_admin) on top of the
 * cookie-session auth so a misconfigured middleware bypass still rejects
 * non-agents at this layer.
 *
 * Phase 6 plan 06-02 — writes an `audit_log` row when the
 * `first_contacted_at` field actually changes (the RPC is a no-op for leads
 * already contacted, so we only audit the genuine NULL → now() transition).
 *
 * Body: { lead_id: uuid }
 * Returns: { lead_id, first_contacted_at } on 200; { error } on 4xx/5xx.
 */
export const runtime = "nodejs";

const bodySchema = z.object({
  lead_id: z.string().uuid(),
});

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

  const parsed = bodySchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.flatten() },
      { status: 400 },
    );
  }

  // Capture first_contacted_at + country BEFORE the RPC for the audit diff.
  const { data: leadBefore } = await supabase
    .from("leads")
    .select("first_contacted_at, country_code")
    .eq("id", parsed.data.lead_id)
    .maybeSingle();

  let result: Awaited<ReturnType<typeof markLeadContacted>>;
  try {
    result = await markLeadContacted(parsed.data.lead_id);
  } catch (err) {
    const message = err instanceof Error ? err.message : "rpc failed";
    // Map known RPC raises (forbidden, lead_not_found, invalid_status) to 4xx.
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

  // Audit hook — non-blocking. Only audit the actual NULL → now() transition;
  // subsequent calls on an already-contacted lead are no-ops.
  if (
    leadBefore?.first_contacted_at !== result.first_contacted_at &&
    leadBefore?.country_code
  ) {
    try {
      await recordAudit({
        action: "lead.contact",
        targetType: "lead",
        targetId: parsed.data.lead_id,
        countryCode: leadBefore.country_code,
        diff: computeDiff(
          { first_contacted_at: leadBefore.first_contacted_at ?? null },
          { first_contacted_at: result.first_contacted_at },
        ),
        ipHash: hashIpAddress(req.headers.get("x-forwarded-for") ?? ""),
      });
    } catch (auditErr) {
      const message =
        auditErr instanceof Error ? auditErr.message : "audit write failed";
      // eslint-disable-next-line no-console -- structured observability log
      console.warn(
        JSON.stringify({
          event: "audit_write_failed",
          action: "lead.contact",
          targetId: parsed.data.lead_id,
          message,
        }),
      );
    }
  }

  return NextResponse.json(result, { status: 200 });
}
