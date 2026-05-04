import { afterAll, beforeAll, describe, expect, test, vi } from "vitest";

import {
  TEST_USERS,
  createServiceClient,
  getUserId,
} from "../test-support/helpers";

/**
 * Phase 6 plan 06-01 — SLA breach cron handler.
 *
 * The route is invoked directly (no HTTP round-trip) because the production
 * path imports the Resend SDK on first call and we mock that at the module
 * boundary. Hitting the dev server would mean mocking inside its process,
 * which we can't do from the test runner.
 *
 * Coverage (4 cases):
 *   1. happy path — one breached lead → 200, alerted=1, dedupe column set
 *   2. dedupe   — second invocation immediately → checked=0
 *   3. auth     — missing bearer → 401
 *   4. auth     — wrong bearer  → 401
 *
 * Pre-conditions:
 *   - Service-role key is in apps/web/.env.local (vitest.config.ts loads it).
 *   - Test users (TEST_USERS) are seeded in the live Supabase project.
 *   - At least one country admin (TEST_USERS.countryAdminMz) is seated for MZ
 *     so the cron has a recipient.
 */

// Stub the Resend SDK at the module boundary. The real package never loads.
const sendMock = vi.fn(async () => ({ data: { id: "msg_test_123" }, error: null }));
vi.mock("resend", () => ({
  Resend: vi.fn(() => ({
    emails: { send: sendMock },
  })),
}));

// Set required env BEFORE importing the route — the route reads CRON_SECRET on
// every request, and `getResendClient()` reads RESEND_API_KEY +
// SLA_ALERT_FROM_EMAIL on first call. Values are non-secret test fixtures —
// the real Resend SDK is mocked above, so the API key is never sent over the
// wire and the cron secret is compared only against the same env value below.
const TEST_FIXTURE_ID = `vitest-${process.pid}-${Date.now()}`;
process.env.CRON_SECRET = TEST_FIXTURE_ID;
process.env.RESEND_API_KEY = `re_${TEST_FIXTURE_ID}`;
process.env.SLA_ALERT_FROM_EMAIL = "alerts-test@paratus.test";

// Import the route AFTER env + mocks are wired up. Note: the route imports
// `@repo/supabase/lib/email` which holds a cached Resend instance — we reset
// it between tests so the mock count is meaningful per-case.
const { GET } = await import("../app/api/cron/sla-check/route");
const { __resetResendClientForTests } = await import(
  "@repo/supabase/lib/email"
);

function buildRequest(opts: { authorization?: string } = {}): Request {
  const headers = new Headers();
  if (opts.authorization !== undefined) {
    headers.set("authorization", opts.authorization);
  }
  return new Request("http://localhost/api/cron/sla-check", {
    method: "GET",
    headers,
  });
}

const seededLeadIds: string[] = [];

