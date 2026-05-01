import "server-only";

import { NextResponse, type NextRequest } from "next/server";
import Papa from "papaparse";

// RLS BYPASS: createAdminClient() uses the service_role key and bypasses ALL
// Row Level Security. We need it here because the `ingest_lead(jsonb)` RPC's
// EXECUTE grant is service_role-only (REVOKE'd from public/anon/authenticated
// in migration 00007) — the cookie-based authenticated client cannot call it.
// Authorization is enforced ABOVE this client by checking the caller's
// user_roles row (must be country_admin or hq_admin) and overriding
// `country_code` to the admin's own country before any insert. The
// service-role client is never reached for unauthenticated callers.
import { createAdminClient } from "@repo/supabase/admin";
import { csvRowSchema, type CsvRow } from "@repo/supabase/schemas/csvImport";
import { createClient } from "@repo/supabase/server";

/**
 * Path 3 lead ingest — CSV bulk import.
 *
 * Accepts `multipart/form-data` with a single `file` field (CSV with a header
 * row). Each row is validated with `csvRowSchema` and inserted via the
 * `ingest_lead(jsonb)` RPC, so this endpoint inherits the same idempotency,
 * round-robin assignment, and realtime broadcast guarantees as the webhook
 * path. The fallback when neither direct webhook nor n8n bridge is feasible
 * (PRD/lead-ingestion.md Path 3) and the seeding tool for historical leadsheets.
 *
 * Auth model
 *   - Anonymous → 401.
 *   - Agent (or any non-admin role)  → 403.
 *   - Country admin → 200, but `country_code` on every row is overridden to
 *     the admin's own country (cannot smuggle leads into another tenant).
 *   - HQ admin → 200, rows pass through with their declared `country_code`.
 *
 * Response shape
 *   { inserted: number, duplicates: number, errors: Array<{row, message}> }
 *
 * `row` in the error array is 1-indexed against the original file (header
 * counted as row 1, first data row as row 2) so an operator can jump straight
 * to the bad cell.
 *
 * Runtime: Node (papaparse runs fine on Edge but the service-role client is
 * Node-targeted, and Edge offers no win for this CPU-bound path).
 */
export const runtime = "nodejs";

const ALLOWED_ROLES = new Set(["country_admin", "hq_admin"]);

type ImportResult = {
  inserted: number;
  duplicates: number;
  errors: Array<{ row: number; message: string }>;
};

type IngestLeadResult =
  | { lead_id: string; agent_id: string | null; duplicate: false }
  | { lead_id: string; duplicate: true }
  | { error: string; [key: string]: unknown };

function isIngestError(
  v: IngestLeadResult,
): v is { error: string; [key: string]: unknown } {
  return "error" in v && typeof v.error === "string";
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  // 1. Auth — must be a logged-in admin.
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { data: roleRow, error: roleErr } = await supabase
    .from("user_roles")
    .select("role, country_code, is_active")
    .eq("user_id", user.id)
    .maybeSingle();

  if (roleErr || !roleRow || !roleRow.is_active) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  if (!ALLOWED_ROLES.has(roleRow.role)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  // Country admins may only import for their own country. We override the
  // `country_code` field on every row before validation so the user cannot
  // smuggle a row into a different tenant by editing the CSV.
  const forcedCountry =
    roleRow.role === "country_admin" ? roleRow.country_code : null;

  // 2. Multipart body — single `file` field.
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json(
      { error: "invalid multipart body" },
      { status: 400 },
    );
  }
  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json(
      { error: "missing file field" },
      { status: 400 },
    );
  }

  const text = await file.text();
  const parsed = Papa.parse<Record<string, string>>(text, {
    header: true,
    skipEmptyLines: true,
    transformHeader: (h: string) => h.trim(),
  });

  if (parsed.errors.length > 0) {
    return NextResponse.json(
      {
        error: "csv parse failed",
        detail: parsed.errors.map((e) => ({
          row: e.row,
          message: e.message,
        })),
      },
      { status: 400 },
    );
  }

  // 3. Bulk insert via `ingest_lead()` RPC — one row at a time so each row's
  // outcome (inserted / duplicate / error) is independently reported.
  const result: ImportResult = { inserted: 0, duplicates: 0, errors: [] };
  const admin = createAdminClient();

  for (let i = 0; i < parsed.data.length; i++) {
    const fileRow = i + 2; // 1-indexed, header is row 1.
    const raw = parsed.data[i];
    if (!raw) continue;

    if (forcedCountry) {
      raw.country_code = forcedCountry;
    }

    const validation = csvRowSchema.safeParse(raw);
    if (!validation.success) {
      result.errors.push({
        row: fileRow,
        message: validation.error.issues
          .map((issue) =>
            issue.path.length > 0
              ? `${issue.path.join(".")}: ${issue.message}`
              : issue.message,
          )
          .join("; "),
      });
      continue;
    }

    const payload: CsvRow = validation.data;

    try {
      const { data, error } = await admin.rpc(
        // ingest_lead is not yet in the generated Database type; cast keeps
        // the call typed against our known return shape without disabling
        // the RPC overload checks.
        "ingest_lead" as never,
        { payload } as never,
      );

      if (error) {
        result.errors.push({ row: fileRow, message: error.message });
        continue;
      }

      const r = data as IngestLeadResult;
      if (isIngestError(r)) {
        result.errors.push({ row: fileRow, message: r.error });
      } else if (r.duplicate) {
        result.duplicates += 1;
      } else {
        result.inserted += 1;
      }
    } catch (e) {
      result.errors.push({
        row: fileRow,
        message: e instanceof Error ? e.message : "unknown error",
      });
    }
  }

  return NextResponse.json(result, { status: 200 });
}
