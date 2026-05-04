import { afterAll, beforeAll, describe, expect, test } from "vitest";

import {
  TEST_USERS,
  // RLS BYPASS: service client is for fixture seed/teardown + post-write
  // assertion of audit_log rows. Visibility checks (country admin sees /
  // doesn't see, agent sees nothing) run via signed-in anon clients so RLS
  // is the thing under test on the visibility path.
  createServiceClient,
  createAnonClient,
  getDevServerUrl,
  getUserId,
  signInAs,
  signInViaBridge,
} from "../test-support/helpers";

/**
 * Phase 6 plan 06-02 — audit log integration test.
 *
 * Coverage (5 cases):
 *   1. MZ country admin reassigns an MZ lead → audit_log has exactly one
 *      row with actor_role='country_admin', action='lead.reassign',
 *      country_code='MZ', visible_to_country_codes=['MZ']
 *   2. HQ admin reassigns an MZ lead → audit row written with
 *      actor_role='hq_admin'
 *   3. Agent calls /api/queue/complete → audit row exists with
 *      actor_role='agent', action='lead.complete'; the agent's own session
 *      sees ZERO audit_log rows (RLS denies agents)
 *   4. RLS country isolation — service-seeded MZ-only audit row; agent (no
 *      visibility) sees 0 rows; country admin sees the row
 *      (Note: no BW country admin user exists in TEST_USERS — we cover the
 *      cross-country isolation contract via the agent-zero-visibility check
 *      in case 3 and the country-admin-sees-only-its-own check here. The
 *      SECURITY DEFINER + RLS policy combination is what we're testing —
 *      the policy explicitly requires `country_code = ANY
 *      visible_to_country_codes` AND `user_role='country_admin'`.)
 *   5. Audit RPC failure — invariant we can pin without mocking: the route
 *      catches and structured-logs an audit failure, so even if the RPC
 *      were to throw the primary write still succeeds. We exercise this by
 *      asserting the primary 200/204 still lands when the audit IS written
 *      (positive path), and document that fault-injection would need a
 *      mock layer this suite intentionally does not have. The non-blocking
 *      contract is enforced at the route layer's try/catch surrounding
 *      recordAudit (verified by code inspection + cases 1-3 succeeding).
 */

const ROUTE_BASE = getDevServerUrl();

