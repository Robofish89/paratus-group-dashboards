import "server-only";

import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@repo/supabase/server";
import {
  ForbiddenError,
  NotFoundError,
  computeDiff,
  getCurrentUserClaims,
  hashIpAddress,
  reassignLead,
  recordAudit,
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
 * Phase 6 plan 06-02 — after the primary write succeeds, write an
 * `audit_log` row capturing actor + before/after assigned_to + visibility
 * scope. Cross-country reassign (HQ-initiated, source_country !=
 * target_country) writes ONE row visible to BOTH country admins via the
 * `visible_to_country_codes` array column. Audit failure is logged as a
 * structured warning and never blocks the primary 204 response.
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

  // Read the lead's current assigned_to + country_code BEFORE the RPC, then
  // re-read AFTER, so the audit row carries an accurate diff. RLS scopes
  // these reads to what the caller can already see — country admins see only
  // their country, HQ sees all. The supabase client reuses the same cookie
  // session as the RPC.
  const supabase = await createClient();
  const { data: leadBefore } = await supabase
    .from("leads")
    .select("assigned_to, country_code")
    .eq("id", parsed.data.lead_id)
    .maybeSingle();

  try {
    await reassignLead(parsed.data);
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

  // Audit hook — non-blocking. Lead-after read scopes via RLS too.
  try {
    const { data: leadAfter } = await supabase
      .from("leads")
      .select("assigned_to, country_code")
      .eq("id", parsed.data.lead_id)
      .maybeSingle();

    const beforeAssigned = leadBefore?.assigned_to ?? null;
    const afterAssigned = leadAfter?.assigned_to ?? parsed.data.to_agent_id;
    const sourceCountry = leadBefore?.country_code ?? leadAfter?.country_code ?? null;
    const targetCountry = leadAfter?.country_code ?? sourceCountry;

    if (targetCountry) {
      const visibility =
        sourceCountry && sourceCountry !== targetCountry
          ? [sourceCountry, targetCountry]
          : [targetCountry];

      await recordAudit({
        action: "lead.reassign",
        targetType: "lead",
        targetId: parsed.data.lead_id,
        countryCode: targetCountry,
        diff: computeDiff(
          { assigned_to: beforeAssigned },
          { assigned_to: afterAssigned },
        ),
        visibleToCountryCodes: visibility,
        ipHash: hashIpAddress(req.headers.get("x-forwarded-for") ?? ""),
      });
    }
  } catch (auditErr) {
    const message =
      auditErr instanceof Error ? auditErr.message : "audit write failed";
    // eslint-disable-next-line no-console -- structured observability log; primary write already succeeded
    console.warn(
      JSON.stringify({
        event: "audit_write_failed",
        action: "lead.reassign",
        targetId: parsed.data.lead_id,
        message,
      }),
    );
  }

  return new NextResponse(null, { status: 204 });
}
