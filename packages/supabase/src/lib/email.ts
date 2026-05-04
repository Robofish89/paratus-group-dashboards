import 'server-only';

import { Resend } from 'resend';

import type { BreachLead } from '../dal/sla';
import { SlaBreachEmail } from './emails/sla-breach';

/**
 * Phase 6 plan 06-01 — Resend wrapper for SLA breach email alerts.
 *
 * Single export (`sendSlaBreachEmail`). The Resend client and env vars are
 * read lazily on the first send — module-import time is safe (so tests +
 * dead-code paths don't crash). The first real call asserts the env contract
 * and throws synchronously if anything is missing; the cron route catches
 * per-breach and continues, so one bad recipient doesn't kill the batch.
 *
 * AVOID: silently catching Resend errors and returning `{ ok: true }`. The
 * caller relies on the throw to refuse marking the lead alerted, so the next
 * minute retries.
 */

let cachedClient: Resend | null = null;

function getResendClient(): { client: Resend; from: string } {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.SLA_ALERT_FROM_EMAIL;
  if (!apiKey) {
    throw new Error(
      'RESEND_API_KEY missing — set it in Vercel (Production + Preview, Sensitive) and apps/web/.env.local for local smoke.',
    );
  }
  if (!from) {
    throw new Error(
      'SLA_ALERT_FROM_EMAIL missing — must be a verified Resend sender (e.g. alerts@paratus.group).',
    );
  }
  if (!cachedClient) {
    cachedClient = new Resend(apiKey);
  }
  return { client: cachedClient, from };
}

export interface SendSlaBreachEmailInput {
  to: string;
  lead: BreachLead;
  ageMinutes: number;
  agentName?: string | null;
  countryName?: string | null;
  /**
   * Absolute URL the recipient lands on when they click "Open lead". The cron
   * route composes this from the lead's country slug + lead id.
   */
  leadDeepLink: string;
}

export interface SendSlaBreachEmailResult {
  id: string | null;
}

/**
 * Send one SLA breach alert. Throws on Resend failure (network, auth, domain
 * not verified, rate-limited) so the caller can decide whether to skip the
 * `mark_sla_alerted` write and let the next cron tick retry.
 */
export async function sendSlaBreachEmail(
  input: SendSlaBreachEmailInput,
): Promise<SendSlaBreachEmailResult> {
  const { client, from } = getResendClient();

  const subject = `Lead unanswered ${input.ageMinutes} min — ${
    input.countryName ?? input.lead.country_code
  }`;

  const { data, error } = await client.emails.send({
    from,
    to: [input.to],
    subject,
    react: SlaBreachEmail({
      to: input.to,
      lead: input.lead,
      ageMinutes: input.ageMinutes,
      agentName: input.agentName ?? null,
      countryName: input.countryName ?? null,
      leadDeepLink: input.leadDeepLink,
    }),
    // Stops Gmail/Outlook from threading consecutive breach alerts together —
    // each lead gets its own visible row in the inbox.
    headers: { 'X-Entity-Ref-ID': input.lead.id },
  });

  if (error) {
    throw new Error(`Resend send failed: ${error.message}`);
  }

  return { id: data?.id ?? null };
}

/**
 * Test-only hook to clear the cached Resend client between vi.mock resets.
 * Not exported from the package barrel; importable only via the deep path
 * `@repo/supabase/lib/email` which `apps/web/tests/sla.cron.test.ts` uses.
 */
export function __resetResendClientForTests(): void {
  cachedClient = null;
}
