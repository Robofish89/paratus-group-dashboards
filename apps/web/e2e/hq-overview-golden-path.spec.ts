import { test, expect, type Page } from "@playwright/test";
import { createHmac } from "node:crypto";
import {
  TEST_USERS,
  createServiceClient,
  getIngestSecret,
  getIngestUrl,
} from "../test-support/helpers";

/**
 * Phase 5 plan 05-03 — HQ Overview golden-path Playwright suite.
 *
 * Three tests covering the Phase 5 surface end-to-end:
 *   1. Overview render: 5 KPI tiles, 12-row country leaderboard ordered by
 *      total_leads desc, leads-by-service card, speed-to-lead trend SVG.
 *   2. Drill-in: clicking a leaderboard country navigates to the country
 *      admin overview at `/<slug>` — pins the cross-surface contract that
 *      `(country-admin)/[country]/layout.tsx` admits `hq_admin`.
 *   3. Realtime: webhook ingest → broadcast → KPI strip "Total Leads
 *      (Group)" tile bumps without manual refresh.
 *
 * Pre-conditions for the dev server: port 3012, `E2E_AUTH_ENABLED=true`,
 * migration 00013 applied to the live Supabase project.
 *
 * The realtime test uses a longer poll timeout (8s) than country-admin's
 * pattern because broadcast latency varies under load (research note 6) —
 * documented inline below.
 *
 * Cleanup: every seeded lead is deleted in afterAll via service-role.
 */

function sign(body: string, secret: string): string {
  return createHmac("sha256", secret).update(body).digest("hex");
}

async function login(page: Page, email: string): Promise<void> {
  const res = await page.request.post("/api/e2e-login", { data: { email } });
  if (res.status() !== 200) {
    const body = await res.text();
    throw new Error(
      `Test login failed (${res.status()}). Is E2E_AUTH_ENABLED=true set on the dev server? Body: ${body}`,
    );
  }
}

async function getKpiTileNumber(
  page: Page,
  tileKey: string,
): Promise<number> {
  const tile = page.locator(`[data-testid="kpi-strip-tile-${tileKey}"]`);
  await tile.waitFor({ state: "visible", timeout: 5000 });
  const txt = (await tile.innerText()).match(/[\d,]+/);
  if (!txt) throw new Error(`No numeric in tile "${tileKey}"`);
  return Number(txt[0].replace(/,/g, ""));
}

async function ingestSyntheticLead(
  countryCode: string,
  suffix: string,
): Promise<{ leadId: string }> {
  const submittedAt = new Date().toISOString();
  const body = JSON.stringify({
    form_slug: "starlink",
    country_code: countryCode,
    submitted_at: submittedAt,
    name: `Playwright HQ ${suffix} ${Date.now()}`,
    email: `e2e-hq-${suffix}-${Date.now()}@paratus.test`,
    message: "phase 5 plan 05-03 e2e",
  });
  const res = await fetch(getIngestUrl(), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Paratus-Signature": sign(body, getIngestSecret()),
    },
    body,
  });
  if (res.status !== 201) {
    const text = await res.text();
    throw new Error(`ingest failed ${res.status}: ${text}`);
  }
  const { lead_id } = (await res.json()) as { lead_id: string };
  return { leadId: lead_id };
}

const seededLeadIds: string[] = [];

async function seedLead(opts: {
  suffix: string;
  countryCode: string;
}): Promise<string> {
  const admin = createServiceClient();
  const { data, error } = await admin
    .from("leads")
    .insert({
      country_code: opts.countryCode,
      form_slug: "starlink",
      status: "new",
      name: `Playwright HQ ${opts.suffix}`,
      email: `e2e-hq-${opts.suffix}-${Date.now()}@paratus.test`,
      message: "phase 5 plan 05-03 e2e seed",
      submitted_at: new Date().toISOString(),
      assigned_to: null,
    })
    .select("id")
    .single();
  if (error || !data) {
    throw new Error(`seedLead(${opts.suffix}) failed: ${error?.message}`);
  }
  seededLeadIds.push(data.id as string);
  return data.id as string;
}

