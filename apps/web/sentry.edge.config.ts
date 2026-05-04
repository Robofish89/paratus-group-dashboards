import "server-only";
import * as Sentry from "@sentry/nextjs";

// Edge runtime is unused in Phase 6 — proxy.ts is the only Edge surface and
// it doesn't throw user-visible errors. Init is kept symmetrical with the
// server config so we get coverage if any future route opts into Edge.
Sentry.init({
  dsn: process.env.SENTRY_DSN,
  tracesSampleRate: 0.1,
  environment: process.env.VERCEL_ENV ?? "development",
  release: process.env.VERCEL_GIT_COMMIT_SHA,
});
