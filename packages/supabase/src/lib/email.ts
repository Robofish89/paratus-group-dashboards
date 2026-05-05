import 'server-only';

import { Resend } from 'resend';

import type { BreachLead } from '../dal/sla';
import type { AppRole } from '../types';
import { InviteEmail } from './emails/invite';
import { SlaBreachEmail } from './emails/sla-breach';

/**
 * Phase 6 plan 06-01 — Resend wrapper for SLA breach email alerts.
 * Phase 7 plan 07-01 — extended with the user-onboarding invite send path.
 *
 * Both senders share the same lazy Resend client and env-validation. The
 * client is created on first send, not at module-import time, so tests +
 * dead-code paths (e.g. a route that imports a DAL helper that transitively
 * imports this file) don't crash without env. The first real call asserts
 * the env contract and throws synchronously if anything is missing.
 *
 * AVOID: silently catching Resend errors and returning `{ ok: true }`. Both
 * callers (the SLA cron + the rollout provisioning script) rely on the throw
 * to refuse marking a follow-up state and let the next attempt retry.
 */

let cachedClient: Resend | null = null;

function getResendClient(fromOverride?: string): {
  client: Resend;
  from: string;
} {
  const apiKey = process.env.RESEND_API_KEY;
  // INVITE_FROM_EMAIL is intentionally OPTIONAL — if absent we fall back to
  // SLA_ALERT_FROM_EMAIL so v1 doesn't force a second env var. The override
  // exists for the case where the operator wants e.g. `welcome@` vs
  // `alerts@` segmentation; one Resend sender works for both flows by
  // default. Documented in the SUMMARY.
  const from = fromOverride ?? process.env.SLA_ALERT_FROM_EMAIL;
  if (!apiKey) {
    throw new Error(
      'RESEND_API_KEY missing — set it in Vercel (Production + Preview, Sensitive) and apps/web/.env.local for local smoke.',
    );
  }
  if (!from) {
    throw new Error(
      'SLA_ALERT_FROM_EMAIL missing — must be a verified Resend sender (e.g. alerts@paratus.group). INVITE_FROM_EMAIL overrides it for invites only.',
    );
  }
  if (!cachedClient) {
    cachedClient = new Resend(apiKey);
  }
  return { client: cachedClient, from };
}

// ── SLA breach email ──────────────────────────────────────────────────────

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

// ── Invite email (Phase 7 rollout) ────────────────────────────────────────

export interface SendInviteEmailInput {
  to: string;
  fullName: string;
  role: AppRole;
  countryName?: string | null;
  /** The Supabase invite action_link (from `auth.admin.generateLink`). */
  actionUrl: string;
  /** The auth.users id — used for the `X-Entity-Ref-ID` header. */
  userId: string;
  /** Where bounces / "the link expired" requests go. */
  supportEmail: string;
}

export interface SendInviteEmailResult {
  id: string | null;
}

/**
 * Send one onboarding invite. Throws on Resend failure so the rollout script
 * can log a structured per-row failure and stop.
 *
 * Why hand-rolled instead of `auth.admin.inviteUserByEmail`:
 *   - Default Supabase SMTP is capped at 2 emails/hour (production-unsuitable).
 *   - `inviteUserByEmail` is broken on re-invite for existing users
 *     (supabase/auth#2180) — re-running the script for "user lost the email"
 *     would 400. Hand-rolling via Resend bypasses both traps. The Supabase
 *     side still owns the OTP via `auth.admin.generateLink({ type: 'invite' })`.
 */
export async function sendInviteEmail(
  input: SendInviteEmailInput,
): Promise<SendInviteEmailResult> {
  // INVITE_FROM_EMAIL is read here (not via the function default) so the cache
  // entry is shared with sendSlaBreachEmail — we still build a single Resend
  // client either way. Falls back to SLA_ALERT_FROM_EMAIL when unset.
  const inviteFrom = process.env.INVITE_FROM_EMAIL;
  const { client, from } = getResendClient(inviteFrom);

  const subject = 'Welcome to Paratus Group Dashboards';

  const { data, error } = await client.emails.send({
    from,
    to: [input.to],
    subject,
    react: InviteEmail({
      fullName: input.fullName,
      role: input.role,
      countryName: input.countryName ?? null,
      actionUrl: input.actionUrl,
      supportEmail: input.supportEmail,
    }),
    // Stops Gmail/Outlook from threading multiple invites (e.g. re-issues for
    // a user who lost the first email) into a single thread; each invite gets
    // its own visible row.
    headers: { 'X-Entity-Ref-ID': `invite-${input.userId}` },
  });

  if (error) {
    throw new Error(`Resend send failed: ${error.message}`);
  }

  return { id: data?.id ?? null };
}

// ── Test helpers ──────────────────────────────────────────────────────────

/**
 * Test-only hook to clear the cached Resend client between vi.mock resets.
 * Not exported from the package barrel; importable only via the deep path
 * `@repo/supabase/lib/email`.
 *
 * Renamed from `__resetResendClientForTests` (06-01) now that two send
 * functions share the cache. The old name is preserved as a deprecation
 * alias so the SLA cron test (`apps/web/tests/sla.cron.test.ts`) keeps
 * working without an immediate edit.
 */
export function __resetEmailClientForTests(): void {
  cachedClient = null;
}

/** @deprecated — use `__resetEmailClientForTests`. Retained for plan 06-01 callers. */
export const __resetResendClientForTests = __resetEmailClientForTests;