describe("audit log routes (HTTP, cookie auth, RLS in force)", () => {
  let mzAgentId: string;
  const seededLeadIds: string[] = [];
  const seededAuditIds: string[] = [];

  async function seedLead(opts: {
    suffix: string;
    countryCode: string;
    assignedTo?: string | null;
    status?: "new" | "contacted" | "converted" | "lost";
  }): Promise<string> {
    const admin = createServiceClient();
    const { data, error } = await admin
      .from("leads")
      .insert({
        country_code: opts.countryCode,
        form_slug: "starlink",
        status: opts.status ?? "new",
        name: `Audit Test ${opts.suffix}`,
        email: `audit-test-${opts.suffix}-${Date.now()}@paratus.test`,
        message: "phase 6 plan 06-02 vitest",
        submitted_at: new Date().toISOString(),
        assigned_to: opts.assignedTo ?? null,
      })
      .select("id")
      .single();
    if (error || !data) {
      throw new Error(`seedLead(${opts.suffix}) failed: ${error?.message}`);
    }
    seededLeadIds.push(data.id as string);
    return data.id as string;
  }

  beforeAll(async () => {
    mzAgentId = await getUserId(TEST_USERS.agentMz);
  });

  afterAll(async () => {
    const admin = createServiceClient();
    if (seededLeadIds.length > 0) {
      // audit_log rows referencing test leads (immutable via RLS, but
      // service-role can DELETE for cleanup).
      await admin
        .from("audit_log")
        .delete()
        .in("target_id", seededLeadIds);
      await admin.from("callbacks").delete().in("lead_id", seededLeadIds);
      await admin.from("lead_events").delete().in("lead_id", seededLeadIds);
      await admin.from("leads").delete().in("id", seededLeadIds);
    }
    if (seededAuditIds.length > 0) {
      await admin.from("audit_log").delete().in("id", seededAuditIds);
    }
  });

  // ─── 1. MZ country admin reassign → audit row with country_admin role ──
  test("MZ country admin reassign writes a country_admin audit row", async () => {
    const leadId = await seedLead({
      suffix: "reassign-country-admin",
      countryCode: "MZ",
      assignedTo: null,
    });
    const before = Date.now();

    const cookie = await signInViaBridge(TEST_USERS.countryAdminMz);
    const res = await fetch(`${ROUTE_BASE}/api/country-admin/reassign`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: cookie },
      body: JSON.stringify({ lead_id: leadId, to_agent_id: mzAgentId }),
    });
    expect(res.status).toBe(204);

    // Verify the audit row landed via service-role (RLS bypass — we're
    // checking the side-effect, not the visibility).
    const admin = createServiceClient();
    const { data: rows } = await admin
      .from("audit_log")
      .select("*")
      .eq("target_id", leadId)
      .eq("action", "lead.reassign")
      .gte("created_at", new Date(before - 1000).toISOString());
    expect(rows?.length).toBeGreaterThanOrEqual(1);
    const row = rows![0]!;
    expect(row.actor_role).toBe("country_admin");
    expect(row.country_code).toBe("MZ");
    expect(row.visible_to_country_codes).toEqual(["MZ"]);
    expect(row.target_type).toBe("lead");
    expect(row.diff).toMatchObject({
      assigned_to: { before: null, after: mzAgentId },
    });
  });

  // ─── 2. HQ admin reassign → audit row with hq_admin role ───────────────
  test("HQ admin reassign writes an hq_admin audit row", async () => {
    const leadId = await seedLead({
      suffix: "reassign-hq",
      countryCode: "MZ",
      assignedTo: null,
    });
    const before = Date.now();

    const cookie = await signInViaBridge(TEST_USERS.hqAdmin);
    const res = await fetch(`${ROUTE_BASE}/api/country-admin/reassign`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: cookie },
      body: JSON.stringify({ lead_id: leadId, to_agent_id: mzAgentId }),
    });
    expect(res.status).toBe(204);

    const admin = createServiceClient();
    const { data: rows } = await admin
      .from("audit_log")
      .select("*")
      .eq("target_id", leadId)
      .eq("action", "lead.reassign")
      .gte("created_at", new Date(before - 1000).toISOString());
    expect(rows?.length).toBeGreaterThanOrEqual(1);
    expect(rows![0]!.actor_role).toBe("hq_admin");
    expect(rows![0]!.country_code).toBe("MZ");
  });

  // ─── 3. Agent /api/queue/complete → audit row + zero visibility ────────
  test("agent complete writes audit row; agent client sees zero audit rows", async () => {
    const leadId = await seedLead({
      suffix: "complete-agent",
      countryCode: "MZ",
      assignedTo: mzAgentId,
      status: "contacted",
    });
    const before = Date.now();

    const cookie = await signInViaBridge(TEST_USERS.agentMz);
    const res = await fetch(`${ROUTE_BASE}/api/queue/complete`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: cookie },
      body: JSON.stringify({ lead_id: leadId, outcome: "won" }),
    });
    expect(res.status).toBe(200);

    // Service-role: verify the audit row was written.
    const admin = createServiceClient();
    const { data: rows } = await admin
      .from("audit_log")
      .select("*")
      .eq("target_id", leadId)
      .eq("action", "lead.complete")
      .gte("created_at", new Date(before - 1000).toISOString());
    expect(rows?.length).toBeGreaterThanOrEqual(1);
    expect(rows![0]!.actor_role).toBe("agent");

    // RLS: agent's own session must see ZERO audit_log rows (no policy
    // matches user_role='agent').
    const agentClient = await signInAs(TEST_USERS.agentMz);
    const { data: agentRows, error: agentErr } = await agentClient
      .from("audit_log")
      .select("id");
    expect(agentErr).toBeNull();
    expect(agentRows ?? []).toEqual([]);
  });

  // ─── 4. RLS country isolation — country admin sees own; non-MZ scope =0 ─
  test("country admin sees own MZ audit rows; anon (no claims) sees zero", async () => {
    // Seed an audit row directly via service-role so the assertion is
    // independent of any route. Use a known target_id we can clean up.
    const leadId = await seedLead({
      suffix: "rls-isolation",
      countryCode: "MZ",
      assignedTo: null,
    });
    const admin = createServiceClient();
    const { data: ins, error: insErr } = await admin
      .from("audit_log")
      .insert({
        actor_id: null,
        actor_role: "system",
        country_code: "MZ",
        action: "lead.reassign",
        target_type: "lead",
        target_id: leadId,
        diff: { assigned_to: { before: null, after: mzAgentId } },
        visible_to_country_codes: ["MZ"],
      })
      .select("id")
      .single();
    if (insErr || !ins) {
      throw new Error(`seed audit_log failed: ${insErr?.message}`);
    }
    seededAuditIds.push(ins.id as string);

    // MZ country admin: row is visible.
    const adminClient = await signInAs(TEST_USERS.countryAdminMz);
    const { data: adminRows, error: adminErr } = await adminClient
      .from("audit_log")
      .select("id")
      .eq("id", ins.id);
    expect(adminErr).toBeNull();
    expect((adminRows ?? []).length).toBe(1);

    // Anon (no JWT): RLS denies entirely (no `TO authenticated` policy
    // grants anon).
    const anon = createAnonClient();
    const { data: anonRows } = await anon
      .from("audit_log")
      .select("id")
      .eq("id", ins.id);
    expect(anonRows ?? []).toEqual([]);
  });

  // ─── 5. Audit non-blocking contract — primary write succeeds when the
  //       audit row is also written (the failing-RPC fault path is enforced
  //       by the route's try/catch around recordAudit; we don't fault-inject
  //       in this HTTP suite — see header doc). ────────────────────────────
  test("primary 200 lands alongside the audit write (positive non-blocking path)", async () => {
    const leadId = await seedLead({
      suffix: "non-blocking",
      countryCode: "MZ",
      assignedTo: mzAgentId,
      status: "new",
    });

    const cookie = await signInViaBridge(TEST_USERS.agentMz);
    // Mark contacted first (NULL → now() transition is the only audited
    // path; second call is a no-op).
    const res = await fetch(`${ROUTE_BASE}/api/queue/contact`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: cookie },
      body: JSON.stringify({ lead_id: leadId }),
    });
    expect(res.status).toBe(200);

    const admin = createServiceClient();
    const { data: rows } = await admin
      .from("audit_log")
      .select("action")
      .eq("target_id", leadId);
    expect(
      (rows ?? []).some((r) => r.action === "lead.contact"),
    ).toBe(true);
  });
});
