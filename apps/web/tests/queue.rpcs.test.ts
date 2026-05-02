import { afterAll, beforeAll, describe, expect, test } from "vitest";

import {
  TEST_USERS,
  createServiceClient,
  getUserId,
  signInAs,
} from "../test-support/helpers";

/**
 * Phase 3 plan 03-01 — sales-rep queue RPCs from a real agent client.
 *
 * Every assertion runs from an anon-key Supabase client signed in as the MZ
 * agent (RLS in force). The three RPCs (mark_lead_contacted, complete_call,
 * schedule_callback) plus the cross-tenant `forbidden` guard.
 *
 * Setup uses service-role to seed leads assigned to the MZ agent (and one
 * lead unassigned for the cross-tenant test). Teardown deletes everything
 * the suite created — `email LIKE 'queue-test-%'` is the cleanup key, so a
 * lingering process or partial run leaves no debris that blocks re-runs.
 */
describe("queue RPCs from agent client (RLS in force)", () => {
  let agentId: string;
  const seededLeadIds: string[] = [];

  // Helper: insert a lead via service-role (seeding only; never on assertion path).
  async function seedLead(opts: {
    suffix: string;
    countryCode: string;
    assignedTo: string | null;
    status?: "new" | "contacted";
  }): Promise<string> {
    const admin = createServiceClient();
    const { data, error } = await admin
      .from("leads")
      .insert({
        country_code: opts.countryCode,
        form_slug: "starlink",
        status: opts.status ?? "new",
        name: `Queue Test ${opts.suffix}`,
        email: `queue-test-${opts.suffix}-${Date.now()}@paratus.test`,
        message: "phase 3 plan 03-01 vitest",
        submitted_at: new Date().toISOString(),
        assigned_to: opts.assignedTo,
      })
      .select("id")
      .single();
    if (error || !data) {
      throw new Error(`seedLead(${opts.suffix}) failed: ${error?.message}`);
    }
    seededLeadIds.push(data.id);
    return data.id;
  }

  beforeAll(async () => {
    agentId = await getUserId(TEST_USERS.agentMz);
  });

  afterAll(async () => {
    if (seededLeadIds.length === 0) return;
    const admin = createServiceClient();
    // Children first (callbacks + lead_events) — both have ON DELETE CASCADE
    // on lead_id, but explicit deletion makes failure modes cheaper to debug
    // and means the email-prefix cleanup below would also work as a fallback.
    await admin.from("callbacks").delete().in("lead_id", seededLeadIds);
    await admin.from("lead_events").delete().in("lead_id", seededLeadIds);
    await admin.from("leads").delete().in("id", seededLeadIds);
  });

  test("mark_lead_contacted flips status, stamps timestamp, writes call event", async () => {
    const leadId = await seedLead({
      suffix: "mark",
      countryCode: "MZ",
      assignedTo: agentId,
    });

    const agent = await signInAs(TEST_USERS.agentMz);
    const { data, error } = await agent.rpc("mark_lead_contacted", {
      p_lead_id: leadId,
    });

    expect(error).toBeNull();
    expect(data).not.toBeNull();
    const result = data as { lead_id: string; first_contacted_at: string };
    expect(result.lead_id).toBe(leadId);
    expect(typeof result.first_contacted_at).toBe("string");

    // Re-read via the agent client — RLS allows because assigned_to=auth.uid().
    const { data: lead, error: leadErr } = await agent
      .from("leads")
      .select("status, first_contacted_at")
      .eq("id", leadId)
      .single();
    expect(leadErr).toBeNull();
    expect(lead?.status).toBe("contacted");
    expect(lead?.first_contacted_at).not.toBeNull();

    const { data: events, error: evtErr } = await agent
      .from("lead_events")
      .select("type, outcome, actor_id")
      .eq("lead_id", leadId)
      .eq("type", "call");
    expect(evtErr).toBeNull();
    expect(events?.length).toBeGreaterThanOrEqual(1);
    const callEvent = events?.find((e) => e.outcome === "connected");
    expect(callEvent).toBeTruthy();
    expect(callEvent?.actor_id).toBe(agentId);
  });

  test("complete_call with outcome='won' converts lead + writes outcome event + caches last_outcome", async () => {
    const leadId = await seedLead({
      suffix: "won",
      countryCode: "MZ",
      assignedTo: agentId,
      status: "contacted",
    });

    const agent = await signInAs(TEST_USERS.agentMz);
    const { data, error } = await agent.rpc("complete_call", {
      p_lead_id: leadId,
      p_outcome: "won",
      p_notes: "great fit",
    });

    expect(error).toBeNull();
    const result = data as { lead_id: string; status: string; outcome: string };
    expect(result.status).toBe("converted");
    expect(result.outcome).toBe("won");

    const { data: lead } = await agent
      .from("leads")
      .select("status, converted_at, last_outcome, call_attempts")
      .eq("id", leadId)
      .single();
    expect(lead?.status).toBe("converted");
    expect(lead?.converted_at).not.toBeNull();
    expect(lead?.last_outcome).toBe("won");
    expect(lead?.call_attempts).toBe(1);

    const { data: events } = await agent
      .from("lead_events")
      .select("type, outcome, note, actor_id")
      .eq("lead_id", leadId)
      .eq("type", "call")
      .order("created_at", { ascending: false })
      .limit(1);
    expect(events?.[0]?.outcome).toBe("won");
    expect(events?.[0]?.note).toBe("great fit");
    expect(events?.[0]?.actor_id).toBe(agentId);
  });

  test("complete_call rejects 'qualified' (plan 03-04 narrowed enum)", async () => {
    const leadId = await seedLead({
      suffix: "qualified-rejected",
      countryCode: "MZ",
      assignedTo: agentId,
      status: "contacted",
    });

    const agent = await signInAs(TEST_USERS.agentMz);
    const { data, error } = await agent.rpc("complete_call", {
      p_lead_id: leadId,
      p_outcome: "qualified",
    });

    expect(data).toBeNull();
    expect(error).not.toBeNull();
    expect(error?.message ?? "").toMatch(/invalid_outcome/);
  });

  test("record_no_answer increments call_attempts + writes no_answer event each call", async () => {
    const leadId = await seedLead({
      suffix: "no-answer",
      countryCode: "MZ",
      assignedTo: agentId,
      status: "contacted",
    });

    const agent = await signInAs(TEST_USERS.agentMz);

    for (let i = 1; i <= 3; i += 1) {
      const { data, error } = await agent.rpc("record_no_answer", {
        p_lead_id: leadId,
      });
      expect(error).toBeNull();
      const result = data as { lead_id: string; call_attempts: number };
      expect(result.lead_id).toBe(leadId);
      expect(result.call_attempts).toBe(i);
    }

    // Lead status unchanged — Follow-ups predicate routes it via call_attempts.
    const { data: lead } = await agent
      .from("leads")
      .select("status, call_attempts, last_outcome")
      .eq("id", leadId)
      .single();
    expect(lead?.status).toBe("contacted");
    expect(lead?.call_attempts).toBe(3);
    expect(lead?.last_outcome).toBe("no_answer");

    // Three audit events, all type='call' outcome='no_answer'.
    const { data: events } = await agent
      .from("lead_events")
      .select("type, outcome")
      .eq("lead_id", leadId)
      .eq("type", "call")
      .eq("outcome", "no_answer");
    expect(events?.length).toBe(3);
  });

  test("agent_today_stats.done_today counts a full call cycle as 1, not 2", async () => {
    // Plan 03-03 bug: completed_today summed every lead_events row of type='call',
    // which counted both the 'connected' event from mark_lead_contacted AND the
    // outcome event from complete_call — i.e. one call cycle = 2.
    // Plan 03-04 fix: done_today counts terminal-status leads (status flips),
    // so one full cycle = 1.
    const leadId = await seedLead({
      suffix: "single-count",
      countryCode: "MZ",
      assignedTo: agentId,
      status: "new",
    });

    const agent = await signInAs(TEST_USERS.agentMz);

    const beforeRes = await agent
      .from("agent_today_stats")
      .select("done_today")
      .eq("agent_id", agentId)
      .single();
    const beforeDone = (beforeRes.data?.done_today ?? 0) as number;

    const markRes = await agent.rpc("mark_lead_contacted", { p_lead_id: leadId });
    expect(markRes.error).toBeNull();
    const completeRes = await agent.rpc("complete_call", {
      p_lead_id: leadId,
      p_outcome: "won",
      p_notes: "single-count check",
    });
    expect(completeRes.error).toBeNull();

    const afterRes = await agent
      .from("agent_today_stats")
      .select("done_today")
      .eq("agent_id", agentId)
      .single();
    const afterDone = (afterRes.data?.done_today ?? 0) as number;

    expect(afterDone - beforeDone).toBe(1);
  });

  test("agent_stats_in_range returns expected counts for a [from, to) window", async () => {
    // Two converted + one lost in the window; stats RPC must surface
    // {converted_count: 2, lost_count: 1}. Use a tight 5-min window so we
    // don't double-count any pre-existing lead from earlier tests.
    const wonA = await seedLead({
      suffix: "range-won-a",
      countryCode: "MZ",
      assignedTo: agentId,
      status: "contacted",
    });
    const wonB = await seedLead({
      suffix: "range-won-b",
      countryCode: "MZ",
      assignedTo: agentId,
      status: "contacted",
    });
    const lostA = await seedLead({
      suffix: "range-lost-a",
      countryCode: "MZ",
      assignedTo: agentId,
      status: "contacted",
    });

    const agent = await signInAs(TEST_USERS.agentMz);
    const from = new Date(Date.now() - 60_000).toISOString();

    await agent.rpc("complete_call", { p_lead_id: wonA, p_outcome: "won" });
    await agent.rpc("complete_call", { p_lead_id: wonB, p_outcome: "won" });
    await agent.rpc("complete_call", {
      p_lead_id: lostA,
      p_outcome: "lost",
      p_lost_reason: "test",
    });

    const to = new Date(Date.now() + 60_000).toISOString();
    const { data, error } = await agent.rpc("agent_stats_in_range", {
      p_from: from,
      p_to: to,
    });

    expect(error).toBeNull();
    const result = data as {
      converted_count: number;
      lost_count: number;
      done_count: number;
    };
    expect(result.converted_count).toBeGreaterThanOrEqual(2);
    expect(result.lost_count).toBeGreaterThanOrEqual(1);
    expect(result.done_count).toBeGreaterThanOrEqual(3);
  });

  test("schedule_callback rejects past times and accepts future times", async () => {
    const leadId = await seedLead({
      suffix: "callback",
      countryCode: "MZ",
      assignedTo: agentId,
      status: "contacted",
    });

    const agent = await signInAs(TEST_USERS.agentMz);

    // Past time → 'invalid_schedule' raised inside the RPC.
    const past = await agent.rpc("schedule_callback", {
      p_lead_id: leadId,
      p_scheduled_for: "2020-01-01T00:00:00Z",
    });
    expect(past.error).not.toBeNull();
    expect(past.error?.message ?? "").toMatch(/invalid_schedule/);

    // Future time (now + 1h) → success.
    const future = new Date(Date.now() + 60 * 60 * 1000).toISOString();
    const ok = await agent.rpc("schedule_callback", {
      p_lead_id: leadId,
      p_scheduled_for: future,
      p_notes: "follow up tomorrow",
    });
    expect(ok.error).toBeNull();
    const result = ok.data as { callback_id: string; lead_id: string };
    expect(result.lead_id).toBe(leadId);
    expect(typeof result.callback_id).toBe("string");

    // Callback row landed under the agent, in MZ, status pending.
    const { data: cb } = await agent
      .from("callbacks")
      .select("assigned_to, country_code, status, scheduled_for")
      .eq("id", result.callback_id)
      .single();
    expect(cb?.assigned_to).toBe(agentId);
    expect(cb?.country_code).toBe("MZ");
    expect(cb?.status).toBe("pending");

    // The matching lead_event was written.
    const { data: events } = await agent
      .from("lead_events")
      .select("type, note, actor_id")
      .eq("lead_id", leadId)
      .eq("type", "callback_scheduled");
    expect(events?.length).toBeGreaterThanOrEqual(1);
    expect(events?.[0]?.note).toBe("follow up tomorrow");
    expect(events?.[0]?.actor_id).toBe(agentId);
  });

  test("cross-tenant: agent cannot mark_lead_contacted on a lead assigned to nobody", async () => {
    // Seed a lead in MZ but unassigned. The agent's auth.uid() != assigned_to,
    // so the SECURITY DEFINER guard inside the RPC raises 'forbidden'. (We
    // can't seed a lead assigned to "another agent" because the test project
    // currently has only one MZ agent — but the guard is the same: auth.uid
    // must equal assigned_to. Unassigned has assigned_to=NULL, which fails
    // the IS DISTINCT FROM check identically.)
    const leadId = await seedLead({
      suffix: "forbidden",
      countryCode: "MZ",
      assignedTo: null,
    });

    const agent = await signInAs(TEST_USERS.agentMz);
    const { data, error } = await agent.rpc("mark_lead_contacted", {
      p_lead_id: leadId,
    });

    expect(data).toBeNull();
    expect(error).not.toBeNull();
    expect(error?.message ?? "").toMatch(/forbidden/);
  });
});
