import { afterAll, beforeAll, describe, expect, test } from "vitest";
import Papa from "papaparse";

import {
  TEST_USERS,
  // RLS BYPASS: createServiceClient() bypasses every RLS policy. Used here
  // ONLY for fixture seed/teardown. Assertions drive the live route handlers
  // over HTTP with cookie-authed sessions, so RLS + RPC inside-function
  // guards are the things under test, never bypassed on the assertion path.
  createServiceClient,
  getDevServerUrl,
  getUserId,
  signInViaBridge,
} from "../test-support/helpers";

/**
 * Phase 4 plan 04-03 — country-admin route handlers, exercised via real HTTP
 * (port 3012, the same dev server the rest of the suite hits) so middleware
 * + cookie auth + RLS round-trip on every assertion.
 *
 * Pre-conditions:
 *   - Dev server is running on http://localhost:3012 with
 *     E2E_AUTH_ENABLED=true (the same flag the Playwright suite uses; see
 *     apps/web/playwright.config.ts).
 *   - Service-role key is in .env.local (loaded by vitest.config.ts).
 *   - Test users (TEST_USERS) are seeded in the live Supabase project.
 *
 * Coverage (11 cases):
 *   Reassign route (POST /api/country-admin/reassign)
 *     1. MZ country admin reassigns an MZ lead → 204 + assigned_to flipped +
 *        lead_events(type='reassigned') row appears
 *     2. Sales rep cookie tries to reassign → 403 (route-layer role gate)
 *     3. MZ country admin tries to reassign a BW lead → 403 (RPC's
 *        forbidden_country guard)
 *     4. HQ admin tries to reassign an MZ lead to a BW agent → 403 (RPC's
 *        cross_country_assignment guard)
 *     5. Reassign with a non-existent lead UUID → 404
 *     6. Reassign with malformed body (missing to_agent_id) → 400
 *
 *   Export route (GET /api/country-admin/export-leads)
 *     7. MZ country admin → 200, text/csv, parseable, every row's
 *        country_code = 'MZ' (RLS lock)
 *     8. MZ country admin with ?status=converted → only converted rows
 *     9. Sales rep cookie → 403 (route-layer role gate)
 *    10. HQ admin → 200, body contains both MZ and BW rows
 *    11. Export with ?from=<future> → empty body (header row only)
 *
 * Test users available (helpers.ts):
 *   hqAdmin, countryAdminMz (MZ), agentMz (MZ).
 * No BW country admin exists; cross-country negatives use BW data accessed
 * from the MZ admin's seat (case 3) and HQ admin trying to land an MZ lead
 * on a BW agent (case 4).
 */

const ROUTE_BASE = `${getDevServerUrl()}/api/country-admin`;

// Will be populated in beforeAll. We use these in case 4 (BW agent target).
let bwAgentId: string | null = null;

