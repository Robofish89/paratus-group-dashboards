import { describe, expect, test } from "vitest";

import {
  computeResponseStatus,
  RESPONSE_STATUS_THRESHOLDS,
} from "@repo/supabase/schemas";
import {
  TEST_USERS,
  signInAs,
} from "../test-support/helpers";

/**
 * Phase 5 plan 05-02 — HQ overview DAL surface verified end-to-end against
 * migration 00013 + DAL query shape.
 *
 * The DAL itself imports `server-only` and uses the cookie-authed Supabase
 * client; we can't import the query helpers directly into vitest (Node, no
 * Next request context). Instead these tests mirror the DAL's query shape
 * against an anon-key client signed in as a real user, so:
 *
 *   - the SELECT projection + ordering chain matches what the DAL emits
 *   - the RPC arguments + return shape match what the DAL parses
 *   - RLS + the RPC's inside-function JWT guards are the thing under test
 *
 * `computeResponseStatus()` is a pure function — imported directly.
 *
 * Plan 05-01 already covers RLS visibility + RPC guards directly; this file
 * proves the DAL's query patterns are sound (row shape, ordering, RPC arg
 * shape) and pins the status-bucket boundaries.
 *
 * Test users (helpers.ts): hqAdmin, countryAdminMz (MZ).
 */
