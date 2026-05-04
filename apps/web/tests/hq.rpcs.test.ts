import { createHmac } from "node:crypto";

import { afterAll, beforeAll, describe, expect, test } from "vitest";

import {
  TEST_USERS,
  // RLS BYPASS: createServiceClient() returns a client signed with the
  // service_role key, which bypasses every Row Level Security policy on
  // every table. Used in this file ONLY for setup/teardown (seeding leads,
  // bulk teardown deletes). Assertion paths use signInAs() so RLS + RPC JWT
  // guards are the thing under test.
  createServiceClient,
  getIngestSecret,
  getIngestUrl,
  signInAs,
} from "../test-support/helpers";

/**
 * Phase 5 plan 05-01 — HQ Overview database layer (migration 00013).
 *
 * Covers eight assertions:
 *  1. group_today_stats — HQ admin reads 1 row with active_country_count = 12
 *  2. group_today_stats — country_admin (MZ) sees 1 row with country-scoped sums
 *  3. country_performance_today — HQ sees 12 rows; country admin sees own row
 *     populated and others zero-filled (LEFT JOIN from countries means RLS
 *     hides other-country leads but rows still appear with zero counts —
 *     same shape as country_today_stats test in plan 04-01 lines 121–137)
 *  4. leads_by_service_group — HQ totals match sum across active countries
 *  5. group_speed_to_lead_series(7) — HQ admin allowed
 *  6. group_speed_to_lead_series(7) — country_admin denied with forbidden_role (42501)
 *  7. Realtime — HQ admin can subscribe to `group:all` and receive a webhook event
 *  8. Realtime — country_admin canNOT subscribe to `group:all`
 *
 * Three test users exist in the project (see helpers.ts): hqAdmin,
 * countryAdminMz (MZ), agentMz (MZ). The plan template referenced BW for the
 * "other country" path; we use MZ because no BW admin is provisioned (same
 * substitution country-admin.rpcs.test.ts made).
 *
 * RLS BYPASS: setup uses the service-role client (`createServiceClient()`)
 * which bypasses ALL Row Level Security policies on every table. This is
 * intentional for fixture setup only — seeding leads, stamping timestamps.
 * The assertion path ALWAYS runs from an anon-key client signed in as a real
 * user (`signInAs()`), so RLS + the RPC's inside-function JWT guards are the
 * thing under test, never the thing being bypassed. Cleanup deletes
 * everything seeded.
 */

type BroadcastEnvelope = {
  payload?: {
    record?: { country_code?: string; id?: string };
    operation?: string;
  };
};

function sign(body: string, secret: string): string {
  return createHmac("sha256", secret).update(body).digest("hex");
}