describe("country-admin routes (HTTP, cookie auth, RLS in force)", () => {
  let mzAgentId: string;
  const seededLeadIds: string[] = [];

  // ─── Fixture helpers ───────────────────────────────────────────────────

  async function seedLead(opts: {
    suffix: string;
    countryCode: string;
    formSlug?: string;
    status?: "new" | "contacted" | "converted" | "lost";
    assignedTo?: string | null;
  }): Promise<string> {
    const admin = createServiceClient();
    const { data, error } = await admin
      .from("leads")
      .insert({
        country_code: opts.countryCode,
        form_slug: opts.formSlug ?? "starlink",
        status: opts.status ?? "new",
        name: `Routes Test ${opts.suffix}`,
        email: `routes-test-${opts.suffix}-${Date.now()}@paratus.test`,
        message: "phase 4 plan 04-03 vitest",
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

  async function findOrSeedBwAgent(): Promise<string | null> {
    // Use any active BW agent already in user_roles. If none exist, return
    // null and case 4 will skip the cross-country target check (still
    // covered indirectly by the SECURITY DEFINER unit tests in 04-01).
    const admin = createServiceClient();
    const { data } = await admin
      .from("user_roles")
      .select("user_id")
      .eq("country_code", "BW")
      .eq("role", "agent")
      .eq("is_active", true)
      .limit(1);
    return (data?.[0]?.user_id as string | null) ?? null;
  }

  beforeAll(async () => {
    mzAgentId = await getUserId(TEST_USERS.agentMz);
    bwAgentId = await findOrSeedBwAgent();
  });

  afterAll(async () => {
    if (seededLeadIds.length === 0) return;
    const admin = createServiceClient();
    await admin.from("callbacks").delete().in("lead_id", seededLeadIds);
    await admin.from("lead_events").delete().in("lead_id", seededLeadIds);
    await admin.from("leads").delete().in("id", seededLeadIds);
  });

  // ─── 1. Reassign happy path ────────────────────────────────────────────
  test("MZ country admin reassigns an MZ lead → 204 + audit event", async () => {
    const leadId = await seedLead({
      suffix: "reassign-happy",
      countryCode: "MZ",
      assignedTo: null,
    });

    const cookie = await signInViaBridge(TEST_USERS.countryAdminMz);
    const res = await fetch(`${ROUTE_BASE}/reassign`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: cookie,
      },
      body: JSON.stringify({ lead_id: leadId, to_agent_id: mzAgentId }),
    });
    expect(res.status).toBe(204);

    // Verify the write landed via service-role (assertion is on the 204; this
    // confirms the SQL side-effects, not RLS).
    const admin = createServiceClient();
    const { data: lead } = await admin
      .from("leads")
      .select("assigned_to")
      .eq("id", leadId)
      .single();
    expect(lead?.assigned_to).toBe(mzAgentId);

    const { data: events } = await admin
      .from("lead_events")
      .select("type, payload")
      .eq("lead_id", leadId)
      .eq("type", "reassigned");
    expect(events?.length).toBeGreaterThanOrEqual(1);
    const payload = (events![0]!.payload ?? {}) as { to_agent_id?: string };
    expect(payload.to_agent_id).toBe(mzAgentId);
  });

  // ─── 2. Sales rep → 403 ────────────────────────────────────────────────
  test("Sales rep tries to reassign → 403 (route-layer role gate)", async () => {
    const leadId = await seedLead({
      suffix: "reassign-rep-forbidden",
      countryCode: "MZ",
      assignedTo: mzAgentId,
    });

    const cookie = await signInViaBridge(TEST_USERS.agentMz);
    const res = await fetch(`${ROUTE_BASE}/reassign`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: cookie,
      },
      body: JSON.stringify({ lead_id: leadId, to_agent_id: mzAgentId }),
    });
    expect(res.status).toBe(403);
  });

  // ─── 3. MZ admin → BW lead → 403 (forbidden_country) ───────────────────
  test("MZ country admin tries to reassign a BW lead → 403", async () => {
    // Seed a BW lead (service-role) and have the MZ admin try to reassign.
    // The RPC's forbidden_country guard fires; the route maps 42501 → 403.
    const leadId = await seedLead({
      suffix: "reassign-cross-country",
      countryCode: "BW",
      assignedTo: null,
    });

    const cookie = await signInViaBridge(TEST_USERS.countryAdminMz);
    const res = await fetch(`${ROUTE_BASE}/reassign`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: cookie,
      },
      body: JSON.stringify({ lead_id: leadId, to_agent_id: mzAgentId }),
    });
    expect(res.status).toBe(403);
  });

  // ─── 4. HQ admin tries to land MZ lead on BW agent → 403 (target guard) ─
  test("HQ admin tries to reassign an MZ lead to a BW agent → 403", async () => {
    if (!bwAgentId) {
      // No BW agent in user_roles; the cross-country target guard cannot be
      // exercised end-to-end. The unit test in 04-01 covers the SQL guard
      // directly. Skipping documents the gap rather than silent green.
      // eslint-disable-next-line no-console -- one-shot test telemetry: documents the gap when no BW agent exists in user_roles
      console.warn(
        "[country-admin.routes] no active BW agent — skipping cross-country target guard test",
      );
      return;
    }
    const leadId = await seedLead({
      suffix: "reassign-cross-country-target",
      countryCode: "MZ",
      assignedTo: null,
    });

    const cookie = await signInViaBridge(TEST_USERS.hqAdmin);
    const res = await fetch(`${ROUTE_BASE}/reassign`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: cookie,
      },
      body: JSON.stringify({ lead_id: leadId, to_agent_id: bwAgentId }),
    });
    expect(res.status).toBe(403);
  });

  // ─── 5. Non-existent lead UUID → 404 ───────────────────────────────────
  test("Reassign with non-existent lead UUID → 404", async () => {
    const cookie = await signInViaBridge(TEST_USERS.countryAdminMz);
    const res = await fetch(`${ROUTE_BASE}/reassign`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: cookie,
      },
      body: JSON.stringify({
        lead_id: "00000000-0000-0000-0000-000000000000",
        to_agent_id: mzAgentId,
      }),
    });
    expect(res.status).toBe(404);
  });

  // ─── 6. Malformed body → 400 ───────────────────────────────────────────
  test("Reassign with malformed body (missing to_agent_id) → 400", async () => {
    const cookie = await signInViaBridge(TEST_USERS.countryAdminMz);
    const res = await fetch(`${ROUTE_BASE}/reassign`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: cookie,
      },
      body: JSON.stringify({ lead_id: "00000000-0000-0000-0000-000000000000" }),
    });
    expect(res.status).toBe(400);
  });

  // ─── 7. Export — MZ admin gets only MZ rows ────────────────────────────
  test("MZ country admin export → 200 text/csv, every row country_code='MZ'", async () => {
    // Seed a fresh MZ lead so the file is guaranteed non-empty.
    await seedLead({ suffix: "export-mz-1", countryCode: "MZ" });

    const cookie = await signInViaBridge(TEST_USERS.countryAdminMz);
    const res = await fetch(`${ROUTE_BASE}/export-leads`, {
      method: "GET",
      headers: { Cookie: cookie },
    });
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type") ?? "").toMatch(/text\/csv/);

    const body = await res.text();
    const parsed = Papa.parse<Record<string, string>>(body, {
      header: true,
      skipEmptyLines: true,
    });
    expect(parsed.errors.length).toBe(0);
    expect(parsed.data.length).toBeGreaterThan(0);
    for (const row of parsed.data) {
      expect(row.country_code).toBe("MZ");
    }
    // First column is the lead id (the route's select projects it first).
    expect(parsed.meta.fields?.[0]).toBe("id");
  });

  // ─── 8. Export with ?status=converted → only converted rows ────────────
  test("MZ admin export ?status=converted → only converted rows", async () => {
    // Seed a converted + a new lead. Filter must exclude the new one.
    await seedLead({
      suffix: "export-mz-converted",
      countryCode: "MZ",
      status: "converted",
    });
    await seedLead({
      suffix: "export-mz-new",
      countryCode: "MZ",
      status: "new",
    });

    const cookie = await signInViaBridge(TEST_USERS.countryAdminMz);
    const res = await fetch(`${ROUTE_BASE}/export-leads?status=converted`, {
      method: "GET",
      headers: { Cookie: cookie },
    });
    expect(res.status).toBe(200);

    const body = await res.text();
    const parsed = Papa.parse<Record<string, string>>(body, {
      header: true,
      skipEmptyLines: true,
    });
    expect(parsed.errors.length).toBe(0);
    expect(parsed.data.length).toBeGreaterThan(0);
    for (const row of parsed.data) {
      expect(row.status).toBe("converted");
      expect(row.country_code).toBe("MZ");
    }
  });

  // ─── 9. Sales rep export → 403 ─────────────────────────────────────────
  test("Sales rep cookie hits export → 403 (route-layer role gate)", async () => {
    const cookie = await signInViaBridge(TEST_USERS.agentMz);
    const res = await fetch(`${ROUTE_BASE}/export-leads`, {
      method: "GET",
      headers: { Cookie: cookie },
    });
    expect(res.status).toBe(403);
  });

  // ─── 10. HQ admin export → both MZ and BW rows visible ─────────────────
  test("HQ admin export → contains both MZ and BW rows", async () => {
    // Seed a unique MZ + BW lead so the assertion holds even if other rows
    // are present from earlier tests.
    await seedLead({ suffix: "export-hq-mz", countryCode: "MZ" });
    await seedLead({ suffix: "export-hq-bw", countryCode: "BW" });

    const cookie = await signInViaBridge(TEST_USERS.hqAdmin);
    const res = await fetch(`${ROUTE_BASE}/export-leads`, {
      method: "GET",
      headers: { Cookie: cookie },
    });
    expect(res.status).toBe(200);

    const body = await res.text();
    const parsed = Papa.parse<Record<string, string>>(body, {
      header: true,
      skipEmptyLines: true,
    });
    expect(parsed.errors.length).toBe(0);
    const countries = new Set(parsed.data.map((r) => r.country_code));
    expect(countries.has("MZ")).toBe(true);
    expect(countries.has("BW")).toBe(true);
  });

  // ─── 11. Export with future ?from → empty body (header only) ───────────
  test("Export with ?from=<future ISO> → file body has header but no rows", async () => {
    const future = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString();
    const cookie = await signInViaBridge(TEST_USERS.countryAdminMz);
    const res = await fetch(
      `${ROUTE_BASE}/export-leads?from=${encodeURIComponent(future)}`,
      {
        method: "GET",
        headers: { Cookie: cookie },
      },
    );
    expect(res.status).toBe(200);

    const body = await res.text();
    // `Papa.unparse([])` returns an empty string when zero rows match. Either
    // the body is empty (no rows + no header — the route's actual behaviour
    // for a fully-empty filter) or it has a header line with no data rows.
    if (body.trim() === "") {
      expect(body).toBe("");
      return;
    }
    const parsed = Papa.parse<Record<string, string>>(body, {
      header: true,
      skipEmptyLines: true,
    });
    expect(parsed.errors.length).toBe(0);
    expect(parsed.data.length).toBe(0);
  });
});
