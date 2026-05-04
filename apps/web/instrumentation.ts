import * as Sentry from "@sentry/nextjs";

/**
 * Server-side Sentry init. Called once per Node runtime boot via Next.js
 * `instrumentation.ts` convention. The DSN is read from the runtime env;
 * no DSN ⇒ `Sentry.init` becomes a no-op so dev sessions without a Sentry
 * project still work.
 *
 * Source-map upload is wired through `withSentryConfig(...)` in
 * `next.config.ts` and only runs when `SENTRY_AUTH_TOKEN` is present at
 * BUILD time (Vercel build env, never local dev).
 */
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("./sentry.server.config");
  }

  if (process.env.NEXT_RUNTIME === "edge") {
    await import("./sentry.edge.config");
  }
}

export const onRequestError = Sentry.captureRequestError;
