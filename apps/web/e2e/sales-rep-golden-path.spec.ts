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
 * Phase 3 plan 03-03 — Speed-to-lead golden path.
 *
 * Single-test E2E spec. Strategy:
 *   1. Authenticate as the MZ agent via the test-only `/api/e2e-login`
 *      route (POST sets the SSR session cookies; the route returns 404 unless
 *      E2E_AUTH_ENABLED=true is set on the dev server's env).
 *   2. Open `/mz/queue` and capture the initial To Call count from the stats
 *      strip.
 *   3. POST a fresh signed lead at country_code='MZ' via the production
 *      `/api/leads/ingest` webhook. Round-robin assigns it to this agent
 *      (only active MZ agent).
 *   4. Wait up to 5s for a card carrying that lead's id to appear (selector:
 *      [data-action="call-lead"][data-lead-id="<id>"], with the parent card
 *      flashed `data-fresh="true"`).
 *   5. Click the card's Call Now → assert the modal opens with the lead name.
 *   6. Pick "Qualified", type a note, submit → modal closes, lead disappears
 *      from To Call, "Completed" stat increments by 1.
 *   7. Teardown: service-role delete the seeded lead + its lead_events +
 *      callbacks.
 *
 * The trace artefact lands under `apps/web/e2e/test-results/` on failure.
 */

function sign(body: string, secret: string): string {
  return createHmac("sha256", secret).update(body).digest("hex");
}

async function getStatNumber(page: Page, label: string): Promise<number> {
  // QueueStats renders 4 cards with their label as text content. Read the
  // numeric sibling. Locator strategy: find the element with the label text,
  // scope to its containing card, read the first <p|div> matching a numeric.
  const card = page
    .locator("div", { has: page.locator(`text="${label}"`) })
    .first();
  await card.waitFor({ state: "attached", timeout: 5000 });
  const numericText = (await card.innerText()).match(/\b(\d+)\b/);
  if (!numericText) throw new Error(`No numeric in stat card "${label}"`);
  return Number(numericText[1]);
}

async function login(page: Page, email: string): Promise<void> {
  // POST through the test-only login route. Playwright's request fixture
  // shares its CookieJar with the BrowserContext, so the Set-Cookie headers
  // land in the browser's storage state for subsequent navigations.
  const res = await page.request.post("/api/e2e-login", {
    data: { email },
  });
  if (res.status() !== 200) {
    const body = await res.text();
    throw new Error(
      `Test login failed (${res.status()}). ` +
        `Is E2E_AUTH_ENABLED=true set on the dev server? Body: ${body}`,
    );
  }
}

test.describe.serial("Phase 3 — speed-to-lead golden path", () => {
  let createdLeadId: string | null = null;
  let agentId: string;

  test.beforeAll(async () => {
    agentId = await getUserId(TEST_USERS.agentMz);
  });

  test.afterAll(async () => {
    if (!createdLeadId) return;
    const admin = createServiceClient();
    await admin.from("callbacks").delete().eq("lead_id", createdLeadId);
    await admin.from("lead_events").delete().eq("lead_id", createdLeadId);
    await admin.from("leads").delete().eq("id", createdLeadId);
  });

  test("agent receives lead via realtime, calls, qualifies, stats update", async ({
    page,
  }) => {
    // 1. Sign the agent in.
    await login(page, TEST_USERS.agentMz);

    // 2. Land on queue page.
    await page.goto("/mz/queue");
    await expect(page.getByText("Call Queue")).toBeVisible({
      timeout: 10_000,
    });

    // Wait for the realtime channel to finish its SUBSCRIBED handshake — the
    // queue-view exposes its private-broadcast status as data-realtime-status
    // on the root. Without this, ingest broadcasts that fire before the
    // channel is joined are silently dropped (same hazard documented in
    // tests/realtime.broadcast.test.ts).
    await expect(page.locator('[data-testid="queue-view"]')).toHaveAttribute(
      "data-realtime-status",
      "SUBSCRIBED",
      { timeout: 10_000 },
    );

    const initialCompleted = await getStatNumber(page, "Completed");

    // 3. Fire a signed lead at the public webhook. The webhook path emits an
    //    `UPDATE` broadcast on assigned_to flip — the queue's
    //    useAgentBroadcast subscriber handles either op.
    const submittedAt = new Date().toISOString();
    const body = JSON.stringify({
      form_slug: "starlink",
      country_code: "MZ",
      submitted_at: submittedAt,
      name: `Playwright ${Date.now()}`,
      email: `e2e-${Date.now()}@paratus.test`,
      message: "phase 3 e2e golden path",
    });
    const ingestRes = await fetch(getIngestUrl(), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Paratus-Signature": sign(body, getIngestSecret()),
      },
      body,
    });
    expect(ingestRes.status).toBe(201);
    const ingestJson = (await ingestRes.json()) as {
      lead_id: string;
      agent_id: string | null;
    };
    createdLeadId = ingestJson.lead_id;
    expect(ingestJson.agent_id).toBe(agentId);

    // 4. New card lands within 5s. Selector targets the Call Now button
    //    bound to that lead id.
    const callButton = page.locator(
      `[data-action="call-lead"][data-lead-id="${createdLeadId}"]`,
    );
    await expect(callButton).toBeVisible({ timeout: 5000 });

    // The parent card should carry data-fresh="true" for the 4-second flash.
    const card = page.locator(
      `[data-fresh="true"]:has([data-lead-id="${createdLeadId}"])`,
    );
    await expect(card).toBeVisible({ timeout: 1000 });

    // 5. Click Call Now. Modal opens with the lead name.
    await callButton.click();
    const modal = page.getByRole("dialog", { name: "Complete Call" });
    await expect(modal).toBeVisible();
    await expect(
      modal.getByText(/Playwright \d+/),
    ).toBeVisible();

    // 6. Pick "Qualified" + notes + submit.
    await modal
      .locator("#call-outcome-select")
      .selectOption("qualified");
    await modal
      .locator("#call-outcome-notes")
      .fill("playwright e2e");
    await modal.getByRole("button", { name: "Submit" }).click();

    // Modal closes.
    await expect(modal).not.toBeVisible({ timeout: 5000 });

    // The card should no longer be in To Call.
    await expect(callButton).not.toBeVisible({ timeout: 5000 });

    // "Completed" stat increments by 1 after router.refresh() resolves.
    await expect
      .poll(() => getStatNumber(page, "Completed"), {
        timeout: 8000,
      })
      .toBe(initialCompleted + 1);
  });
});
