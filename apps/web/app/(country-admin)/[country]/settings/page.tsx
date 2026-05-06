import Link from "next/link";
import { notFound } from "next/navigation";
import { SectionCard, cn } from "@repo/ui";
import { createClient } from "@repo/supabase/server";
import {
  RESPONSE_STATUS_THRESHOLDS,
  getCountryAgents,
} from "@repo/supabase/dal";
import { countryName, isActiveCountry } from "@/app/_lib/countries";
import {
  dashboardUserFor,
  requireCountry,
  requireRole,
} from "@/app/_lib/auth";
import { CountryAdminShell } from "../../_components/country-admin-shell";

/**
 * Country-admin Settings — read-only country profile + team roster + audit
 * log link. Mirrors the HQ Settings page pattern but scoped to the URL
 * country. User provisioning is HQ admin's responsibility, so this surface
 * is intentionally read-only.
 *
 * Defence-in-depth: layout already gates `(country-admin)` to country_admin
 * + hq_admin and pins claims to the URL country; we re-check at the route
 * layer so a future middleware mis-config can't leak this surface.
 */
export const dynamic = "force-dynamic";

interface CountryRow {
  code: string;
  name: string;
  currency: string | null;
  timezone: string;
  status: "active" | "coming_soon";
}

interface RoleRow {
  user_id: string;
  display_name: string | null;
  role: string;
}

async function loadCountryProfile(
  countryCode: string,
): Promise<{ country: CountryRow | null; admins: RoleRow[] }> {
  const supabase = await createClient();
  const [countryRes, rolesRes] = await Promise.all([
    supabase
      .from("countries")
      .select("code, name, currency, timezone, status")
      .eq("code", countryCode)
      .maybeSingle(),
    supabase
      .from("user_roles")
      .select("user_id, display_name, role")
      .eq("country_code", countryCode)
      .eq("is_active", true)
      .order("role", { ascending: true })
      .order("display_name", { ascending: true }),
  ]);

  if (countryRes.error) {
    throw new Error(
      `country settings: countries query failed: ${countryRes.error.message}`,
    );
  }
  if (rolesRes.error) {
    throw new Error(
      `country settings: user_roles query failed: ${rolesRes.error.message}`,
    );
  }

  return {
    country: (countryRes.data as CountryRow | null) ?? null,
    admins: (rolesRes.data ?? []) as RoleRow[],
  };
}

function formatThresholdMinutes(seconds: number): string {
  return `${Math.round(seconds / 60)} min`;
}

const STATUS_PILL_CLASSES: Record<CountryRow["status"], string> = {
  active: "bg-emerald-50 text-emerald-700",
  coming_soon: "bg-slate-100 text-slate-600",
};

const STATUS_LABELS: Record<CountryRow["status"], string> = {
  active: "Active",
  coming_soon: "Coming soon",
};

