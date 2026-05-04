import { test, expect, type Page } from "@playwright/test";
import { createHmac } from "node:crypto";
import {
  TEST_USERS,
  createServiceClient,
  getIngestSecret,
  getIngestUrl,
  getUserId,
} from "../test-support/helpers";

/**
 * Phase 3 plan 03-04 — Sales-rep golden paths (rewritten for the inline
 * outcome buttons + Follow-ups tab + new vocabulary).
 *
 * Three tests:
 *   1. Tab labels match the new vocabulary (To Call · Follow-ups ·
 *      Converted · Lost).
 *   2. Converted golden path: ingest → realtime card → Call → Converted →
 *      assert lead lands in Converted tab + Converted tile increments.
 *   3. No-answer 3× → lead routes to Follow-ups tab with Try-again CTA.
 *
 * The seeded test leads are torn down via service-role in afterEach so
 * tests don't bleed state into each other.
 *
 * Pre-conditions for the dev server: port 3012, E2E_AUTH_ENABLED=true,
 * migration 00010 applied to the live Supabase project.
 */

function sign(body: string, secret: string): string {
  return createHmac("sha256", secret).update(body).digest("hex");
}

async function getTileNumber(page: Page, tileKey: string): Promise<number> {
  const tile = page.locator(`[data-tile="${tileKey}"]`);
  await tile.waitFor({ state: "visible", timeout: 5000 });
  const txt = (await tile.innerText()).match(/\b(\d+)\b/);
  if (!txt) throw new Error(`No numeric in tile "${tileKey}"`);
  return Number(txt[1]);
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

async function ingestLead(suffix: string): Promise<{ leadId: string }> {
  const submittedAt = new Date().toISOString();
  const body = JSON.stringify({
    form_slug: "starlink",
    country_code: "MZ",
    submitted_at: submittedAt,
    name: `Playwright ${suffix} ${Date.now()}`,
    email: `e2e-${suffix}-${Date.now()}@paratus.test`,
    message: "phase 3 plan 04 e2e",
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

async function deleteLead(leadId: string): Promise<void> {
  const admin = createServiceClient();
  await admin.from("callbacks").delete().eq("lead_id", leadId);
  await admin.from("lead_events").delete().eq("lead_id", leadId);
  await admin.from("leads").delete().eq("id", leadId);
}

test.describe.serial("Phase 3 plan 04 — sales-rep golden paths", () => {
  test.beforeAll(async () => {
    // Sanity: agent user exists.
    await getUserId(TEST_USERS.agentMz);
  });

  test("tab labels render the new vocabulary (To Call · Follow-ups · Converted · Lost)", async ({
    page,
  }) => {
    await login(page, TEST_USERS.agentMz);
    await page.goto("/mz/queue");
    // Page heading is "My Leads" (set in plan 03-04 polish — copy-voice
    // correction logged in user memory).
    await expect(
      page.getByRole("heading", { name: "My Leads" }),
    ).toBeVisible({ timeout: 10_000 });

    // Use a strict role-and-name match anchored on the rendered <button>
    // children of the TabBar. We don't depend on counts because they're
    // dynamic across runs.
    await expect(
      page.getByRole("button", { name: /^To Call/ }).first(),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: /^Follow-ups/ }).first(),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: /^Converted/ }).first(),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: /^Lost/ }).first(),
    ).toBeVisible();
  });

  test("converted path: ingest → call → converted → tile +1", async ({
    page,
  }) => {
    await login(page, TEST_USERS.agentMz);
    await page.goto("/mz/queue?range=today");

    // Realtime channel must be SUBSCRIBED before we ingest, or the broadcast
    // arrives before the subscription is up and the card never lands.
    await expect(page.locator('[data-testid="queue-view"]')).toHaveAttribute(
      "data-realtime-status",
      "SUBSCRIBED",
      { timeout: 15_000 },
    );

    const initialConverted = await getTileNumber(page, "converted");

    const { leadId } = await ingestLead("converted");
    try {
      // Card lands within 5s.
      const callButton = page.locator(
        `[data-action="call-lead"][data-lead-id="${leadId}"]`,
      );
      await expect(callButton).toBeVisible({ timeout: 5000 });

      // Card flashes fresh.
      const freshCard = page.locator(
        `[data-fresh="true"][data-lead-id="${leadId}"]`,
      );
      await expect(freshCard).toBeVisible({ timeout: 1000 });

      // Tap Call → mid-call state shows three pills + No-answer link.
      await callButton.click();
      const cardScope = page.locator(`[data-lead-id="${leadId}"]`);
      await expect(
        cardScope.locator('[data-action="converted"]'),
      ).toBeVisible({ timeout: 5000 });
      await expect(cardScope.locator('[data-action="lost"]')).toBeVisible();
      await expect(
        cardScope.locator('[data-action="callback"]'),
      ).toBeVisible();
      await expect(
        cardScope.locator('[data-action="no-answer"]'),
      ).toBeVisible();

      // Tap Converted.
      await cardScope.locator('[data-action="converted"]').click();

      // Card disappears from To Call list (the call-lead button no longer
      // exists for this lead in the active tab).
      await expect(callButton).not.toBeVisible({ timeout: 5000 });

      // Converted tile +1.
      await expect
        .poll(() => getTileNumber(page, "converted"), { timeout: 8000 })
        .toBe(initialConverted + 1);
    } finally {
      await deleteLead(leadId);
    }
  });

  test("no-answer 3× routes the lead to Follow-ups with a Try again CTA", async ({
    page,
  }) => {
    await login(page, TEST_USERS.agentMz);
    await page.goto("/mz/queue");

    await expect(page.locator('[data-testid="queue-view"]')).toHaveAttribute(
      "data-realtime-status",
      "SUBSCRIBED",
      { timeout: 15_000 },
    );

    const { leadId } = await ingestLead("no-answer-3x");
    try {
      const callButton = page.locator(
        `[data-action="call-lead"][data-lead-id="${leadId}"]`,
      );
      await expect(callButton).toBeVisible({ timeout: 5000 });

      // Three call → no-answer cycles.
      for (let i = 1; i <= 3; i += 1) {
        await page
          .locator(`[data-action="call-lead"][data-lead-id="${leadId}"]`)
          .click();
        await expect(
          page.locator(
            `[data-lead-id="${leadId}"] [data-action="no-answer"]`,
          ),
        ).toBeVisible({ timeout: 5000 });
        await page
          .locator(`[data-lead-id="${leadId}"] [data-action="no-answer"]`)
          .click();
        // Wait for the busy state to clear before the next cycle.
        // Bumped from 8s to 12s in plan 06-04 — the broadcast emit
        // round-trip can land just after the original deadline; re-tune if
        // the flake re-surfaces at this timeout.
        await expect
          .poll(
            async () => {
              const attemptsAttr = await page
                .locator(`[data-lead-id="${leadId}"]`)
                .first()
                .getAttribute("data-attempts");
              return Number(attemptsAttr ?? -1);
            },
            { timeout: 12000 },
          )
          .toBeGreaterThanOrEqual(i);
      }

      // After 3 no-answers, the lead is no longer in To Call.
      await expect(callButton).not.toBeVisible({ timeout: 5000 });

      // Switch to Follow-ups tab; lead is there with a Try again CTA.
      await page.getByRole("button", { name: /^Follow-ups/ }).first().click();
      const followUpButton = page.locator(
        `[data-lead-id="${leadId}"] [data-action="call-lead"]`,
      );
      await expect(followUpButton).toBeVisible({ timeout: 5000 });
      await expect(followUpButton).toContainText(/Try again/);
    } finally {
      await deleteLead(leadId);
    }
  });
});
