import "server-only";

// Anonymous probe (UptimeRobot has no Supabase session) reading the public
// `countries.code` reference table — no PII surfaces in the response, only
// a boolean health flag and a latency integer.
// RLS BYPASS: createAdminClient() uses the service_role key.
import { createAdminClient } from "@repo/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Synthetic-monitoring target. Public (no auth) — listed in proxy.ts
 * PUBLIC_PATHS. Pings Supabase with a trivial SELECT so UptimeRobot's
 * 5-min probe catches DB-side outages, not just Vercel-side ones.
 *
 * Response shape:
 *   { status: 'ok'|'fail', supabase: 'ok'|'fail', db_ms?: number,
 *     commit: <sha>, ts: <iso> }
 *
 * 200 when DB round-trip is healthy AND under 500ms. 503 otherwise — the
 * latency ceiling means a slow DB still pages the on-call instead of
 * silently degrading. Vercel injects VERCEL_GIT_COMMIT_SHA at build time;
 * "local" is the fallback when running `npm run dev` outside Vercel.
 */
export async function GET() {
  const t0 = Date.now();
  const sb = createAdminClient();
  try {
    const { error } = await sb.from("countries").select("code").limit(1);
    const db_ms = Date.now() - t0;
    if (error) throw error;
    return Response.json(
      {
        status: "ok",
        supabase: "ok",
        db_ms,
        commit: process.env.VERCEL_GIT_COMMIT_SHA ?? "local",
        ts: new Date().toISOString(),
      },
      {
        status: db_ms < 500 ? 200 : 503,
        headers: { "Cache-Control": "no-store" },
      },
    );
  } catch {
    return Response.json(
      {
        status: "fail",
        supabase: "fail",
        commit: process.env.VERCEL_GIT_COMMIT_SHA ?? "local",
        ts: new Date().toISOString(),
      },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
}