export default async function CountryAdminSettingsPage({
  params,
}: {
  params: Promise<{ country: string }>;
}) {
  const { country } = await params;

  if (!isActiveCountry(country)) {
    notFound();
  }

  const { user, claims } = await requireRole(["country_admin", "hq_admin"]);
  requireCountry(country, claims);

  const slug = country;
  const code = country.toUpperCase();
  const name = countryName(country);

  const [{ country: countryRow, admins }, agents] = await Promise.all([
    loadCountryProfile(code),
    getCountryAgents(code),
  ]);

  if (!countryRow) {
    notFound();
  }

  const countryAdmins = admins.filter((r) => r.role === "country_admin");

  return (
    <CountryAdminShell
      countrySlug={slug}
      countryName={name}
      currentPath={`/${slug}/settings`}
      title="Settings"
      subtitle="Country profile · team roster · audit log access"
      user={dashboardUserFor(user, claims)}
    >
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <SectionCard title="Country profile" subtitle="Reference data">
          <dl className="grid grid-cols-2 gap-y-3 gap-x-4 text-sm">
            <dt className="text-slate-500">Name</dt>
            <dd className="text-right text-slate-900 font-medium">
              {countryRow.name}
            </dd>

            <dt className="text-slate-500">ISO code</dt>
            <dd className="text-right text-slate-900 font-mono text-xs">
              {countryRow.code}
            </dd>

            <dt className="text-slate-500">Timezone</dt>
            <dd className="text-right text-slate-900 font-mono text-xs">
              {countryRow.timezone}
            </dd>

            <dt className="text-slate-500">Currency</dt>
            <dd className="text-right text-slate-900 font-mono text-xs">
              {countryRow.currency ?? "—"}
            </dd>

            <dt className="text-slate-500">Status</dt>
            <dd className="text-right">
              <span
                className={cn(
                  "inline-flex items-center gap-1.5",
                  "px-2 py-0.5 rounded-full",
                  "text-[11px] font-semibold uppercase tracking-wider",
                  STATUS_PILL_CLASSES[countryRow.status],
                )}
              >
                {STATUS_LABELS[countryRow.status]}
              </span>
            </dd>
          </dl>
        </SectionCard>

        <SectionCard
          title="Speed-to-Lead SLA"
          subtitle="Group-wide thresholds applied here"
        >
          <ul className="flex flex-col gap-3 text-sm">
            <li className="flex items-center justify-between">
              <span className="flex items-center gap-2 text-slate-700">
                <span className="inline-block w-2 h-2 rounded-full bg-emerald-500" />
                On target
              </span>
              <span className="text-slate-900 font-semibold tabular-nums">
                &lt; {formatThresholdMinutes(RESPONSE_STATUS_THRESHOLDS.green)}
              </span>
            </li>
            <li className="flex items-center justify-between">
              <span className="flex items-center gap-2 text-slate-700">
                <span className="inline-block w-2 h-2 rounded-full bg-amber-500" />
                Watch
              </span>
              <span className="text-slate-900 font-semibold tabular-nums">
                {formatThresholdMinutes(RESPONSE_STATUS_THRESHOLDS.green)} –{" "}
                {formatThresholdMinutes(RESPONSE_STATUS_THRESHOLDS.amber)}
              </span>
            </li>
            <li className="flex items-center justify-between">
              <span className="flex items-center gap-2 text-slate-700">
                <span className="inline-block w-2 h-2 rounded-full bg-red-500" />
                Off target
              </span>
              <span className="text-slate-900 font-semibold tabular-nums">
                &gt; {formatThresholdMinutes(RESPONSE_STATUS_THRESHOLDS.amber)}
              </span>
            </li>
            <li className="flex items-center justify-between pt-2 border-t border-slate-100">
              <span className="text-slate-500">Breach detection</span>
              <span className="text-slate-700 text-xs">
                Daily cron · 06:00 UTC
              </span>
            </li>
          </ul>
        </SectionCard>

        <SectionCard
          title={`Country admins (${countryAdmins.length})`}
          subtitle="Authorised to view this dashboard and reassign leads"
        >
          {countryAdmins.length === 0 ? (
            <p className="text-sm text-slate-400">
              No country admins assigned yet — provisioned by HQ.
            </p>
          ) : (
            <ul className="flex flex-col gap-2 text-sm">
              {countryAdmins.map((row) => (
                <li
                  key={row.user_id}
                  className="flex items-center justify-between rounded-md px-2 py-1.5 -mx-2 hover:bg-slate-50"
                >
                  <span className="text-slate-700">
                    {row.display_name ?? "—"}
                  </span>
                  <span className="text-[11px] uppercase tracking-wider text-slate-400 font-semibold">
                    Country Admin
                  </span>
                </li>
              ))}
            </ul>
          )}
        </SectionCard>

        <SectionCard
          title={`Active agents (${agents.length})`}
          subtitle="Visible in the round-robin pool"
        >
          {agents.length === 0 ? (
            <p className="text-sm text-slate-400">
              No active agents seated yet — provisioned by HQ.
            </p>
          ) : (
            <ul className="flex flex-col gap-2 text-sm">
              {agents.map((row) => (
                <li
                  key={row.user_id}
                  className="flex items-center justify-between rounded-md px-2 py-1.5 -mx-2 hover:bg-slate-50"
                >
                  <span className="text-slate-700">
                    {row.display_name ?? "—"}
                  </span>
                  <span className="text-[11px] uppercase tracking-wider text-slate-400 font-semibold">
                    Agent
                  </span>
                </li>
              ))}
            </ul>
          )}
        </SectionCard>
      </div>

      <div className="mt-4 grid grid-cols-1 lg:grid-cols-2 gap-4">
        <SectionCard
          title="Audit log"
          subtitle="Every admin and agent write recorded for this country"
        >
          <p className="text-sm text-slate-600 leading-relaxed mb-3">
            Reassignments, contact attempts, callbacks, completions, and role
            changes are recorded with actor, target, diff, and timestamp.
            90-day retention.
          </p>
          <Link
            href={`/${slug}/audit`}
            className={cn(
              "inline-flex items-center gap-1",
              "text-sm font-semibold text-[#2B479B]",
              "hover:text-[#1e3577] transition-colors",
            )}
          >
            Open audit log
            <span aria-hidden>→</span>
          </Link>
        </SectionCard>

        <SectionCard
          title="Provisioning"
          subtitle="How team changes happen"
        >
          <p className="text-sm text-slate-600 leading-relaxed">
            New country admins and agents are provisioned by HQ via the
            invite flow. To add a teammate, request the invite from the HQ
            admin — they receive an email with a one-time setup link and
            land directly on this country&apos;s dashboard once they accept.
          </p>
        </SectionCard>
      </div>
    </CountryAdminShell>
  );
}
