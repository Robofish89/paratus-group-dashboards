import "server-only";
import * as Sentry from "@sentry/nextjs";

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  // 10% of transactions traced — enough to spot regressions, cheap on the
  // Sentry quota for the pilot. Revisit at the post-pilot retainer review.
  tracesSampleRate: 0.1,
  environment: process.env.VERCEL_ENV ?? "development",
  release: process.env.VERCEL_GIT_COMMIT_SHA,
});