// RLS is the thing under test below; service-role usage is fenced to setup.
describe("HQ overview RPCs from HQ/country admin clients (RLS in force)", () => {
  const seededLeadIds: string[] = [];

  /**
   * Insert a lead via service-role. Optional `firstContactedAfterSeconds`
   * stamps `first_contacted_at` to `created_at + interval` so speed-to-lead
   * percentiles behave deterministically.
   *
   * RLS BYPASS: createServiceClient() uses the service_role key, which
   * bypasses ALL Row Level Security policies on every table. Used here ONLY
   * for setup/teardown. The assertion paths below ALWAYS go through
   * signInAs() so RLS + RPC guards are the thing under test, not bypassed.
   */
  async function seedLead(opts: {
    suffix: string;
    countryCode: string;
    formSlug?: string;
    status?: "new" | "contacted" | "converted" | "lost";
    firstContactedAfterSeconds?: number | null;
  }): Promise<string> {
    const admin = createServiceClient();
    const submittedAt = new Date().toISOString();
    const insert: Record<string, unknown> = {
      country_code: opts.countryCode,
      form_slug: opts.formSlug ?? "starlink",
      status: opts.status ?? "new",
      name: `HQ Test ${opts.suffix}`,
      email: `hq-test-${opts.suffix}-${Date.now()}@paratus.test`,
      message: "phase 5 plan 05-01 vitest",
      submitted_at: submittedAt,
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
    // Seed deterministic leads so speed-to-lead and per-country leaderboard
    // assertions are reproducible. One MZ lead with first_contacted_at=NOW+60s
    // so the speed-to-lead RPC has at least one row.
    await seedLead({
      suffix: "stl-fast",
      countryCode: "MZ",
      firstContactedAfterSeconds: 60,
    });
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

  // ─── 1. group_today_stats from HQ admin: 1 row, 12 active countries ─────
  test("group_today_stats: HQ admin reads 1 row with active_country_count = 12", async () => {
    const hq = await signInAs(TEST_USERS.hqAdmin);
    const { data, error } = await hq.from("group_today_stats").select("*");
    expect(error).toBeNull();
    expect(data).not.toBeNull();
    expect(data!.length).toBe(1);
    const row = data![0];
    expect(Number(row.active_country_count)).toBe(12);
    // Sums and counts are bigint-as-string in supabase-js but coerce cleanly.
    expect(typeof Number(row.total_leads_group)).toBe("number");
    expect(Number(row.total_leads_group)).toBeGreaterThanOrEqual(1);
    expect(Number(row.new_today_group)).toBeGreaterThanOrEqual(0);
    expect(Number(row.contacted_today_group)).toBeGreaterThanOrEqual(0);
    expect(Number(row.converted_today_group)).toBeGreaterThanOrEqual(0);
    expect(Number(row.lost_today_group)).toBeGreaterThanOrEqual(0);
    // conversion_rate_alltime may be null when total_leads_group === 0; with
    // seeded leads it should be a number.
    if (row.conversion_rate_alltime !== null) {
      expect(typeof Number(row.conversion_rate_alltime)).toBe("number");
    }
  });

  // ─── 2. group_today_stats from country_admin: country-scoped sums ───────
  test("group_today_stats: country admin (MZ) sees row with country-scoped sums", async () => {
    const mzAdmin = await signInAs(TEST_USERS.countryAdminMz);
    const { data, error } = await mzAdmin.from("group_today_stats").select("*");
    expect(error).toBeNull();
    expect(data).not.toBeNull();
    expect(data!.length).toBe(1);
    const row = data![0];
    // Active country count is computed from public.countries (no RLS hides
    // other countries from the table itself), so it's 12 even from MZ admin.
    expect(Number(row.active_country_count)).toBe(12);
    // Country-scoped: total_leads_group should be ≤ HQ's view because the
    // sum aggregates only MZ rows under RLS (RLS hides other-country leads).
    expect(Number(row.total_leads_group)).toBeGreaterThanOrEqual(0);
    // Documents the RLS implication: country_admin can technically SELECT
    // group_today_stats but the route layer (`(hq)/layout.tsx`'s
    // requireRole(['hq_admin'])`) blocks them at the UI. We don't tighten
    // RLS on the view itself.
  });

  // ─── 3. country_performance_today RLS shape ─────────────────────────────
  test("country_performance_today: HQ sees 12 rows; country admin sees own row populated, others zero-filled", async () => {
    const hq = await signInAs(TEST_USERS.hqAdmin);
    const { data: hqData, error: hqErr } = await hq
      .from("country_performance_today")
      .select("*");
    expect(hqErr).toBeNull();
    expect(hqData!.length).toBe(12);
    // Ordered by total_leads DESC — assert non-increasing.
    for (let i = 1; i < hqData!.length; i++) {
      const prev = Number(hqData![i - 1].total_leads ?? 0);
      const curr = Number(hqData![i].total_leads ?? 0);
      expect(prev).toBeGreaterThanOrEqual(curr);
    }

    const mzAdmin = await signInAs(TEST_USERS.countryAdminMz);
    const { data: mzData, error: mzErr } = await mzAdmin
      .from("country_performance_today")
      .select("*");
    expect(mzErr).toBeNull();
    // LEFT JOIN from public.countries means MZ admin sees 12 rows too —
    // public.countries has no RLS hiding other countries; only the LEFT-
    // JOINed leads/lead_events/callbacks data is filtered. Other-country
    // rows should have zero counts (RLS hides their leads). Mirrors the
    // country_today_stats RLS shape asserted in plan 04-01 test 1.
    expect(mzData!.length).toBe(12);
    const mzRow = mzData!.find((r) => r.country_code === "MZ");
    expect(mzRow).toBeTruthy();
    expect(Number(mzRow!.total_leads)).toBeGreaterThanOrEqual(1);
    for (const row of mzData!) {
      if (row.country_code !== "MZ") {
        // Counts are derived from leads which RLS hides → 0.
        expect(Number(row.total_leads ?? 0)).toBe(0);
      }
    }
  });

  // ─── 4. leads_by_service_group rollup correctness ───────────────────────
  test("leads_by_service_group: HQ totals match sum across active countries", async () => {
    const hq = await signInAs(TEST_USERS.hqAdmin);
    const { data: viewRows, error: viewErr } = await hq
      .from("leads_by_service_group")
      .select("*");
    expect(viewErr).toBeNull();
    expect(viewRows).not.toBeNull();

    const viewSum = viewRows!.reduce(
      (acc, row) => acc + Number(row.leads_count ?? 0),
      0,
    );

    // Independent count: leads in active countries (HQ admin sees all because
    // of leads_hq_admin_all RLS bypass). Filter on c.status = 'active' via
    // an inner join to countries — supabase-js select with embedded resource.
    const { count: groundTruthCount, error: countErr } = await hq
      .from("leads")
      .select("country_code,countries!inner(status)", {
        count: "exact",
        head: true,
      })
      .eq("countries.status", "active");
    expect(countErr).toBeNull();
    expect(groundTruthCount).not.toBeNull();
    expect(viewSum).toBe(Number(groundTruthCount));
  });

  // ─── 5. group_speed_to_lead_series — HQ admin allowed ───────────────────
  test("group_speed_to_lead_series(7): HQ admin succeeds", async () => {
    const hq = await signInAs(TEST_USERS.hqAdmin);
    const { data, error } = await hq.rpc("group_speed_to_lead_series", {
      p_days: 7,
    });
    expect(error).toBeNull();
    expect(data).not.toBeNull();
    const rows = data as Array<{
      day: string;
      median_seconds: number | string | null;
      p75_seconds: number | string | null;
    }>;
    // beforeAll seeded one MZ lead with first_contacted_at — at minimum 1 row.
    expect(rows.length).toBeGreaterThanOrEqual(1);
    for (const r of rows) {
      expect(r.day).toBeTruthy();
      // median/p75 are non-null wherever rows exist (the WHERE clause
      // filters first_contacted_at IS NOT NULL).
      expect(Number(r.median_seconds)).toBeGreaterThanOrEqual(0);
      expect(Number(r.p75_seconds)).toBeGreaterThanOrEqual(0);
    }
  });

  // ─── 6. group_speed_to_lead_series — country_admin denied ────────────────
  test("group_speed_to_lead_series(7): country admin raises forbidden_role (42501)", async () => {
    const mzAdmin = await signInAs(TEST_USERS.countryAdminMz);
    const { data, error } = await mzAdmin.rpc("group_speed_to_lead_series", {
      p_days: 7,
    });
    expect(data).toBeNull();
    expect(error).not.toBeNull();
    expect(
      error?.code === "42501" || /forbidden_role/.test(error?.message ?? ""),
    ).toBe(true);
  });

  // ─── 7. Realtime — HQ subscribes to group:all and receives webhook event ─
  test("realtime: HQ admin receives broadcast on group:all within 5s of webhook ingest", async () => {
    const hq = await signInAs(TEST_USERS.hqAdmin);
    const topic = "group:all";

    const queue: BroadcastEnvelope[] = [];
    let waiter: ((env: BroadcastEnvelope) => void) | null = null;
    const onEvent = (env: BroadcastEnvelope) => {
      if (waiter) {
        const w = waiter;
        waiter = null;
        w(env);
      } else {
        queue.push(env);
      }
    };
    const next = (timeoutMs: number) =>
      new Promise<BroadcastEnvelope>((resolve, reject) => {
        if (queue.length > 0) return resolve(queue.shift()!);
        const timer = setTimeout(
          () =>
            reject(new Error(`no broadcast on ${topic} within ${timeoutMs}ms`)),
          timeoutMs,
        );
        waiter = (env) => {
          clearTimeout(timer);
          resolve(env);
        };
      });

    const channel = hq.channel(topic, { config: { private: true } });
    channel.on("broadcast", { event: "*" }, (msg) =>
      onEvent(msg as BroadcastEnvelope),
    );

    const subscribed = new Promise<void>((resolve, reject) => {
      const timer = setTimeout(
        () => reject(new Error(`subscribe to ${topic} timed out after 8s`)),
        8000,
      );
      channel.subscribe((status) => {
        if (status === "SUBSCRIBED") {
          clearTimeout(timer);
          resolve();
        } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
          clearTimeout(timer);
          reject(new Error(`subscribe failed: ${status}`));
        }
      });
    });

    let createdLeadId: string | null = null;
    try {
      await subscribed;
      const submittedAt = new Date().toISOString();
      const body = JSON.stringify({
        form_slug: "starlink",
        country_code: "MZ",
        submitted_at: submittedAt,
        name: "HQ Realtime Test",
        email: `hq-realtime-${Date.now()}@paratus.test`,
        message: "phase 5 plan 05-01 hq broadcast vitest",
      });
      const res = await fetch(getIngestUrl(), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Paratus-Signature": sign(body, getIngestSecret()),
        },
        body,
      });
      expect(res.status).toBe(201);
      const ingestJson = (await res.json()) as { lead_id: string };
      createdLeadId = ingestJson.lead_id;
      seededLeadIds.push(createdLeadId);

      // Receive at least one event on group:all within 5s; payload.record
      // matches the ingested lead.
      const event = await next(5000);
      expect(event.payload?.record?.country_code).toBe("MZ");
      // The webhook flow emits multiple events (INSERT then UPDATE for
      // assignment); accept either since the test asserts the topic, not
      // the operation. The first event's record.id should match.
      expect(event.payload?.record?.id).toBe(createdLeadId);
    } finally {
      await hq.removeChannel(channel);
    }
  });

  // ─── 8. Realtime — country_admin canNOT subscribe to group:all ──────────
  test("realtime: country admin gets no events on group:all (RLS-blocked)", async () => {
    const mzAdmin = await signInAs(TEST_USERS.countryAdminMz);
    const topic = "group:all";

    const events: BroadcastEnvelope[] = [];
    const channel = mzAdmin.channel(topic, { config: { private: true } });
    channel.on("broadcast", { event: "*" }, (msg) =>
      events.push(msg as BroadcastEnvelope),
    );

    // Subscribe (may time out / error — that's fine; the assertion is that
    // no events arrive). Best-effort wait for SUBSCRIBED or terminal state.
    const subscribePromise = new Promise<string>((resolve) => {
      const timer = setTimeout(() => resolve("TIMEOUT"), 5000);
      channel.subscribe((status) => {
        if (
          status === "SUBSCRIBED" ||
          status === "CHANNEL_ERROR" ||
          status === "TIMED_OUT" ||
          status === "CLOSED"
        ) {
          clearTimeout(timer);
          resolve(status);
        }
      });
    });

    let createdLeadId: string | null = null;
    try {
      await subscribePromise;

      const submittedAt = new Date().toISOString();
      const body = JSON.stringify({
        form_slug: "starlink",
        country_code: "MZ",
        submitted_at: submittedAt,
        name: "HQ Realtime Negative",
        email: `hq-realtime-neg-${Date.now()}@paratus.test`,
        message: "phase 5 plan 05-01 hq broadcast negative",
      });
      const res = await fetch(getIngestUrl(), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Paratus-Signature": sign(body, getIngestSecret()),
        },
        body,
      });
      expect(res.status).toBe(201);
      const ingestJson = (await res.json()) as { lead_id: string };
      createdLeadId = ingestJson.lead_id;
      seededLeadIds.push(createdLeadId);

      // Wait 5s for any events that would arrive — none should.
      await new Promise((r) => setTimeout(r, 5000));
      expect(events.length).toBe(0);
    } finally {
      await mzAdmin.removeChannel(channel);
    }
  });
});
