import "server-only";

import { NextResponse } from "next/server";

/**
 * Synthetic-monitoring target. Public (no auth) — listed in middleware
 * PUBLIC_PATHS. Phase 6 hooks this up to an external uptime check.
 *
 * Vercel injects VERCEL_GIT_COMMIT_SHA at build time; "local" is the
 * fallback when running `npm run dev` outside Vercel.
 */
export async function GET() {
  return NextResponse.json(
    {
      status: "ok",
      commit: process.env.VERCEL_GIT_COMMIT_SHA ?? "local",
      ts: new Date().toISOString(),
    },
    { status: 200 },
  );
}
