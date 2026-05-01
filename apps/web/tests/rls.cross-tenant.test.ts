import { afterAll, beforeAll, describe, expect, test } from "vitest";

import {
  TEST_USERS,
  createServiceClient,
  getUserId,
  signInAs,
} from "./_helpers";

/**
 * Phase 2 acceptance — cross-tenant RLS verification.
 *
 * The roadmap requires: "cross-country RLS read returns 0". This file proves
 * it for every role boundary the system has:
 *
 *   - country_admin@MZ querying country_code='BW'  → 0 rows
 *   - country_admin@MZ querying country_code='MZ'  → ≥ 1 row
 *   - agent@MZ querying leads                      → only their own assigned
 *   - hq_admin querying leads                      → sees both MZ and BW
 *
 * Every assertion runs from a CLIENT (anon-key) Supabase client signed in as
 * the test user — service_role is used ONLY for setup/teardown so RLS is the
 * thing being tested, not the thing being bypassed.
 *
 * Setup state required (seeded by plan 02-02):
 *   - 1 lead with country_code='MZ' (smoke seed)
 *   - 1 lead with country_code='BW' (smoke seed)
 *   - 1 lead with country_code='ZA' (smoke seed)
 * Three users from plan 01-02 (Gmail+ aliases) drive the assertions.
 */
describe("cross-tenant RLS on public.leads", () => {
  let mzAgentId: string;
  let assignedLeadId: string | null = null;

  beforeAll(async () => {
    // Make sure the agent-visibility branch has something to see: assign the
    // existing MZ smoke lead to the MZ agent so the agent's "see only mine"
    // assertion has signal. Service-role bypasses RLS for this setup write.
    const admin = createServiceClient();
    mzAgentId = await getUserId(TEST_USERS.agentMz);
    const { data: mzLead, error: mzErr } = await admin
      .from("leads")
      .select("id")
      .eq("country_code", "MZ")
      .order("submitted_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (mzErr) throw new Error(`seed lookup failed: ${mzErr.message}`);
    if (!mzLead) throw new Error("expected at least one MZ smoke lead from plan 02-02");

    assignedLeadId = mzLead.id;
    const { error: updateErr } = await admin
      .from("leads")
      .update({ assigned_to: mzAgentId })
      .eq("id", mzLead.id);
    if (updateErr) throw new Error(`seed assign failed: ${updateErr.message}`);
  });

  afterAll(async () => {
    // Roll the assignment back so plan 02-06's other tests (and future plans)
    // start from the same clean slate the cross-tenant assertions assume.
    if (!assignedLeadId) return;
    const admin = createServiceClient();
    await admin.from("leads").update({ assigned_to: null }).eq("id", assignedLeadId);
  });

  test("country_admin@MZ cannot read leads from country_code='BW'", async () => {
    const mz = await signInAs(TEST_USERS.countryAdminMz);
    const { data, error } = await mz
      .from("leads")
      .select("id")
      .eq("country_code", "BW");

    // RLS hides rows; it does NOT raise an error. Both must hold.
    expect(error).toBeNull();
    expect(data).toEqual([]);
  });

  test("country_admin@MZ can read leads from their own country", async () => {
    const mz = await signInAs(TEST_USERS.countryAdminMz);
    const { data, error } = await mz
      .from("leads")
      .select("id, country_code")
      .eq("country_code", "MZ");

    expect(error).toBeNull();
    expect(data).not.toBeNull();
    expect(data!.length).toBeGreaterThanOrEqual(1);
    // Defense-in-depth: every row that did come back is in MZ.
    for (const row of data!) {
      expect(row.country_code).toBe("MZ");
    }
  });

  test("agent@MZ only sees leads where assigned_to = their uid", async () => {
    const agent = await signInAs(TEST_USERS.agentMz);
    const { data, error } = await agent.from("leads").select("id, assigned_to, country_code");

    expect(error).toBeNull();
    expect(data).not.toBeNull();
    // At least the seed assignment from beforeAll must be visible.
    expect(data!.length).toBeGreaterThanOrEqual(1);
    for (const row of data!) {
      expect(row.assigned_to).toBe(mzAgentId);
      // Agent policy also pins country_code = JWT.country_code.
      expect(row.country_code).toBe("MZ");
    }
  });

  test("hq_admin sees leads from both MZ and BW", async () => {
    const hq = await signInAs(TEST_USERS.hqAdmin);
    const { data, error } = await hq
      .from("leads")
      .select("country_code")
      .in("country_code", ["MZ", "BW"]);

    expect(error).toBeNull();
    expect(data).not.toBeNull();
    const countries = new Set(data!.map((r) => r.country_code));
    expect(countries.has("MZ")).toBe(true);
    expect(countries.has("BW")).toBe(true);
  });
});