describe("HQ overview DAL behaviour (RLS + RPC guards in force)", () => {
  // ─── 1. getGroupTodayStats — single row, 12 active countries from HQ ────
  test("getGroupTodayStats: HQ admin returns single row with active_country_count = 12", async () => {
    const hq = await signInAs(TEST_USERS.hqAdmin);
    // DAL shape: .from('group_today_stats').select('*').single()
    const { data, error } = await hq
      .from("group_today_stats")
      .select("*")
      .single();

    expect(error).toBeNull();
    expect(data).not.toBeNull();
    expect(Number(data!.active_country_count)).toBe(12);
    // Sums and counts coerce cleanly via Number().
    expect(Number(data!.total_leads_group)).toBeGreaterThanOrEqual(0);
    expect(Number(data!.new_today_group)).toBeGreaterThanOrEqual(0);
    expect(Number(data!.contacted_today_group)).toBeGreaterThanOrEqual(0);
    expect(Number(data!.converted_today_group)).toBeGreaterThanOrEqual(0);
    expect(Number(data!.lost_today_group)).toBeGreaterThanOrEqual(0);
  });

  // ─── 2. getCountryPerformanceToday — 12 rows, ordered by total_leads DESC ─
  test("getCountryPerformanceToday: HQ returns 12 rows ordered by total_leads DESC", async () => {
    const hq = await signInAs(TEST_USERS.hqAdmin);
    // DAL shape: .from('country_performance_today').select('*')
    const { data, error } = await hq
      .from("country_performance_today")
      .select("*");

    expect(error).toBeNull();
    expect(data).not.toBeNull();
    expect(data!.length).toBe(12);
    // View-level ordering preserved by supabase-js — assert non-increasing.
    for (let i = 1; i < data!.length; i += 1) {
      const prev = Number(data![i - 1].total_leads ?? 0);
      const curr = Number(data![i].total_leads ?? 0);
      expect(prev).toBeGreaterThanOrEqual(curr);
    }
    // Spot-check row shape: country_code is non-null on every row (LEFT
    // JOIN's left side is the active countries set).
    for (const row of data!) {
      expect(row.country_code).toBeTruthy();
      expect(row.country_name).toBeTruthy();
    }
  });

  // ─── 3. getLeadsByServiceGroup — total reconciles to total_leads_group ──
  test("getLeadsByServiceGroup: sum of leads_count matches total_leads_group", async () => {
    const hq = await signInAs(TEST_USERS.hqAdmin);
    const { data: serviceRows, error: serviceErr } = await hq
      .from("leads_by_service_group")
      .select("*");
    expect(serviceErr).toBeNull();
    expect(serviceRows).not.toBeNull();

    const sum = serviceRows!.reduce(
      (acc, row) => acc + Number(row.leads_count ?? 0),
      0,
    );

    const { data: today, error: todayErr } = await hq
      .from("group_today_stats")
      .select("total_leads_group")
      .single();
    expect(todayErr).toBeNull();
    expect(Number(today!.total_leads_group)).toBe(sum);
  });

  // ─── 4. getGroupSpeedToLeadSeries — HQ allowed; country_admin denied ────
  test("getGroupSpeedToLeadSeries(7): HQ admin allowed; country admin raises 42501", async () => {
    const hq = await signInAs(TEST_USERS.hqAdmin);
    const { data: hqData, error: hqErr } = await hq.rpc(
      "group_speed_to_lead_series",
      { p_days: 7 },
    );
    expect(hqErr).toBeNull();
    expect(hqData).not.toBeNull();
    // Empty array is acceptable when no contacted leads in the window;
    // when seeded, prior tests will have stamped first_contacted_at.
    const rows = hqData as Array<{
      day: string;
      median_seconds: number | string | null;
      p75_seconds: number | string | null;
    }>;
    expect(Array.isArray(rows)).toBe(true);
    expect(rows.length).toBeLessThanOrEqual(7);

    const mzAdmin = await signInAs(TEST_USERS.countryAdminMz);
    const { data: mzData, error: mzErr } = await mzAdmin.rpc(
      "group_speed_to_lead_series",
      { p_days: 7 },
    );
    expect(mzData).toBeNull();
    expect(mzErr).not.toBeNull();
    expect(
      mzErr?.code === "42501" ||
        /forbidden_role/.test(mzErr?.message ?? ""),
    ).toBe(true);
  });

  // ─── 5. computeResponseStatus — table-driven boundary cases ─────────────
  test("computeResponseStatus: table-driven boundaries", () => {
    const cases: Array<[number | null, "green" | "amber" | "red"]> = [
      [null, "red"],
      [0, "green"],
      [299, "green"],
      [300, "amber"],
      [479, "amber"],
      [480, "amber"],
      [481, "red"],
      [1000, "red"],
    ];
    for (const [seconds, expected] of cases) {
      expect(computeResponseStatus(seconds)).toBe(expected);
    }
  });

  // ─── 6. computeResponseStatus — 5-min boundary pinned ───────────────────
  test("computeResponseStatus: 5-minute boundary pinned to constants", () => {
    // Pin to RESPONSE_STATUS_THRESHOLDS so a future tweak to the constants
    // doesn't silently drift the status semantics.
    expect(RESPONSE_STATUS_THRESHOLDS.green).toBe(300);
    expect(RESPONSE_STATUS_THRESHOLDS.amber).toBe(480);
    expect(
      computeResponseStatus(RESPONSE_STATUS_THRESHOLDS.green - 1),
    ).toBe("green");
    expect(computeResponseStatus(RESPONSE_STATUS_THRESHOLDS.green)).toBe(
      "amber",
    );
    expect(computeResponseStatus(RESPONSE_STATUS_THRESHOLDS.amber)).toBe(
      "amber",
    );
    expect(
      computeResponseStatus(RESPONSE_STATUS_THRESHOLDS.amber + 1),
    ).toBe("red");
  });

  // ─── 7. computeResponseStatus — hasData=false short-circuits to none ────
  test("computeResponseStatus: hasData=false returns 'none' regardless of seconds", () => {
    // Empty country (no leads at all) — must NOT alarm red just because
    // avg_response_seconds is null. Semantically distinct from "leads exist
    // but none have been contacted" which is genuinely off-target (red).
    expect(computeResponseStatus(null, { hasData: false })).toBe("none");
    expect(computeResponseStatus(0, { hasData: false })).toBe("none");
    expect(computeResponseStatus(600, { hasData: false })).toBe("none");

    // hasData=true (or omitted) keeps the existing semantics intact.
    expect(computeResponseStatus(null, { hasData: true })).toBe("red");
    expect(computeResponseStatus(120, { hasData: true })).toBe("green");
    expect(computeResponseStatus(120)).toBe("green");
  });
});
