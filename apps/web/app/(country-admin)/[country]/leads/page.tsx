import { notFound } from "next/navigation";
import { createClient } from "@repo/supabase/server";
import { getCountryAgents } from "@repo/supabase/dal";
import { countryName, isActiveCountry } from "@/app/_lib/countries";
import {
  dashboardUserFor,
  requireCountry,
  requireRole,
} from "@/app/_lib/auth";
import { CountryAdminShell } from "../../_components/country-admin-shell";
import { LeadList, type LeadListRow } from "../_components/lead-list";

/**
 * Plan-04-03 surface — country admin lead list. Fetches a paginated +
 * filtered slice of leads via the cookie-authed Supabase client (RLS country-
 * locks rows for country admins; HQ admins see all).
 *
 * Filter contract (URL → query):
 *   ?status   = 'new' | 'contacted' | 'qualified' | 'converted' | 'lost'
 *   ?service  = form_slug
 *   ?from     = ISO date (gte created_at)
 *   ?to       = ISO date (lt  created_at)
 *   ?q        = search across name | email | phone (ILIKE %q%)
 *   ?page     = 1-indexed, default 1
 *
 * Pagination is offset-based for v1. Cursor migration is logged in
 * 04-03-SUMMARY's Phase 6 carry-overs (Phase 4 traffic profile makes offset
 * fine — Paratus's largest active country has ~5k leads). Realtime broadcast
 * is deliberately NOT subscribed on this view (RESEARCH.md pitfall 8 —
 * pagination + concurrent inserts shifts indices).
 */
const PAGE_SIZE = 50;

const STATUS_VALUES = new Set([
  "new",
  "contacted",
  "qualified",
  "converted",
  "lost",
]);

type LeadStatus = "new" | "contacted" | "qualified" | "converted" | "lost";

function readParam(value: string | string[] | undefined): string | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

function parsePage(value: string | null): number {
  if (!value) return 1;
  const n = Number.parseInt(value, 10);
  if (!Number.isFinite(n) || n < 1) return 1;
  return n;
}

export default async function CountryAdminLeadsPage({
  params,
  searchParams,
}: {
  params: Promise<{ country: string }>;
  searchParams: Promise<{
    status?: string | string[];
    service?: string | string[];
    from?: string | string[];
    to?: string | string[];
    q?: string | string[];
    page?: string | string[];
  }>;
}) {
  const [{ country }, sp] = await Promise.all([params, searchParams]);

  if (!isActiveCountry(country)) {
    notFound();
  }

  const { user, claims } = await requireRole(["country_admin", "hq_admin"]);
  requireCountry(country, claims);

  const name = countryName(country);
  const countryCode = country.toUpperCase();

  const statusRaw = readParam(sp.status);
  const status: LeadStatus | null =
    statusRaw && STATUS_VALUES.has(statusRaw) ? (statusRaw as LeadStatus) : null;
  const service = readParam(sp.service);
  const from = readParam(sp.from);
  const to = readParam(sp.to);
  const q = readParam(sp.q);
  const page = parsePage(readParam(sp.page));

  const supabase = await createClient();

  let query = supabase
    .from("leads")
    .select(
      "id, name, email, phone, status, form_slug, assigned_to, country_code, created_at",
      { count: "exact" },
    )
    .order("created_at", { ascending: false })
    .range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1);

  if (status) query = query.eq("status", status);
  if (service) query = query.eq("form_slug", service);
  if (from) query = query.gte("created_at", from);
  if (to) query = query.lt("created_at", to);
  if (q && q.trim().length > 0) {
    const safe = q.replace(/[,()]/g, " ").trim();
    query = query.or(
      `name.ilike.%${safe}%,email.ilike.%${safe}%,phone.ilike.%${safe}%`,
    );
  }

  const [leadsResult, agents, formsResult] = await Promise.all([
    query,
    getCountryAgents(countryCode),
    // Active forms drive the service filter dropdown — RLS-friendly read.
    supabase.from("forms").select("slug, display_name").eq("is_active", true),
  ]);

  if (leadsResult.error) {
    throw new Error(`leads list query failed: ${leadsResult.error.message}`);
  }

  const leads = (leadsResult.data ?? []) as Array<{
    id: string;
    name: string;
    email: string | null;
    phone: string | null;
    status: LeadStatus;
    form_slug: string;
    assigned_to: string | null;
    country_code: string;
    created_at: string;
  }>;

  const total = leadsResult.count ?? 0;

  const agentLookup = new Map(
    agents.map((a) => [a.user_id, a.display_name ?? "Agent"]),
  );

  const formLookup = new Map(
    (formsResult.data ?? []).map((f) => [f.slug, f.display_name]),
  );

  const rows: LeadListRow[] = leads.map((lead) => ({
    id: lead.id,
    name: lead.name,
    email: lead.email,
    phone: lead.phone,
    status: lead.status,
    form_slug: lead.form_slug,
    service_label: formLookup.get(lead.form_slug) ?? lead.form_slug,
    assigned_to: lead.assigned_to,
    assigned_to_name: lead.assigned_to
      ? (agentLookup.get(lead.assigned_to) ?? null)
      : null,
    country_code: lead.country_code,
    created_at: lead.created_at,
  }));

  const formOptions = (formsResult.data ?? []).map((f) => ({
    slug: f.slug,
    label: f.display_name,
  }));

  // Build the export-CSV link with the same active filters so admins get a
  // file matching what they're looking at.
  const exportParams = new URLSearchParams();
  if (status) exportParams.set("status", status);
  if (service) exportParams.set("service", service);
  if (from) exportParams.set("from", from);
  if (to) exportParams.set("to", to);
  if (q) exportParams.set("q", q);
  const exportHref = `/api/country-admin/export-leads${exportParams.toString() ? `?${exportParams.toString()}` : ""}`;

  return (
    <CountryAdminShell
      countrySlug={country}
      countryName={name}
      currentPath={`/${country}/leads`}
      title="Leads"
      subtitle="Filter, reassign, and export country leads"
      user={dashboardUserFor(user, claims)}
    >
      <LeadList
        rows={rows}
        total={total}
        page={page}
        pageSize={PAGE_SIZE}
        agents={agents.map((a) => ({
          user_id: a.user_id,
          display_name: a.display_name ?? "Agent",
        }))}
        formOptions={formOptions}
        filters={{
          status,
          service,
          from,
          to,
          q,
        }}
        exportHref={exportHref}
      />
    </CountryAdminShell>
  );
}
