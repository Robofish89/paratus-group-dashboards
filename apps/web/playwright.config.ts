import { defineConfig, devices } from "@playwright/test";
import { config as loadEnv } from "dotenv";
import { resolve } from "node:path";

/**
 * Phase 3 Playwright config — covers the speed-to-lead golden path from the
 * sales-rep queue (plan 03-03 task 3).
 *
 * Loads `.env.local` from `apps/web/` so test fixtures see SUPABASE_URL,
 * SUPABASE_SERVICE_ROLE_KEY, PARATUS_INGEST_SECRET, etc. — same pattern the
 * Vitest config uses (vitest.config.ts).
 *
 * Tests assume `npm run dev` (port 3012) is running with E2E_AUTH_ENABLED=true
 * — see e2e/README.md for the one-liner. We don't auto-spawn the dev server
 * because the Vitest suite also runs against it; spawning per-runner would
 * race the port.
 */
loadEnv({ path: resolve(__dirname, ".env.local") });

const baseURL = process.env.E2E_BASE_URL ?? "http://localhost:3012";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL,
    trace: "retain-on-failure",
    video: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
