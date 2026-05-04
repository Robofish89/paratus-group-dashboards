import 'server-only';

import { Ratelimit } from '@upstash/ratelimit';
import { Redis } from '@upstash/redis';

/**
 * Distributed rate limiter — Upstash Redis HTTP client + sliding-window algorithm.
 *
 * The limiter is consulted at two layers in production:
 *   • `apps/web/proxy.ts`  — IP-keyed limit on auth paths (login, callbacks).
 *   • `apps/web/app/api/leads/ingest/route.ts` — secret-keyed limit on the
 *     webhook ingest endpoint, applied BEFORE HMAC validation so secret
 *     enumeration cannot side-channel via timing.
 *
 * Why not in-memory? Vercel Functions are per-region cold-startable; an
 * in-memory counter resets on every cold start, defeating the point. Upstash
 * is HTTP-only (no persistent TCP), works from Edge + Fluid Compute, and is
 * cheap enough at our pilot scale that the free tier is irrelevant.
 *
 * Fail-open vs fail-closed:
 *   • In dev (no UPSTASH_REDIS_REST_URL set): shim limiters always succeed.
 *     Local development must not require a live Redis.
 *   • In production (env present, but Upstash returns an error):
 *     `safeLimit()` catches and ALLOWS the request — log structured event,
 *     keep the front door open. The auth check (HMAC on ingest, password
 *     on /login) is the real gatekeeper; the rate limit is a denial-of-
 *     service ceiling, not the auth boundary.
 *   • In production with NO env at all: the FIRST call to a limiter throws
 *     (`getRedis()` raises). Lazy init lets `next build` collect page data
 *     during deploys (NODE_ENV=production but no runtime env present)
 *     without requiring Upstash credentials at build time, while still
 *     refusing to serve traffic on a misprovisioned Vercel deployment.
 */

interface SafeLimitResult {
  success: boolean;
  limit: number;
  remaining: number;
  reset: number;
}

interface RatelimitErrorLog {
  event: 'ratelimit_error';
  limiter: string;
  message: string;
}

function logRatelimitError(limiter: string, message: string): void {
  const entry: RatelimitErrorLog = { event: 'ratelimit_error', limiter, message };
  process.stderr.write(JSON.stringify(entry) + '\n');
}

/**
 * Build the Redis client once per Node process. `Redis.fromEnv()` reads
 * `UPSTASH_REDIS_REST_URL` + `UPSTASH_REDIS_REST_TOKEN`.
 *
 * Singleton because Upstash docs explicitly recommend reusing the client
 * across the same Lambda/Function — each `new Redis()` opens a fresh
 * fetch agent and burns connection-init time on every request.
 *
 * Initialisation is lazy on purpose: `next build` runs page-data collection
 * with NODE_ENV=production but without runtime env vars, so eagerly throwing
 * at module load would break every build. Instead, we throw on the FIRST
 * call (`safeLimit` → `getRedis()`) in production when the env is missing.
 */
let redisInstance: Redis | null | undefined;
function getRedis(): Redis | null {
  if (redisInstance !== undefined) return redisInstance;

  if (
    process.env.UPSTASH_REDIS_REST_URL &&
    process.env.UPSTASH_REDIS_REST_TOKEN
  ) {
    redisInstance = Redis.fromEnv();
    return redisInstance;
  }

  if (process.env.NODE_ENV === 'production') {
    throw new Error(
      'UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN are required in production. ' +
        'Provision an Upstash Redis database and set the REST credentials in Vercel ' +
        '(Production + Preview, both flagged Sensitive).',
    );
  }

  // Dev with no env: shim mode. Cached as null so subsequent calls skip
  // the env check.
  redisInstance = null;
  return null;
}

/**
 * Limiter shim used in dev when no Redis is configured. Always succeeds —
 * developer experience MUST NOT require a live Upstash connection.
 */
type Limiter = {
  limit(identifier: string): Promise<SafeLimitResult>;
};

function makeShim(limit: number): Limiter {
  return {
    async limit() {
      return { success: true, limit, remaining: limit, reset: 0 };
    },
  };
}

interface LimiterConfig {
  /** Max requests in the sliding window. */
  rate: number;
  /** Window duration as parseable by Upstash (e.g. `'60 s'`). */
  window: '60 s';
  /** Redis key prefix; namespaces this limiter's counters. */
  prefix: string;
  /** Field name used in the structured ratelimit_error log. */
  name: string;
}

const AUTH_CONFIG: LimiterConfig = {
  rate: 5,
  window: '60 s',
  prefix: 'paratus:auth',
  name: 'auth',
};

const INGEST_CONFIG: LimiterConfig = {
  rate: 60,
  window: '60 s',
  prefix: 'paratus:ingest',
  name: 'ingest',
};

/**
 * Lazy limiter — first call resolves the Redis client (and possibly throws
 * in production with no env), then memoises a real Ratelimit instance or
 * a dev shim. Subsequent calls hit the memo. Decoupling instantiation from
 * module load lets `next build` collect page data without provisioning
 * Upstash credentials, while still failing closed at runtime.
 */
class LazyLimiter implements Limiter {
  private resolved: Limiter | undefined;

  constructor(private readonly config: LimiterConfig) {}

  async limit(identifier: string): Promise<SafeLimitResult> {
    if (!this.resolved) {
      const redis = getRedis();
      this.resolved = redis
        ? new Ratelimit({
            redis,
            limiter: Ratelimit.slidingWindow(this.config.rate, this.config.window),
            prefix: this.config.prefix,
            analytics: true,
          })
        : makeShim(this.config.rate);
    }
    return this.resolved.limit(identifier);
  }
}

/**
 * Auth-flow limiter — 5 requests per 60 seconds per key (typically per IP).
 * Targets the proxy.ts auth-path branch: /login, /auth/callback, etc.
 */
export const authLimiter: Limiter = new LazyLimiter(AUTH_CONFIG);

/**
 * Ingest-endpoint limiter — 60 requests per 60 seconds per key.
 * Targets /api/leads/ingest. Keyed on a hash of the shared secret so the
 * limit is per-tenant (the webhook integration), not global per-IP — n8n
 * cloud egresses from a small IP pool that several tenants might share.
 */
export const ingestLimiter: Limiter = new LazyLimiter(INGEST_CONFIG);

/**
 * Wrap a `limiter.limit(key)` call with try/catch. On Upstash error in
 * production, log the event and ALLOW the request through (fail-open).
 *
 * The trade-off: Upstash being down should never make the app unreachable.
 * Auth/HMAC/secret checks downstream are the actual security boundary;
 * this limiter is a DOS ceiling, not authn.
 */
export async function safeLimit(
  limiter: Limiter,
  key: string,
  name: string,
): Promise<SafeLimitResult> {
  try {
    return await limiter.limit(key);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logRatelimitError(name, message);
    // Fail-open: pretend the request was allowed. Returning success=true
    // with remaining=0 makes downstream `Retry-After` math safe even
    // though we never made it that far.
    return { success: true, limit: 0, remaining: 0, reset: 0 };
  }
}
