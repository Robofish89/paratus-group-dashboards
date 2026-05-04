import * as Sentry from "@sentry/nextjs";

/**
 * Client-side Sentry init. Loaded by Next.js automatically when this file
 * exists at the project root.
 *
 * Session Replay is intentionally disabled in v1 — privacy posture (PII in
 * the leads queue is sensitive) + cost ceiling. Revisit during the
 * post-pilot retainer review.
 */
Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  tracesSampleRate: 0.1,
  replaysSessionSampleRate: 0,
  replaysOnErrorSampleRate: 0,
  environment: process.env.NEXT_PUBLIC_VERCEL_ENV ?? "development",
});
