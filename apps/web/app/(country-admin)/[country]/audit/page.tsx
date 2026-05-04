import { notFound } from "next/navigation";
import Link from "next/link";
import { createClient } from "@repo/supabase/server";
import {
  AUDIT_LOG_PAGE_SIZE,
  getAuditLog,
  type AuditAction,
  type AuditRow,
} from "@repo/supabase/dal";
import { countryName, isActiveCountry } from "@/app/_lib/countries";
import {
  dashboardUserFor,
  requireCountry,
  requireRole,
} from "@/app/_lib/auth";
import { CountryAdminShell } from "../../_components/country-admin-shell";
import { AuditTable } from "./_components/audit-table";

/**
 * Plan-06-02 surface — country admin audit log viewer.
 *
 * Lists every recorded admin/agent write scoped to the URL country (RLS
 * scopes country admins automatically; HQ admins drilling into a country
 * filter via the explicit countryCode argument). Rows render as a striped
 * table (AMA-mirror primitive in `@repo/ui`) with a `<details>` drill-down
 * for the JSON diff.
 *
 * URL contract:
 *   ?page=N            — 1-indexed, default 1
 *   ?filter=<action>   — optional `lead.reassign | lead.complete |
 *                        lead.callback | lead.no_answer | lead.contact |
 *                        user_role.update`
 */

const AUDIT_ACTIONS = new Set<AuditAction>([
  "lead.reassign",
  "lead.complete",
  "lead.callback",
  "lead.no_answer",
  "lead.contact",
  "user_role.update",
]);

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

function parseFilter(value: string | null): AuditAction | null {
  if (!value) return null;
  return AUDIT_ACTIONS.has(value as AuditAction) ? (value as AuditAction) : null;
}

interface ActorMeta {
  user_id: string;
  display_name: string | null;
}

/**
 * Fetch display_name for the distinct actor_ids in the page's audit rows.
 * Reads via the cookie-authed `user_roles` client — RLS already permits
 * country admins to read their country's agents (post-00012) and HQ admins
 * to read everyone. Actors outside the caller's RLS scope (rare —
 * cross-country reassignment by an HQ admin viewed by a country admin)
 * fall through to `null` and the table shows the role chip alone.
 */
async function fetchActorMeta(
  rows: AuditRow[],
): Promise<Map<string, ActorMeta>> {
  const actorIds = Array.from(
    new Set(rows.map((r) => r.actor_id).filter((id): id is string => Boolean(id))),
  );
  if (actorIds.length === 0) return new Map();
  const supabase = await createClient();
  const { data } = await supabase
    .from("user_roles")
    .select("user_id, display_name")
    .in("user_id", actorIds);
  const map = new Map<string, ActorMeta>();
  for (const row of data ?? []) {
    map.set(row.user_id, {
      user_id: row.user_id,
      display_name: row.display_name ?? null,
    });
  }
  return map;
}

export default async function CountryAdminAuditPage({
  params,
  searchParams,
}: {
  params: Promise<{ country: string }>;
  searchParams: Promise<{
    page?: string | string[];
    filter?: string | string[];
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
  const page = parsePage(readParam(sp.page));
  const filter = parseFilter(readParam(sp.filter));

  const { rows, total } = await getAuditLog({
    countryCode,
    filter,
    page,
    pageSize: AUDIT_LOG_PAGE_SIZE,
  });

  const actorMeta = await fetchActorMeta(rows);
  const totalPages = Math.max(1, Math.ceil(total / AUDIT_LOG_PAGE_SIZE));

  return (
    <CountryAdminShell
      countrySlug={country}
      countryName={name}
      currentPath={`/${country}/audit`}
      title="Audit Log"
      subtitle={`Every admin and agent write recorded for ${name}`}
      user={dashboardUserFor(user, claims)}
    >
      <div className="flex flex-col gap-4">
        {/* Filter bar */}
        <div className="flex items-center gap-2 text-sm">
          <span className="text-slate-500">Filter:</span>
          <FilterPill country={country} value={null} active={filter} label="All" />
          <FilterPill
            country={country}
            value="lead.reassign"
            active={filter}
            label="Reassign"
          />
          <FilterPill
            country={country}
            value="lead.complete"
            active={filter}
            label="Complete"
          />
          <FilterPill
            country={country}
            value="lead.callback"
            active={filter}
            label="Callback"
          />
          <FilterPill
            country={country}
            value="lead.no_answer"
            active={filter}
            label="No answer"
          />
          <FilterPill
            country={country}
            value="lead.contact"
            active={filter}
            label="Contact"
          />
        </div>

        <AuditTable
          rows={rows}
          actorMeta={Array.from(actorMeta.values())}
          countryName={name}
          countrySlug={country}
        />

        {/* Pagination */}
        <div className="flex items-center justify-between text-xs text-slate-500">
          <span>
            {total === 0
              ? "0 entries"
              : `${(page - 1) * AUDIT_LOG_PAGE_SIZE + 1}–${Math.min(
                  page * AUDIT_LOG_PAGE_SIZE,
                  total,
                ).toLocaleString()} of ${total.toLocaleString()} entries`}
          </span>
          <div className="flex items-center gap-2">
            <PageLink
              country={country}
              filter={filter}
              page={Math.max(1, page - 1)}
              disabled={page <= 1}
            >
              Prev
            </PageLink>
            <span className="tabular-nums">
              Page {page} / {totalPages}
            </span>
            <PageLink
              country={country}
              filter={filter}
              page={Math.min(totalPages, page + 1)}
              disabled={page >= totalPages}
            >
              Next
            </PageLink>
          </div>
        </div>
      </div>
    </CountryAdminShell>
  );
}

function FilterPill({
  country,
  value,
  active,
  label,
}: {
  country: string;
  value: AuditAction | null;
  active: AuditAction | null;
  label: string;
}) {
  const isActive = value === active;
  const href = value
    ? `/${country}/audit?filter=${value}`
    : `/${country}/audit`;
  return (
    <Link
      href={href}
      className={
        isActive
          ? "rounded-full bg-[#2B479B] text-white px-3 py-1 text-xs"
          : "rounded-full bg-slate-100 text-slate-600 hover:bg-slate-200 px-3 py-1 text-xs"
      }
    >
      {label}
    </Link>
  );
}

function PageLink({
  country,
  filter,
  page,
  disabled,
  children,
}: {
  country: string;
  filter: AuditAction | null;
  page: number;
  disabled: boolean;
  children: React.ReactNode;
}) {
  const params = new URLSearchParams();
  if (filter) params.set("filter", filter);
  if (page > 1) params.set("page", String(page));
  const href = `/${country}/audit${params.toString() ? `?${params.toString()}` : ""}`;
  if (disabled) {
    return (
      <span
        aria-disabled
        className="rounded-md border border-slate-200 px-3 py-1 text-xs text-slate-300 cursor-not-allowed"
      >
        {children}
      </span>
    );
  }
  return (
    <Link
      href={href}
      className="rounded-md border border-slate-200 px-3 py-1 text-xs text-slate-600 hover:bg-slate-50"
    >
      {children}
    </Link>
  );
}