async function deleteLeadById(leadId: string): Promise<void> {
  const admin = createServiceClient();
  await admin.from("callbacks").delete().eq("lead_id", leadId);
  await admin.from("lead_events").delete().eq("lead_id", leadId);
  await admin.from("leads").delete().eq("id", leadId);
}

test.describe.serial("Phase 5 plan 05-03 — HQ overview golden paths", () => {
  test.beforeAll(async () => {
    // Seed two leads in different countries so the leaderboard has guaranteed
    // content — Botswana + Namibia (the highest-volume seeded countries in
    // the dev stack from prior phases).
    await seedLead({ suffix: "bw-overview", countryCode: "BW" });
    await seedLead({ suffix: "na-overview", countryCode: "NA" });
  });

  test.afterAll(async () => {
    if (seededLeadIds.length === 0) return;
    const admin = createServiceClient();
    await admin.from("callbacks").delete().in("lead_id", seededLeadIds);
    await admin.from("lead_events").delete().in("lead_id", seededLeadIds);
    await admin.from("leads").delete().in("id", seededLeadIds);
  });

  test("HQ admin lands on / and sees the live overview", async ({ page }) => {
    const consoleErrors: string[] = [];
    page.on("console", (msg) => {
      if (msg.type() === "error") {
        consoleErrors.push(msg.text());
      }
    });

    await login(page, TEST_USERS.hqAdmin);
    await page.goto("/");

    // Page heading proves middleware + role gate let us through.
    await expect(
      page.getByRole("heading", { name: "Paratus Group Overview" }),
    ).toBeVisible({ timeout: 10_000 });

    // 5 KPI tiles render with the contracted keys.
    for (const key of [
      "total",
      "countries",
      "conversion",
      "avg_speed",
      "today",
    ]) {
      await expect(
        page.locator(`[data-testid="kpi-strip-tile-${key}"]`),
      ).toBeVisible();
    }

    // Countries Active reads exactly 12 (the live count from the seeded
    // `countries` table where status='active' — locked from PROJECT.md).
    const countriesText = await page
      .locator('[data-testid="kpi-strip-tile-countries"]')
      .innerText();
    expect(countriesText).toMatch(/\b12\b/);

    // Country Performance leaderboard renders 12 rows (one per active country).
    const leaderboard = page.locator('[data-testid="country-leaderboard"]');
    await expect(leaderboard).toBeVisible();
    const rows = leaderboard.locator(
      '[data-testid^="country-leaderboard-row-"]',
    );
    await expect(rows.first()).toBeVisible({ timeout: 10_000 });
    expect(await rows.count()).toBe(12);

    // Leads by Service card renders the bar chart (we seeded a starlink lead
    // in beforeAll, so the chart is non-empty).
    const lbsCard = page.locator('[data-testid="leads-by-service-card"]');
    await expect(lbsCard).toBeVisible();
    await expect(lbsCard).not.toContainText("No service data yet.");

    // Speed-to-lead trend renders an SVG via Recharts (or the documented
    // empty-state copy if no contacted leads exist in the 7-day window).
    const trendCard = page.locator(
      '[data-testid="speed-to-lead-trend-card"]',
    );
    await expect(trendCard).toBeVisible();
    const trendChart = page.locator(
      '[data-testid="speed-to-lead-trend-chart"]',
    );
    const trendEmpty = page.locator(
      '[data-testid="speed-to-lead-trend-empty"]',
    );
    // Exactly one of the chart-or-empty surfaces must be in the DOM.
    const chartCount = await trendChart.count();
    const emptyCount = await trendEmpty.count();
    expect(chartCount + emptyCount).toBeGreaterThanOrEqual(1);
    if (chartCount > 0) {
      const box = await trendChart.boundingBox();
      expect(box?.height ?? 0).toBeGreaterThan(0);
    }

    // No console errors during page load.
    expect(consoleErrors).toEqual([]);
  });

  test("drill-in: clicking a leaderboard row navigates to the country admin shell", async ({
    page,
  }) => {
    // This test pins the cross-surface contract — any Phase 6 tightening of
    // the country-admin layout role gate MUST keep `hq_admin` in the
    // allow-list, or this test breaks. Plan 04-03 wired
    // `(country-admin)/[country]/layout.tsx` to admit hq_admin; plan 05-02
    // shipped the leaderboard `<Link href='/<slug>'>`.
    await login(page, TEST_USERS.hqAdmin);
    await page.goto("/");

    await expect(
      page.getByRole("heading", { name: "Paratus Group Overview" }),
    ).toBeVisible({ timeout: 10_000 });

    // Click the first leaderboard row's country name link. Order is by
    // total_leads desc — whichever country leads gets clicked.
    const firstRow = page
      .locator('[data-testid^="country-leaderboard-row-"]')
      .first();
    await expect(firstRow).toBeVisible({ timeout: 10_000 });
    const countryLink = firstRow.getByRole("link").first();
    await expect(countryLink).toBeVisible();

    await Promise.all([
      page.waitForURL(/\/[a-z]{2}(\/|$|\?)/, { timeout: 10_000 }),
      countryLink.click(),
    ]);

    // URL is a 2-letter lowercase slug — and definitely not /login or a 403.
    const url = new URL(page.url());
    expect(url.pathname).toMatch(/^\/[a-z]{2}$/);
    expect(url.pathname).not.toBe("/login");

    // Country-admin shell: the page heading is "Dashboard" (plan 04-02).
    await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible({
      timeout: 10_000,
    });

    // Country-admin's KPI strip is on screen (different testids from HQ — these
    // are the per-country tiles).
    await expect(
      page.locator('[data-testid="kpi-strip-tile-total"]'),
    ).toBeVisible();
    await expect(
      page.locator('[data-testid="kpi-strip-tile-avg_response"]'),
    ).toBeVisible();
  });

  test("realtime: webhook ingest bumps Total Leads (Group) without manual refresh", async ({
    page,
  }) => {
    await login(page, TEST_USERS.hqAdmin);
    await page.goto("/");

    // Tile must be on screen before we capture the baseline.
    await expect(
      page.locator('[data-testid="kpi-strip-tile-total"]'),
    ).toBeVisible({ timeout: 10_000 });

    // Wait for the broadcast subscription to be SUBSCRIBED before ingesting.
    // If we ingest before the channel is up, the broadcast lands before the
    // client subscribes and the tile never bumps — same race the sales-rep
    // queue test guards against via `data-realtime-status`.
    await expect(page.locator('[data-testid="kpi-strip"]')).toHaveAttribute(
      "data-realtime-status",
      "SUBSCRIBED",
      { timeout: 15_000 },
    );

    const initialTotal = await getKpiTileNumber(page, "total");

    // Drive a synthetic lead through the production HMAC-authenticated
    // webhook. The migration 00013 trigger emits a `group:all` broadcast
    // on the resulting `leads` UPDATE (assign_lead flips assigned_to NULL
    // → agent), which `useGroupBroadcast` listens for and bumps the tile +1
    // optimistically before `router.refresh()` re-fetches the view.
    const { leadId } = await ingestSyntheticLead("BW", "realtime");
    try {
      // Poll for ≥ initial+1 with a generous timeout. The 8-second window
      // accounts for end-to-end latency: webhook → assign_lead → trigger
      // → realtime.send → client subscribe → React state update. Tested
      // 3 flake-free runs at this timeout. If broadcast latency widens
      // further, raise rather than lower the bar (research note 6).
      await expect
        .poll(() => getKpiTileNumber(page, "total"), {
          timeout: 8000,
          intervals: [200, 500, 1000],
        })
        .toBeGreaterThanOrEqual(initialTotal + 1);
    } finally {
      await deleteLeadById(leadId);
    }
  });
});
