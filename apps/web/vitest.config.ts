import { defineConfig } from "vitest/config";
import { config as loadEnv } from "dotenv";
import { resolve } from "node:path";

// Load apps/web/.env.local so tests see SUPABASE_SERVICE_ROLE_KEY,
// PARATUS_INGEST_SECRET, NEXT_PUBLIC_SUPABASE_*. The Next.js dev server loads
// this automatically; vitest does not, so we read it here.
loadEnv({ path: resolve(__dirname, ".env.local") });

export default defineConfig({
  test: {
    environment: "node",
    testTimeout: 20000,
    hookTimeout: 20000,
    // Each test file talks to the same live Supabase project; run sequentially
    // so cleanup hooks in one file don't race the assertions in another.
    fileParallelism: false,
  },
});
