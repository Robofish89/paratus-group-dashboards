import "server-only";

import { NextResponse, type NextRequest } from "next/server";

import {
  getOpenBreaches,
  markBreachAlerted,
  getCountryAdminEmails,
  getAgentDisplayName,
  getCountryName,
  type BreachLead,
} from "@repo/supabase/dal";
import { sendSlaBreachEmail } from "@repo/supabase/lib/email";
import { countryCodeToSlug } from "@repo/supabase/types";

/**
 * Phase 6 plan 06-01 — SLA breach cron handler.
 *
 * Vercel Cron forwards `Authorization: Bearer ${CRON_SECRET}` on each tick of
 * the schedule defined in `apps/web/vercel.json`. We refuse anything else with
 * 401 — the route is exempted from cookie auth in `apps/web/middleware.ts`
 * (mirrors the `/api/leads/*` HMAC-only pattern from Phase 2).
 *
 * Per-minute schedule (`* * * * *`). Performance budget: 60s `maxDuration`
 * keeps the cron well under Vercel's per-invocation limit. The partial index
 * `leads_sla_pending_idx` (00014) keeps `getOpenBreaches()` cheap as volume
 * grows; per-breach email sends run in parallel via `Promise.allSettled`.
 *
 * Idempotency: `mark_sla_alerted(lead_id)` is only called after EVERY
 * recipient for the breach has been emailed successfully. Partial failure
 * leaves the dedupe column NULL so the next minute's tick retries.
 */
export const runtime = "nodejs";
export const maxDuration = 60;

interface BreachError {
  leadId: string;
  recipient: string;
  message: string;
}

interface CronResult {
  checked: number;
  alerted: number;
  errors: BreachError[];
}

/**
 * Build the deep-link the email recipient lands on. The lead detail page
 * doesn't exist yet (Phase 6 follow-up); for now we route to the country lead
 * list with `?focus=<id>` so a future detail surface can pick it up without
 * changing the email shape.
 */
function buildLeadDeepLink(lead: BreachLead): string {
  // SLA_ALERT_BASE_URL falls back to the production hostname when running on
  // Vercel, or localhost for dev. Prefer an explicit override so previews
  // route to the correct deployment. NEXT_PUBLIC_ here is fine — the URL is
  // not a secret and is rendered into the email body.
  const base =
    process.env.NEXT_PUBLIC_SITE_URL ??
    process.env.VERCEL_PROJECT_PRODUCTION_URL ??
    "https://paratus-group-dashboards.vercel.app";
  const root = base.startsWith("http") ? base : `https://${base}`;
  // Lead countries are stored uppercase ISO codes; country routes use lowercase
  // two-letter slugs (apps/web/app/(country-admin)/[country]/...). Cast at the
  // boundary because countryCodeToSlug expects the typed enum.
  const slug = countryCodeToSlug(lead.country_code as Parameters<typeof countryCodeToSlug>[0]);
  return `${root.replace(/\/$/, "")}/${slug}/leads?focus=${lead.id}`;
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  const expected = process.env.CRON_SECRET;
  if (!expected) {
    // Refuse to run without a secret — better than silently accepting any
    // caller in misconfigured environments.
    return NextResponse.json(
      { error: "cron_misconfigured" },
      { status: 500 },
    );
  }
  const auth = req.headers.get("authorization");
  if (auth !== `Bearer ${expected}`) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  const breaches = await getOpenBreaches();
  if (breaches.length === 0) {
    const body: CronResult = { checked: 0, alerted: 0, errors: [] };
    emitCronLog({ checked: 0, alerted: 0, error_count: 0 });
    return NextResponse.json(body);
  }

  let alerted = 0;
  const errors: BreachError[] = [];

  // Cache per-country lookups so a 50-breach minute touching 3 countries
  // doesn't fan out to 50 listUsers() calls.
  const adminEmailsByCountry = new Map<string, string[]>();
  const countryNameByCode = new Map<string, string | null>();

  await Promise.all(
    breaches.map(async (breach) => {
      const cc = breach.country_code;

      let recipients = adminEmailsByCountry.get(cc);
      if (!recipients) {
        recipients = await getCountryAdminEmails(cc);
        adminEmailsByCountry.set(cc, recipients);
      }
      if (recipients.length === 0) {
        // No country admin seated. Log and skip; nothing to email.
        errors.push({
          leadId: breach.id,
          recipient: "",
          message: "no_country_admin_seated",
        });
        return;
      }

      let countryName = countryNameByCode.get(cc);
      if (countryName === undefined) {
        countryName = await getCountryName(cc);
        countryNameByCode.set(cc, countryName);
      }

      const agentName = breach.assigned_to
        ? await getAgentDisplayName(breach.assigned_to)
        : null;

      const ageMinutes = Math.floor(breach.age_seconds / 60);
      const leadDeepLink = buildLeadDeepLink(breach);

      const sendResults = await Promise.allSettled(
        recipients.map((to) =>
          sendSlaBreachEmail({
            to,
            lead: breach,
            ageMinutes,
            agentName,
            countryName,
            leadDeepLink,
          }),
        ),
      );

      let allSucceeded = true;
      sendResults.forEach((res, idx) => {
        if (res.status === "rejected") {
          allSucceeded = false;
          const message =
            res.reason instanceof Error
              ? res.reason.message
              : String(res.reason);
          errors.push({
            leadId: breach.id,
            recipient: recipients![idx]!,
            message,
          });
        }
      });

      if (!allSucceeded) {
        // Don't mark the lead — next minute retries the entire batch.
        return;
      }

      try {
        await markBreachAlerted(breach.id);
        alerted += 1;
      } catch (err) {
        // The email landed but the dedupe write failed. Log it; next minute
        // re-emails (acceptable: same recipients, same content; Resend rate
        // limits will save us from a flood).
        const message = err instanceof Error ? err.message : String(err);
        errors.push({
          leadId: breach.id,
          recipient: "",
          message: `mark_alerted_failed: ${message}`,
        });
      }
    }),
  );

  const result: CronResult = {
    checked: breaches.length,
    alerted,
    errors,
  };

  emitCronLog({
    checked: result.checked,
    alerted: result.alerted,
    error_count: result.errors.length,
  });

  return NextResponse.json(result);
}

/**
 * Structured invocation log for Vercel's runtime drain. Writing JSON-per-line
 * to stdout is the documented contract for log shipping (Vercel → Logflare /
 * Datadog) — `console` is the production observability boundary here, not a
 * leftover debug print. Centralised so the lint rule that bans bare `console`
 * stays valid everywhere else in the route.
 */
function emitCronLog(fields: {
  checked: number;
  alerted: number;
  error_count: number;
}): void {
  const line =
    JSON.stringify({ event: "sla_cron", ...fields }) + "\n";
  process.stdout.write(line);
}
