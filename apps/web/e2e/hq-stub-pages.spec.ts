import { test, expect, type Page } from "@playwright/test";
import { TEST_USERS } from "../test-support/helpers";

/**
 * Phase 5 plan 05-03 — HQ sidebar stub-page contracts.
 *
 * The `hqNav` (apps/web/app/_lib/nav.ts) advertises 4 links: Overview,
 * Countries, Service Mix, Settings. Plan 05-02 wired Overview; this plan
 * shipped placeholder pages for the other three so the nav links resolve
 * (no 404s) and surface a clear "Phase 6 — coming soon" message.
 *
 * These tests pin two contracts:
 *   1. HQ admin can hit each stub and sees the Phase 6 placeholder copy.
 *   2. Country admins are gated out at the route layer (defence-in-depth on
 *      top of middleware) and end up at `/unauthorized`. Note: the HQ
 *      stub paths are NOT country prefixes, so the middleware lets the
 *      request through; the route's `requireRole(['hq_admin'])` is the
 *      thing that bounces them.
 *
 * Pre-conditions: dev server on port 3012, E2E_AUTH_ENABLED=true.
 */

async function login(page: Page, email: string): Promise<void> {
  const res = await page.request.post("/api/e2e-login", { data: { email } });
  if (res.status() !== 200) {
    throw new Error(`login failed ${res.status()}: ${await res.text()}`);
  }
}

test.describe.serial("Phase 5 plan 05-03 — HQ sidebar stub pages", () => {
  test("HQ admin sees the 3 stubs render Phase 6 placeholders", async ({ page }) => {
    await login(page, TEST_USERS.hqAdmin);

    for (const path of ["/countries", "/service-mix", "/settings"]) {
      await page.goto(path);
      await expect(page.getByText("Coming in Phase 6").first()).toBeVisible({
        timeout: 10_000,
      });
      await expect(page.getByText("Phase 6 — coming soon")).toBeVisible();
    }
  });

  test("country admin lands at /unauthorized when hitting /countries (route gate fires)", async ({
    page,
  }) => {
    await login(page, TEST_USERS.countryAdminMz);
    await page.goto("/countries");
    await page.waitForURL(/\/unauthorized/, { timeout: 10_000 });
  });
});
