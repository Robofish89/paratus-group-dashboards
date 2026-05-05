import { defineConfig } from "vitest/config";
import { config as loadEnv } from "dotenv";
import { resolve } from "node:path";

// Load apps/web/.env.local so tests see SUPABASE_SERVICE_ROLE_KEY,
// PARATUS_INGEST_SECRET, NEXT_PUBLIC_SUPABASE_*. The Next.js dev server loads
// this automatically; vitest does not, so we read it here.
loadEnv({ path: resolve(__dirname, ".env.local") });

export default defineConfig({
  resolve: {
    alias: {
      // The `server-only` shim throws on import outside an RSC graph (Next's
      // build-time guard). Vitest runs in plain Node, so we alias it to a
      // no-op module. The runtime-time guarantee is unchanged in production —
      // Webpack/Turbopack still enforces the boundary at build time.
      "server-only": resolve(__dirname, "test-support/server-only-shim.ts"),
    },
  },
  test: {
    environment: "node",
    testTimeout: 20000,
    // `supabase start` cold-boots can take 60–90s on a fresh machine; bump
    // the global hook timeout so the first run doesn't false-fail.
    hookTimeout: 120000,
    // Boots a local Supabase stack before the suite runs and tears it down
    // after. Set VITEST_USE_CLOUD=1 to skip and run against the cloud
    // project (single suite, manual debugging only — chained suites trip
    // Supabase Auth's 4-magiclinks-per-hour rate limit).
    globalSetup: ["./vitest.global-setup.ts"],
    // Each test file talks to the same Supabase project; run sequentially so
    // cleanup hooks in one file don't race the assertions in another.
    fileParallelism: false,
    // Vitest owns `tests/` and `scripts/__tests__/` only. Playwright owns
    // `e2e/` (different runner + BrowserContext lifecycle). Without this
    // scope vitest tries to load .spec.ts files that import
    // @playwright/test and crashes.
    //
    // `scripts/__tests__/` is the build-tool-boundary lane — provisioning
    // script + future bulk migration tools live there with their tests.
    include: [
      "tests/**/*.{test,spec}.{ts,tsx}",
      "scripts/__tests__/**/*.{test,spec}.{ts,tsx}",
    ],
  },
});
