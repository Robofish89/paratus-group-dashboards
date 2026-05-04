import { afterAll, beforeAll, describe, expect, test } from "vitest";

import {
  TEST_USERS,
  // RLS BYPASS: createServiceClient() returns a client signed with the
  // service_role key, which bypasses every Row Level Security policy on
  // every table. Used in this file ONLY for setup/teardown (seeding leads,
  // synthesising a BW agent for the cross-country defence-in-depth test,
  // and bulk teardown deletes). Assertion paths use signInAs() so RLS +
  // RPC JWT guards are the thing under test.
  createServiceClient,
  getUserId,
  signInAs,
} from "../test-support/helpers";

/**
 * Phase 4 plan 04-01 — country admin views + RPCs from authed clients.
 *
 * Three live test users exist in the project (see helpers.ts + 01-02
 * SUMMARY): hqAdmin, countryAdminMz (MZ), agentMz (MZ). The plan template
 * was written for an NA/BW pair; we map "own country" to MZ and "other
 * country" to BW. There's no BW admin/agent provisioned, so cross-country
 * negative paths are asserted from the MZ admin's seat against BW data, and
 * cross-country target reassignment is asserted via the HQ admin's seat
 * (only one with cross-country reach) against MZ → BW data.
 *
 * RLS BYPASS: setup uses the service-role client (`createServiceClient()`)
 * which bypasses ALL Row Level Security policies on every table. This is
 * intentional for fixture setup only — seeding leads, stamping timestamps,
 * synthesising a temporary BW agent for the cross-country defence test. The
 * assertion path ALWAYS runs from an anon-key client signed in as a real
 * user (`signInAs()`), so RLS + the RPC's inside-function JWT guards are
 * the thing under test, never the thing being bypassed. Cleanup deletes
 * everything seeded.
 */
