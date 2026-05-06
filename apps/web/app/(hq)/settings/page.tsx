import Link from "next/link";
import { SectionCard, cn } from "@repo/ui";
import {
  getCountriesDirectory,
  RESPONSE_STATUS_THRESHOLDS,
} from "@repo/supabase/dal";
import { createClient } from "@repo/supabase/server";
import { dashboardUserFor, requireRole } from "@/app/_lib/auth";
import { HQShell } from "../_components/hq-shell";

/**
 * HQ Settings — read-only group configuration + system status surface. Not a
 * stub: surfaces SLA thresholds, market footprint, system health probe,
 * and audit-log entry points so the production-hardening work (Phase 6)
 * has a visible home in the UI.
 *
 * Genuinely-out-of-scope group admin controls (feature flags, country
 * activation toggles, branding overrides) are surfaced as roadmap notes,
 * not promised to a phase that may shift.
 *
 * Defence-in-depth: middleware already gates `(hq)` to `hq_admin`; we
 * re-check at the route layer so a future middleware mis-config can't
 * leak this surface.
 */
export const dynamic = "force-dynamic";

interface DbProbe {
  ok: boolean;
  ms: number;
}

async function probeDatabase(): Promise<DbProbe> {
  const sb = await createClient();
  const t0 = Date.now();
  const { error } = await sb.from("countries").select("code").limit(1);
  return { ok: !error, ms: Date.now() - t0 };
}

function formatThresholdMinutes(seconds: number): string {
  return `${Math.round(seconds / 60)} min`;
}

export default async function HQSettingsPage() {
  const { user, claims } = await requireRole(["hq_admin"]);
  const [rows, probe] = await Promise.all([
    getCountriesDirectory(),
    probeDatabase(),
  ]);

  const active = rows.filter((r) => r.status === "active");
  const comingSoon = rows.filter((r) => r.status === "coming_soon");
  const totalAgents = rows.reduce((sum, r) => sum + r.agent_count, 0);
  const totalAdmins = rows.reduce((sum, r) => sum + r.country_admin_count, 0);

  const commitSha = process.env.VERCEL_GIT_COMMIT_SHA ?? "local";
  const shortSha = commitSha.slice(0, 7);
  const region = process.env.VERCEL_REGION ?? "local";

  const dbStatusTone = probe.ok
    ? probe.ms < 500
      ? "ok"
      : "warn"
    : "fail";
  const dbStatusLabel = probe.ok
    ? probe.ms < 500
      ? "Healthy"
      : "Slow"
    : "Failing";

  return (
    <HQShell
      currentPath="/settings"
      title="Settings"
      subtitle="Group configuration · system status · audit log access"
      user={dashboardUserFor(user, claims)}
    >
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <SectionCard title="System Health" subtitle="Live probe at render time">
          <dl className="grid grid-cols-2 gap-y-3 gap-x-4 text-sm">
            <dt className="text-slate-500">Status</dt>
            <dd className="text-right">
              <span
                className={cn(
                  "inline-flex items-center gap-1.5",
                  "px-2 py-0.5 rounded-full",
                  "text-[11px] font-semibold uppercase tracking-wider",
                  dbStatusTone === "ok" &&
                    "bg-emerald-50 text-emerald-700",
                  dbStatusTone === "warn" && "bg-amber-50 text-amber-700",
                  dbStatusTone === "fail" && "bg-red-50 text-red-700",
                )}
              >
                <span
                  className={cn(
                    "inline-block w-1.5 h-1.5 rounded-full",
                    dbStatusTone === "ok" && "bg-emerald-500",
                    dbStatusTone === "warn" && "bg-amber-500",
                    dbStatusTone === "fail" && "bg-red-500",
                  )}
                />
                {dbStatusLabel}
              </span>
            </dd>

            <dt className="text-slate-500">Database round-trip</dt>
            <dd className="text-right text-slate-900 font-medium tabular-nums">
              {probe.ms}ms
            </dd>

            <dt className="text-slate-500">Deployed build</dt>
            <dd className="text-right text-slate-900 font-mono text-xs">
              {shortSha}
            </dd>

            <dt className="text-slate-500">Region</dt>
            <dd className="text-right text-slate-900 font-mono text-xs">
              {region}
            </dd>

            <dt className="text-slate-500">Public probe</dt>
            <dd className="text-right">
              <Link
                href="/api/health"
                className="text-xs font-semibold text-[#2B479B] hover:text-[#1e3577]"
              >
                /api/health →
              </Link>
            </dd>
          </dl>
        </SectionCard>

        <SectionCard
          title="Group Footprint"
          subtitle="Markets and rosters across the group"
        >
          <dl className="grid grid-cols-2 gap-y-3 gap-x-4 text-sm">
            <dt className="text-slate-500">Active markets</dt>
            <dd className="text-right text-slate-900 font-semibold tabular-nums">
              {active.length}
            </dd>

            <dt className="text-slate-500">Coming-soon markets</dt>
            <dd className="text-right text-slate-900 font-semibold tabular-nums">
              {comingSoon.length}
            </dd>

            <dt className="text-slate-500">Country admins</dt>
            <dd className="text-right text-slate-900 font-semibold tabular-nums">
              {totalAdmins}
            </dd>

            <dt className="text-slate-500">Active agents</dt>
            <dd className="text-right text-slate-900 font-semibold tabular-nums">
              {totalAgents}
            </dd>

            <dt className="text-slate-500 pt-2 border-t border-slate-100 col-span-2" />
            <dt className="text-slate-500">Browse markets</dt>
            <dd className="text-right">
              <Link
                href="/countries"
                className="text-xs font-semibold text-[#2B479B] hover:text-[#1e3577]"
              >
                /countries →
              </Link>
            </dd>
          </dl>
        </SectionCard>

        <SectionCard
          title="Speed-to-Lead SLA"
          subtitle="Status thresholds applied across the group"
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
            <li className="flex items-center justify-between">
              <span className="text-slate-500">Audit retention</span>
              <span className="text-slate-700 text-xs">
                90 days · per-country
              </span>
            </li>
          </ul>
        </SectionCard>

        <SectionCard
          title="Audit Log Access"
          subtitle="Drill into per-country activity"
        >
          {active.length === 0 ? (
            <p className="text-sm text-slate-400">
              No active markets yet — audit logs activate per country on
              rollout.
            </p>
          ) : (
            <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
              {active.map((row) => {
                const slug = row.country_code.toLowerCase();
                return (
                  <Link
                    key={row.country_code}
                    href={`/${slug}/audit`}
                    className={cn(
                      "flex items-center justify-between",
                      "rounded-md px-2 py-1.5 -mx-2",
                      "hover:bg-slate-50 transition-colors",
                    )}
                  >
                    <span className="text-slate-700">{row.country_name}</span>
                    <span className="text-xs font-semibold text-[#2B479B]">
                      Open →
                    </span>
                  </Link>
                );
              })}
            </div>
          )}
        </SectionCard>
      </div>

      <div className="mt-4">
        <SectionCard
          title="Group admin controls"
          subtitle="What lives here in a future iteration"
        >
          <p className="text-sm text-slate-600 leading-relaxed">
            Group-level controls — feature flags, country activation toggles,
            branding overrides, and SLA target tuning — will live on this page
            in a follow-up iteration. The current rollout is operated per
            country via each country admin&apos;s dashboard, with audit log
            visibility above.
          </p>
        </SectionCard>
      </div>
    </HQShell>
  );
}
