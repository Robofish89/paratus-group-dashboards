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
    hookTimeout: 20000,
    // Each test file talks to the same live Supabase project; run sequentially
    // so cleanup hooks in one file don't race the assertions in another.
    fileParallelism: false,
    // Vitest owns `tests/` only. Playwright owns `e2e/` (different runner +
    // BrowserContext lifecycle). Without this scope vitest tries to load
    // .spec.ts files that import @playwright/test and crashes.
    include: ["tests/**/*.{test,spec}.{ts,tsx}"],
  },
});