// RLS is the thing under test below; service-role usage is fenced to setup.
describe("country admin RPCs from country/HQ admin clients (RLS in force)", () => {
  let mzAgentId: string;
  const seededLeadIds: string[] = [];

  /**
   * Insert a lead via service-role. Optional `firstContactedAfter` stamps
   * `first_contacted_at` to `created_at + interval` so speed-to-lead
   * percentiles behave deterministically.
   *
   * RLS BYPASS: createServiceClient() uses the service_role key, which
   * bypasses ALL Row Level Security policies on every table. Used here ONLY
   * for setup/teardown (seeding leads, stamping timestamps) so we can build
   * the fixture state without taking on the role-gymnastics of a multi-user
   * INSERT. The assertion paths below ALWAYS go through signInAs() so RLS +
   * RPC guards are the thing under test, not the thing being bypassed.
   */
  async function seedLead(opts: {
    suffix: string;
    countryCode: string;
    status?: "new" | "contacted" | "converted" | "lost";
    firstContactedAfterSeconds?: number | null;
    assignedTo?: string | null;
  }): Promise<string> {
    // RLS BYPASS: service-role for fixture seed only; never on assertion path.
    const admin = createServiceClient();
    const submittedAt = new Date().toISOString();
    const insert: Record<string, unknown> = {
      country_code: opts.countryCode,
      form_slug: "starlink",
      status: opts.status ?? "new",
      name: `Country Admin Test ${opts.suffix}`,
      email: `country-admin-test-${opts.suffix}-${Date.now()}@paratus.test`,
      message: "phase 4 plan 04-01 vitest",
      submitted_at: submittedAt,
      assigned_to: opts.assignedTo ?? null,
    };
    const { data, error } = await admin
      .from("leads")
      .insert(insert)
      .select("id, created_at")
      .single();
    if (error || !data) {
      throw new Error(`seedLead(${opts.suffix}) failed: ${error?.message}`);
    }

    if (opts.firstContactedAfterSeconds != null) {
      const fc = new Date(
        new Date(data.created_at as string).getTime() +
          opts.firstContactedAfterSeconds * 1000,
      ).toISOString();
      const { error: upErr } = await admin
        .from("leads")
        .update({ first_contacted_at: fc, status: "contacted" })
        .eq("id", data.id);
      if (upErr) throw new Error(`seedLead(${opts.suffix}) stamp failed: ${upErr.message}`);
    }
    seededLeadIds.push(data.id as string);
    return data.id as string;
  }

  beforeAll(async () => {
    mzAgentId = await getUserId(TEST_USERS.agentMz);
  });

  afterAll(async () => {
    if (seededLeadIds.length === 0) return;
    // RLS BYPASS: service-role for teardown only — RLS would block bulk
    // cross-table cascade deletes from any user JWT.
    const admin = createServiceClient();
    await admin.from("callbacks").delete().in("lead_id", seededLeadIds);
    await admin.from("lead_events").delete().in("lead_id", seededLeadIds);
    await admin.from("leads").delete().in("id", seededLeadIds);
  });

  // ─── 1. country_today_stats RLS visibility ───────────────────────────────
  test("country_today_stats: MZ admin sees own row; BW row not visible (RLS)", async () => {
    // Seed two MZ leads so MZ has non-zero counters today.
    await seedLead({ suffix: "today-mz-a", countryCode: "MZ", status: "new" });
    await seedLead({ suffix: "today-mz-b", countryCode: "MZ", status: "new" });

    const mzAdmin = await signInAs(TEST_USERS.countryAdminMz);
    const { data, error } = await mzAdmin.from("country_today_stats").select("*");

    expect(error).toBeNull();
    expect(data).not.toBeNull();
    // RLS on the underlying leads table means the MZ admin only sees rows
    // for their own country. The view aggregates count(l.id) FILTER … which
    // yields 0 for any country whose leads RLS hides — so other-country rows
    // appear with all-zero counts. Assert no row has a non-zero count for a
    // country other than MZ.
    for (const row of data!) {
      if (row.country_code !== "MZ") {
        expect(row.total_leads).toBe(0);
        expect(row.new_today).toBe(0);
        expect(row.contacted_today).toBe(0);
      }
    }
    const mzRow = data!.find((r) => r.country_code === "MZ");
    expect(mzRow).toBeTruthy();
    expect(Number(mzRow!.new_today)).toBeGreaterThanOrEqual(2);
  });

  // ─── 2. country_stats_in_range cross-country block ───────────────────────
  test("country_stats_in_range: MZ admin querying BW raises forbidden_country", async () => {
    const mzAdmin = await signInAs(TEST_USERS.countryAdminMz);
    const from = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const to = new Date(Date.now() + 60_000).toISOString();
    const { data, error } = await mzAdmin.rpc("country_stats_in_range", {
      p_country: "BW",
      p_from: from,
      p_to: to,
    });
    expect(data).toBeNull();
    expect(error).not.toBeNull();
    expect(error?.message ?? "").toMatch(/forbidden_country/);
  });

  test("country_stats_in_range: MZ admin querying own country succeeds", async () => {
    const mzAdmin = await signInAs(TEST_USERS.countryAdminMz);
    const from = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const to = new Date(Date.now() + 60_000).toISOString();
    const { data, error } = await mzAdmin.rpc("country_stats_in_range", {
      p_country: "MZ",
      p_from: from,
      p_to: to,
    });
    expect(error).toBeNull();
    expect(data).not.toBeNull();
    // Function returns TABLE — supabase-js surfaces it as an array of rows.
    const rows = data as Array<{
      converted_count: number;
      lost_count: number;
      contacted_count: number;
      new_count: number;
    }>;
    expect(rows.length).toBe(1);
    expect(typeof rows[0].new_count).toBe("number");
  });

  // ─── 3. HQ admin can query any country ───────────────────────────────────
  test("country_stats_in_range: HQ admin can query any country", async () => {
    const hq = await signInAs(TEST_USERS.hqAdmin);
    const from = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const to = new Date(Date.now() + 60_000).toISOString();

    const mzRes = await hq.rpc("country_stats_in_range", {
      p_country: "MZ",
      p_from: from,
      p_to: to,
    });
    expect(mzRes.error).toBeNull();
    const bwRes = await hq.rpc("country_stats_in_range", {
      p_country: "BW",
      p_from: from,
      p_to: to,
    });
    expect(bwRes.error).toBeNull();
  });

  // ─── 4. agent_performance_in_range LEFT JOIN includes zero-work agents ──
  test("agent_performance_in_range: zero-work agents appear (LEFT JOIN)", async () => {
    const mzAdmin = await signInAs(TEST_USERS.countryAdminMz);
    // Window in the future so even if MZ agent has prior leads, their counts
    // are zero in this window — proving the LEFT JOIN keeps the row.
    const from = new Date(Date.now() + 60 * 60 * 1000).toISOString();
    const to = new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString();
    const { data, error } = await mzAdmin.rpc("agent_performance_in_range", {
      p_country: "MZ",
      p_from: from,
      p_to: to,
    });
    expect(error).toBeNull();
    const rows = data as Array<{
      agent_id: string;
      leads_assigned: number;
      avg_response_seconds: number | null;
    }>;
    const me = rows.find((r) => r.agent_id === mzAgentId);
    expect(me).toBeTruthy();
    expect(Number(me!.leads_assigned)).toBe(0);
    expect(me!.avg_response_seconds).toBeNull();
  });

  // ─── 5. speed_to_lead_series filters first_contacted_at IS NOT NULL ─────
  test("speed_to_lead_series: NULL first_contacted_at leads are excluded", async () => {
    // Seed 5 MZ leads, contact 2 (one fast, one slow). The 3 uncontacted
    // leads must NOT contribute to the percentile.
    await seedLead({ suffix: "stl-skip-1", countryCode: "MZ" });
    await seedLead({ suffix: "stl-skip-2", countryCode: "MZ" });
    await seedLead({ suffix: "stl-skip-3", countryCode: "MZ" });
    await seedLead({
      suffix: "stl-fast",
      countryCode: "MZ",
      firstContactedAfterSeconds: 60, // 1 min
    });
    await seedLead({
      suffix: "stl-slow",
      countryCode: "MZ",
      firstContactedAfterSeconds: 600, // 10 min
    });

    const mzAdmin = await signInAs(TEST_USERS.countryAdminMz);
    const from = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const to = new Date(Date.now() + 60 * 60 * 1000).toISOString();
    const { data, error } = await mzAdmin.rpc("speed_to_lead_series", {
      p_country: "MZ",
      p_from: from,
      p_to: to,
    });
    expect(error).toBeNull();
    const rows = data as Array<{
      day: string;
      median_seconds: number | string;
      p75_seconds: number | string;
    }>;
    expect(rows.length).toBeGreaterThanOrEqual(1);
    // Median of {60, 600} = 330. NULL leads being included would have
    // dropped the median to 0 (or NULL), so a median ≥ 60 proves they're
    // excluded.
    const todays = rows[rows.length - 1];
    expect(Number(todays.median_seconds)).toBeGreaterThanOrEqual(60);
  });

  // ─── 6. reassign_lead happy path ─────────────────────────────────────────
  test("reassign_lead: admin reassigns MZ lead, audit event written", async () => {
    const leadId = await seedLead({
      suffix: "reassign-ok",
      countryCode: "MZ",
      assignedTo: null,
    });

    const mzAdmin = await signInAs(TEST_USERS.countryAdminMz);
    const { error } = await mzAdmin.rpc("reassign_lead", {
      p_lead_id: leadId,
      p_to_agent_id: mzAgentId,
    });
    expect(error).toBeNull();

    // Verify via service role (RLS-bypassing read for the assertion check).
    const admin = createServiceClient();
    const { data: lead } = await admin
      .from("leads")
      .select("assigned_to")
      .eq("id", leadId)
      .single();
    expect(lead?.assigned_to).toBe(mzAgentId);

    const { data: events } = await admin
      .from("lead_events")
      .select("type, payload, country_code")
      .eq("lead_id", leadId)
      .eq("type", "reassigned");
    expect(events?.length).toBeGreaterThanOrEqual(1);
    const reassignEvent = events![0] as {
      payload: { to_agent_id: string };
      country_code: string;
    };
    expect(reassignEvent.payload.to_agent_id).toBe(mzAgentId);
    expect(reassignEvent.country_code).toBe("MZ");
  });

  // ─── 7. reassign_lead role guard ─────────────────────────────────────────
  test("reassign_lead: agent (sales rep) call raises forbidden_role", async () => {
    const leadId = await seedLead({
      suffix: "reassign-role",
      countryCode: "MZ",
      assignedTo: mzAgentId,
    });
    const agent = await signInAs(TEST_USERS.agentMz);
    const { error } = await agent.rpc("reassign_lead", {
      p_lead_id: leadId,
      p_to_agent_id: mzAgentId,
    });
    expect(error).not.toBeNull();
    expect(error?.message ?? "").toMatch(/forbidden_role/);
  });

  // ─── 8. reassign_lead country guard ──────────────────────────────────────
  test("reassign_lead: MZ admin reassigning a BW lead raises forbidden_country", async () => {
    const leadId = await seedLead({
      suffix: "reassign-country",
      countryCode: "BW",
      assignedTo: null,
    });
    const mzAdmin = await signInAs(TEST_USERS.countryAdminMz);
    const { error } = await mzAdmin.rpc("reassign_lead", {
      p_lead_id: leadId,
      p_to_agent_id: mzAgentId,
    });
    expect(error).not.toBeNull();
    expect(error?.message ?? "").toMatch(/forbidden_country/);
  });

  // ─── 9. reassign_lead cross-country target guard (defence-in-depth) ─────
  test("reassign_lead: HQ admin reassigning MZ lead to MZ agent succeeds, " +
    "but cross-country target raises cross_country_assignment", async () => {
    // Happy path from HQ admin (no country_admin guard fires) to a same-
    // country agent succeeds. Then prove the *cross-country* target check
    // bites by feeding a non-MZ agent_id whose user_roles row is in BW.
    const happyLeadId = await seedLead({
      suffix: "reassign-hq-ok",
      countryCode: "MZ",
      assignedTo: null,
    });
    const hq = await signInAs(TEST_USERS.hqAdmin);
    const ok = await hq.rpc("reassign_lead", {
      p_lead_id: happyLeadId,
      p_to_agent_id: mzAgentId,
    });
    expect(ok.error).toBeNull();

    // Now provision a BW user_roles row pointing at the same auth user as
    // mzAgent (a "BW agent" identity, not a real second auth user — the
    // function reads user_roles.country_code, so this gives us a distinct
    // BW target without minting a new Auth user). Use service role.
    // ⚠ BUT user_roles.user_id is UNIQUE — we can't double-register the
    // same auth.users.id. Instead: synthesise a brand-new auth user for
    // BW via the admin API (service role can create users).
    const adminClient = createServiceClient();
    const bwEmail = `country-admin-test-bw-target-${Date.now()}@paratus.test`;
    const { data: created, error: createErr } = await adminClient.auth.admin.createUser({
      email: bwEmail,
      email_confirm: true,
    });
    if (createErr || !created.user) {
      throw new Error(`createUser failed: ${createErr?.message}`);
    }
    const bwUserId = created.user.id;
    try {
      const { error: roleErr } = await adminClient.from("user_roles").insert({
        user_id: bwUserId,
        role: "agent",
        country_code: "BW",
      });
      if (roleErr) throw new Error(`user_roles insert failed: ${roleErr.message}`);

      const crossLeadId = await seedLead({
        suffix: "reassign-cross-country",
        countryCode: "MZ",
        assignedTo: null,
      });
      const cross = await hq.rpc("reassign_lead", {
        p_lead_id: crossLeadId,
        p_to_agent_id: bwUserId,
      });
      expect(cross.error).not.toBeNull();
      expect(cross.error?.message ?? "").toMatch(/cross_country_assignment/);
    } finally {
      // Clean up the synthesised BW agent.
      await adminClient.from("user_roles").delete().eq("user_id", bwUserId);
      await adminClient.auth.admin.deleteUser(bwUserId);
    }
  });

  // ─── 10. reassign_lead not_found ─────────────────────────────────────────
  test("reassign_lead: nonexistent lead UUID raises not_found", async () => {
    const mzAdmin = await signInAs(TEST_USERS.countryAdminMz);
    const { error } = await mzAdmin.rpc("reassign_lead", {
      p_lead_id: "00000000-0000-0000-0000-000000000000",
      p_to_agent_id: mzAgentId,
    });
    expect(error).not.toBeNull();
    expect(error?.message ?? "").toMatch(/not_found/);
  });
});
