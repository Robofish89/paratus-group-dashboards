import "server-only";

import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { createClient } from "@repo/supabase/server";
import { getCurrentUserClaims, markLeadContacted } from "@repo/supabase/dal";

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

  try {
    const result = await markLeadContacted(parsed.data.lead_id);
    return NextResponse.json(result, { status: 200 });
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
}
