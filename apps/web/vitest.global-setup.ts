import { execSync } from "node:child_process";
import { resolve } from "node:path";
import { existsSync } from "node:fs";

/**
 * Hermetic vitest setup — boots a local Supabase stack, points the test env
 * at it, runs the suites, then tears it down.
 *
 * Why: cloud Supabase Auth rate-limits magiclinks at 4/hour/email. The Phase
 * 2/3/4/5/6 integration suites mint magiclinks for each test user via
 * helpers.ts → signInAs(); chaining 5+ suites against the cloud project
 * trips the rate limiter and the suite errors halfway through with
 * `email_rate_limit_exceeded` (06-RESEARCH.md sources tertiary).
 *
 * Escape hatch: VITEST_USE_CLOUD=1 reverts to the cloud project (single
 * suite at a time, manual debugging).
 *
 * Requires Docker + the Supabase CLI on PATH. The CLI version is pinned in
 * the root package.json devDependencies so seed-loading-order is stable
 * across machines (06-RESEARCH.md sources tertiary).
 */

const REPO_ROOT = resolve(__dirname, "../..");

function isStackRunning(): boolean {
  try {
    const out = execSync("npx supabase status -o json", {
      cwd: REPO_ROOT,
      stdio: ["ignore", "pipe", "ignore"],
    }).toString();
    const json = JSON.parse(out);
    return Boolean(json?.API_URL);
  } catch {
    return false;
  }
}

// RLS BYPASS: the local stack's service-role key is read here and exposed
// to vitest via process.env so test setup helpers (apps/web/test-support/
// helpers.ts → createServiceClient) can seed leads / generate magiclinks
// without going through RLS. Tests run their assertions through anon-key
// clients carrying real user JWTs; the service-role key is setup-only,
// never on the assertion path. The values come from `supabase status`
// (containers running on localhost) — the cloud project's service-role
// key is NOT touched by the hermetic flow.
function readStatus(): {
  API_URL: string;
  ANON_KEY: string;
  // RLS BYPASS marker — see file header.
  SERVICE_ROLE_KEY: string;
} {
  const out = execSync("npx supabase status -o json", {
    cwd: REPO_ROOT,
    stdio: ["ignore", "pipe", "inherit"],
  }).toString();
  const json = JSON.parse(out) as {
    API_URL: string;
    ANON_KEY: string;
    // RLS BYPASS: SERVICE_ROLE_KEY is the local stack's setup-only key —
    // see header comment above; never used on the assertion path.
    SERVICE_ROLE_KEY: string;
  };
  return json;
}

export async function setup() {
  if (process.env.VITEST_USE_CLOUD === "1") {
    // Caller wants to run a single suite against the cloud project.
    // .env.local already carries the cloud creds; nothing to do.
    return;
  }

  // Sanity-check that supabase/config.toml exists — running without it would
  // start the CLI's default project and seeds would not load, producing
  // confusing missing-test-user errors deep into the suite.
  const configPath = resolve(REPO_ROOT, "supabase/config.toml");
  if (!existsSync(configPath)) {
    throw new Error(
      `vitest global setup: ${configPath} missing; cannot boot hermetic stack`,
    );
  }

  if (!isStackRunning()) {
    execSync("npx supabase start", { cwd: REPO_ROOT, stdio: "inherit" });
  } else {
    // A stack is already up (e.g. developer started it manually for Studio
    // browsing). Don't re-boot — we'd just race the existing containers.
    // We DO refresh seeds via `db reset` so the test fixtures are clean.
    execSync("npx supabase db reset --no-seed=false", {
      cwd: REPO_ROOT,
      stdio: "inherit",
    });
  }

  const status = readStatus();
  process.env.NEXT_PUBLIC_SUPABASE_URL = status.API_URL;
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = status.ANON_KEY;
  process.env.SUPABASE_SERVICE_ROLE_KEY = status.SERVICE_ROLE_KEY;
}

export async function teardown() {
  if (process.env.VITEST_USE_CLOUD === "1") return;
  // --no-backup keeps `supabase start` snappy on the next run; the seeds are
  // deterministic so there's nothing to preserve between runs.
  execSync("npx supabase stop --no-backup", {
    cwd: REPO_ROOT,
    stdio: "inherit",
  });
}
