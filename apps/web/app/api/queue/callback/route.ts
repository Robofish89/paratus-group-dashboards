import "server-only";

import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@repo/supabase/server";
import {
  getCurrentUserClaims,
  scheduleCallback,
  completeCall,
} from "@repo/supabase/dal";
import { scheduleCallbackInput } from "@repo/supabase/schemas/queue";

/**
 * Phase 3 queue route — POST /api/queue/callback.
 *
 * Wraps `schedule_callback` AND records a `complete_call({outcome:'callback'})`
 * event so the call event is persisted alongside the callbacks row. Both must
 * succeed; if the second call fails we surface the error and leave the
 * callback row in place (it's authoritative — the missing event is logged
 * downstream by the SUMMARY worker).
 *
 * Body: { lead_id, scheduled_for, notes? } — validated via scheduleCallbackInput.
 *
 * Returns: { callback_id, lead_id, scheduled_for } on 200.
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

  const parsed = scheduleCallbackInput.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.flatten() },
      { status: 400 },
    );
  }

  try {
    const callback = await scheduleCallback(parsed.data);
    // Record the call event too — keeps lead_events complete for the SUMMARY
    // view + audit trail. complete_call's 'callback' outcome is event-only
    // (no status mutation), so this is non-destructive.
    await completeCall({
      lead_id: parsed.data.lead_id,
      outcome: "callback",
      notes: parsed.data.notes,
    });
    return NextResponse.json(callback, { status: 200 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "rpc failed";
    if (/forbidden/i.test(message)) {
      return NextResponse.json({ error: "forbidden" }, { status: 403 });
    }
    if (/invalid_schedule/i.test(message)) {
      return NextResponse.json({ error: "invalid_schedule" }, { status: 400 });
    }
    if (/lead_not_found/i.test(message)) {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