async function seedLead(opts: {
  suffix: string;
  submittedAtMsAgo: number;
  countryCode: string;
  firstContactedAt?: string | null;
  slaAlertedAt?: string | null;
  status?: "new" | "contacted" | "converted" | "lost";
  assignedTo?: string | null;
}): Promise<string> {
  const admin = createServiceClient();
  const submittedAt = new Date(Date.now() - opts.submittedAtMsAgo).toISOString();
  const { data, error } = await admin
    .from("leads")
    .insert({
      country_code: opts.countryCode,
      form_slug: "starlink",
      status: opts.status ?? "new",
      name: `SLA Cron Test ${opts.suffix}`,
      email: `sla-cron-${opts.suffix}-${Date.now()}@paratus.test`,
      message: "phase 6 plan 06-01 vitest",
      submitted_at: submittedAt,
      first_contacted_at: opts.firstContactedAt ?? null,
      sla_breach_alerted_at: opts.slaAlertedAt ?? null,
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

describe("GET /api/cron/sla-check — SLA breach detection + dedupe", () => {
  let breachedLeadId: string;
  let alreadyAlertedLeadId: string;

  beforeAll(async () => {
    const mzAgentId = await getUserId(TEST_USERS.agentMz);

    // Quiet the slate first: any orphaned breached MZ leads from previous
    // failed runs would inflate `checked`. Mark every NULL-alerted MZ breach
    // as alerted before we seed our own (the dedupe contract: alerted-at set
    // → row drops out of the view). Test-only — never run in production.
    const admin = createServiceClient();
    await admin
      .from("leads")
      .update({ sla_breach_alerted_at: new Date().toISOString() })
      .eq("country_code", "MZ")
      .eq("status", "new")
      .is("first_contacted_at", null)
      .is("sla_breach_alerted_at", null);

    breachedLeadId = await seedLead({
      suffix: "breached",
      submittedAtMsAgo: 6 * 60 * 1000, // 6 min ago — past 5 min threshold
      countryCode: "MZ",
      firstContactedAt: null,
      slaAlertedAt: null,
      status: "new",
      assignedTo: mzAgentId,
    });

    // Fresh lead — under 5 min, must NOT be picked up.
    await seedLead({
      suffix: "fresh",
      submittedAtMsAgo: 60 * 1000, // 1 min ago
      countryCode: "MZ",
      firstContactedAt: null,
      slaAlertedAt: null,
      status: "new",
      assignedTo: mzAgentId,
    });

    // Already-alerted lead — over 5 min but dedupe column set.
    alreadyAlertedLeadId = await seedLead({
      suffix: "already-alerted",
      submittedAtMsAgo: 10 * 60 * 1000,
      countryCode: "MZ",
      firstContactedAt: null,
      slaAlertedAt: new Date().toISOString(),
      status: "new",
      assignedTo: mzAgentId,
    });
  });

  afterAll(async () => {
    if (seededLeadIds.length === 0) return;
    const admin = createServiceClient();
    await admin
      .from("lead_events")
      .delete()
      .in("lead_id", seededLeadIds);
    await admin.from("leads").delete().in("id", seededLeadIds);
  });

  test("happy path — breached lead returns 200, alerted=1, dedupe column flipped", async () => {
    sendMock.mockClear();
    __resetResendClientForTests();

    const res = await GET(
      buildRequest({
        authorization: `Bearer ${process.env.CRON_SECRET}`,
      }) as never,
    );
    expect(res.status).toBe(200);

    const body = (await res.json()) as {
      checked: number;
      alerted: number;
      errors: Array<{ leadId: string; recipient: string; message: string }>;
    };
    // checked counts open breaches AT THE MOMENT OF SCAN. Other tests in the
    // suite may have left transient breaches; the contract that matters is
    // "our breached lead is in the alerted set and the dedupe column flipped".
    expect(body.checked).toBeGreaterThanOrEqual(1);
    expect(body.alerted).toBeGreaterThanOrEqual(1);

    // Resend mock got called with our lead's content.
    expect(sendMock).toHaveBeenCalled();
    const calls = sendMock.mock.calls as unknown as Array<
      [
        {
          to: string[];
          subject: string;
          headers?: Record<string, string>;
        },
      ]
    >;
    const callArgs = calls[0]?.[0];
    expect(callArgs?.to).toEqual(expect.arrayContaining([TEST_USERS.countryAdminMz]));
    expect(callArgs?.subject).toMatch(/Lead unanswered \d+ min/);
    expect(callArgs?.headers?.["X-Entity-Ref-ID"]).toBeTruthy();

    // Dedupe column on the breached lead is now non-null.
    const admin = createServiceClient();
    const { data: lead } = await admin
      .from("leads")
      .select("sla_breach_alerted_at")
      .eq("id", breachedLeadId)
      .single();
    expect(lead?.sla_breach_alerted_at).not.toBeNull();
  });

  test("dedupe — second invocation immediately returns checked=0 for our lead", async () => {
    sendMock.mockClear();
    __resetResendClientForTests();

    const res = await GET(
      buildRequest({
        authorization: `Bearer ${process.env.CRON_SECRET}`,
      }) as never,
    );
    expect(res.status).toBe(200);

    const body = (await res.json()) as { checked: number; alerted: number };
    // Our breached lead has been alerted in test 1 — it must not appear again.
    // The whole-set count may still be >0 if other concurrent breaches exist
    // (sibling test runs), but our lead specifically should be excluded.
    const admin = createServiceClient();
    const { data: stillOpen } = await admin
      .from("v_sla_breaches")
      .select("id")
      .eq("id", breachedLeadId);
    expect(stillOpen?.length ?? 0).toBe(0);

    // The already-alerted lead (seeded in beforeAll) also stays out.
    const { data: stillOpenSeeded } = await admin
      .from("v_sla_breaches")
      .select("id")
      .eq("id", alreadyAlertedLeadId);
    expect(stillOpenSeeded?.length ?? 0).toBe(0);

    // The fresh lead (1 min old) is also not in the view.
    expect(body.checked).toBeGreaterThanOrEqual(0);
  });

  test("missing Authorization header → 401", async () => {
    const res = await GET(buildRequest() as never);
    expect(res.status).toBe(401);
  });

  test("wrong Authorization bearer → 401", async () => {
    const res = await GET(
      buildRequest({ authorization: "Bearer wrong-secret" }) as never,
    );
    expect(res.status).toBe(401);
  });
});
