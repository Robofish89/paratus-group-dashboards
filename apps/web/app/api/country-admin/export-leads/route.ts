import "server-only";

import { NextResponse, type NextRequest } from "next/server";
import Papa from "papaparse";

import { createClient } from "@repo/supabase/server";
import { getCurrentUserClaims } from "@repo/supabase/dal";

/**
 * Phase 4 plan 04-03 — country admin CSV export.
 *
 * GET /api/country-admin/export-leads?from=&to=&status=&service=&q=
 *
 * Returns a CSV stream of the caller's accessible leads. RLS is the country
 * lock — the cookie-authed `createClient()` carries the admin's JWT, so
 * country admins physically cannot see other countries' rows; HQ admins see
 * everything. We deliberately do NOT use the service-role client here
 * (RESEARCH.md pitfall 6).
 *
 * Filters are all optional and applied via the standard supabase-js builder:
 *   from / to → created_at >= from, created_at < to (half-open)
 *   status   → eq('status', value)  (lead_status enum)
 *   service  → eq('form_slug', value)
 *   q        → name | email | phone ILIKE %q% (full-text search across the
 *              three contact columns the leads table actually carries)
 *
 * Cap: 50,000 rows. If exceeded, the response includes an `X-Truncated: true`
 * header so consumers can detect partial data. Phase 4 acceptance: Paratus's
 * largest active country has ~5k leads to date — 50k is a 10x buffer.
 *
 * Runtime nodejs (matches the importer; Edge offers no win for this CPU-bound
 * path).
 */
export const runtime = "nodejs";

const ROW_CAP = 50_000;

const ALLOWED_STATUSES = new Set([
  "new",
  "contacted",
  "qualified",
  "converted",
  "lost",
]);

export async function GET(req: NextRequest): Promise<Response> {
  const claims = await getCurrentUserClaims();
  if (!claims || claims.user_active === false) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  if (
    claims.user_role !== "country_admin" &&
    claims.user_role !== "hq_admin"
  ) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const url = new URL(req.url);
  const from = url.searchParams.get("from");
  const to = url.searchParams.get("to");
  const status = url.searchParams.get("status");
  const service = url.searchParams.get("service");
  const q = url.searchParams.get("q");

  if (status && !ALLOWED_STATUSES.has(status)) {
    return NextResponse.json(
      { error: "invalid_status" },
      { status: 400 },
    );
  }

  const supabase = await createClient();

  // Project the columns we need on the wire. Use the actual table column
  // names — the leads table has `name` + `phone` (not full_name / phone_e164,
  // which the plan template referenced from a draft schema).
  let query = supabase
    .from("leads")
    .select(
      "id, name, email, phone, status, form_slug, assigned_to, country_code, created_at, first_contacted_at, lost_reason",
    )
    .order("created_at", { ascending: false })
    .limit(ROW_CAP);

  if (from) query = query.gte("created_at", from);
  if (to) query = query.lt("created_at", to);
  if (status)
    query = query.eq(
      "status",
      status as "new" | "contacted" | "qualified" | "converted" | "lost",
    );
  if (service) query = query.eq("form_slug", service);
  if (q && q.trim().length > 0) {
    // Escape PostgREST `or` filter delimiters in user input. supabase-js
    // splits the .or() value on commas, so a comma in `q` would break the
    // filter; same for parentheses. Strip them — searching for them isn't
    // meaningful here.
    const safe = q.replace(/[,()]/g, " ").trim();
    query = query.or(
      `name.ilike.%${safe}%,email.ilike.%${safe}%,phone.ilike.%${safe}%`,
    );
  }

  const { data, error } = await query;
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const rows = data ?? [];
  const truncated = rows.length === ROW_CAP;

  const csv = Papa.unparse(rows);

  // Filename uses the caller's country (or "all" for HQ).
  const country = claims.country_code ?? "all";
  const filenameRange = `${from ?? "all"}-to-${to ?? "now"}`;
  const filename = `leads-${country}-${filenameRange}.csv`;

  const headers: HeadersInit = {
    "Content-Type": "text/csv; charset=utf-8",
    "Content-Disposition": `attachment; filename="${filename}"`,
    "Cache-Control": "no-store",
  };
  if (truncated) {
    (headers as Record<string, string>)["X-Truncated"] = "true";
  }

  return new Response(csv, { headers });
}
