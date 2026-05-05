/**
 * Phase 7 plan 07-01 — bulk user-provisioning script.
 *
 * RLS BYPASS: this script uses `createAdminClient()` (service-role key) for
 * EVERY Supabase call. The service-role bypasses every RLS policy on every
 * table — required because we're creating auth.users and writing public.user_roles
 * for users who don't yet exist (no JWT, no claims, no policy match). The
 * script runs from a developer machine, never inside a Next.js request
 * handler, and is gated by the operator possessing SUPABASE_SERVICE_ROLE_KEY.
 *
 * Usage:
 *   npx tsx --require ./apps/web/scripts/_server-only-preload.cjs \
 *     apps/web/scripts/provision-users.ts [csvPath] [--dry-run] [--country=<CC>]
 *
 *   The `--require` shim intercepts `server-only` (the @repo/supabase
 *   admin + email helpers all import it) so the script can run under
 *   plain Node via tsx. Production Next.js builds are unaffected.
 *
 * Defaults:
 *   csvPath = .planning/rollout-contacts.csv
 *
 * What it does:
 *   For each CSV row {email, role, country_code, full_name}:
 *     1. createUser({email_confirm: false}) — gets a Supabase auth UUID,
 *        sends nothing.
 *     2. upsert public.user_roles BEFORE the invite is consumed — closes the
 *        custom_access_token_hook race (00001) where a user clicking the
 *        invite link before their role row exists gets null claims and
 *        bounces to /unauthorized.
 *     3. generateLink({type: 'invite'}) — re-issues the OTP without sending
 *        (works on re-runs too — supabase/auth#2180 makes
 *        inviteUserByEmail() unusable past the first send for an email).
 *     4. sendInviteEmail(...) via Resend — branded paratus invite, sender
 *        shared with the SLA cron.
 *
 * Idempotent on re-run: createUser → email_exists → listUsers lookup;
 * user_roles upsert is a no-op when the row matches; generateLink re-issues
 * the OTP; Resend re-sends (intentional — that's the "user lost the email"
 * recovery posture).
 *
 * Exits 0 if every row succeeded, 1 if any row failed. One JSON log line
 * per row, plus one provision_summary line at the end.
 *
 * AVOID:
 *   - inviteUserByEmail (broken on re-invite — supabase/auth#2180).
 *   - Promise.all over rows (Resend rate limit + harder failure attribution).
 *   - Logging secrets, even partially.
 *   - next/headers / 'server-only' imports — this script runs under bare
 *     Node via tsx, not inside a Next.js runtime.
 */

import { readFileSync } from 'node:fs';
import process from 'node:process';

import Papa from 'papaparse';
import { z } from 'zod';

// RLS BYPASS: createAdminClient() returns a service-role Supabase client
// that ignores every RLS policy. Used here because we're provisioning users
// who don't yet have JWTs / claims; no anon-key client could create the
// auth row or write to user_roles for a stranger. See file header for the
// runtime-boundary justification.
import { createAdminClient } from '@repo/supabase/admin'; // RLS BYPASS — see comment above; required for provisioning users who have no JWT yet.
import { sendInviteEmail } from '@repo/supabase/lib/email';
import { APP_ROLES, ALL_COUNTRY_CODES } from '@repo/supabase/types';

import { ACTIVE_COUNTRIES } from '../app/_lib/countries';

// ── Constants ─────────────────────────────────────────────────────────────

const DEFAULT_CSV_PATH = '.planning/rollout-contacts.csv';

/**
 * Pinned support contact for v1. The retainer can wire this through env
 * later. Kept literal here so the rollout doesn't depend on yet another
 * env var being provisioned correctly.
 */
const DEFAULT_SUPPORT_EMAIL = 'william@brainstormprojects.co';

const REQUIRED_ENV = [
  'SUPABASE_SERVICE_ROLE_KEY',
  'NEXT_PUBLIC_SUPABASE_URL',
  'RESEND_API_KEY',
  'NEXT_PUBLIC_APP_URL',
] as const;

// ── Types & schema ────────────────────────────────────────────────────────

const csvRowSchema = z
  .object({
    email: z.string().email('email must be a valid address').trim().toLowerCase(),
    role: z.enum(APP_ROLES),
    country_code: z
      .string()
      .trim()
      .toUpperCase()
      .transform((v) => (v === '' ? null : v))
      .pipe(z.union([z.enum(ALL_COUNTRY_CODES), z.null()])),
    full_name: z.string().trim().min(1, 'full_name is required'),
  })
  .refine(
    (row) =>
      (row.role === 'hq_admin' && row.country_code === null) ||
      (row.role !== 'hq_admin' && row.country_code !== null),
    {
      message:
        'hq_admin rows must have empty country_code; country_admin / agent rows must specify country_code',
    },
  );

type CsvRow = z.infer<typeof csvRowSchema>;

interface CliArgs {
  csvPath: string;
  dryRun: boolean;
  countryFilter: string | null;
}

// ── CLI parsing ───────────────────────────────────────────────────────────

function parseArgs(argv: string[]): CliArgs {
  let csvPath = DEFAULT_CSV_PATH;
  let dryRun = false;
  let countryFilter: string | null = null;
  for (const raw of argv) {
    if (raw === '--dry-run') {
      dryRun = true;
    } else if (raw.startsWith('--country=')) {
      countryFilter = raw.slice('--country='.length).toUpperCase();
    } else if (!raw.startsWith('--')) {
      csvPath = raw;
    }
  }
  return { csvPath, dryRun, countryFilter };
}

// ── Logging ───────────────────────────────────────────────────────────────

type ProvisionStep =
  | 'csv_validation'
  | 'create'
  | 'role_upsert'
  | 'generate_link'
  | 'send_email';

function logEvent(event: Record<string, unknown>): void {
  process.stdout.write(JSON.stringify(event) + '\n');
}

// ── Country lookup ────────────────────────────────────────────────────────

function countryNameByCode(code: string | null): string | null {
  if (!code) return null;
  const slug = code.toLowerCase() as keyof typeof ACTIVE_COUNTRIES;
  return ACTIVE_COUNTRIES[slug] ?? null;
}

// ── Per-row provisioning ──────────────────────────────────────────────────

interface ProvisionDeps {
  // RLS BYPASS: service-role client. Required for `auth.admin.createUser`,
  // `auth.admin.listUsers`, `auth.admin.generateLink`, and the `user_roles`
  // upsert (no JWT exists for the new user yet, so RLS would refuse the
  // write). Stays on this script's runtime only — never instantiated from
  // a request handler.
  admin: ReturnType<typeof createAdminClient>;
  appUrl: string;
}

async function provisionOne(row: CsvRow, deps: ProvisionDeps): Promise<void> {
  const { admin, appUrl } = deps;

  // Step 1 — create the auth user without sending anything.
  let userId: string | null = null;
  const { data: created, error: createErr } = await admin.auth.admin.createUser({
    email: row.email,
    email_confirm: false,
    user_metadata: { full_name: row.full_name },
  });
  if (createErr) {
    const isExistingUser =
      createErr.code === 'email_exists' ||
      /already (been )?registered|already exists/i.test(createErr.message);
    if (!isExistingUser) {
      throw new ProvisionError('create', createErr.message);
    }
    // Look up the existing user by email. The admin API doesn't expose a
    // direct getUserByEmail, so we page until we find them. 1000 is well
    // above the v1 user count (~30); a single page suffices.
    const { data: page, error: listErr } = await admin.auth.admin.listUsers({
      page: 1,
      perPage: 1000,
    });
    if (listErr) throw new ProvisionError('create', listErr.message);
    const existing = page.users.find((u) => u.email === row.email);
    if (!existing) {
      throw new ProvisionError(
        'create',
        `email_exists but listUsers did not return ${row.email}`,
      );
    }
    userId = existing.id;
  } else {
    userId = created.user?.id ?? null;
  }
  if (!userId) {
    throw new ProvisionError('create', `no user_id for ${row.email}`);
  }

  // Step 2 — upsert user_roles BEFORE invite consumption (closes JWT-hook race).
  const { error: roleErr } = await admin
    .from('user_roles')
    .upsert(
      {
        user_id: userId,
        role: row.role,
        country_code: row.country_code,
        is_active: true,
      },
      { onConflict: 'user_id' },
    );
  if (roleErr) throw new ProvisionError('role_upsert', roleErr.message);

  // Step 3 — generate (don't send) the invite link.
  const { data: link, error: linkErr } = await admin.auth.admin.generateLink({
    type: 'invite',
    email: row.email,
    options: {
      redirectTo: `${appUrl.replace(/\/$/, '')}/auth/accept-invite`,
    },
  });
  if (linkErr) throw new ProvisionError('generate_link', linkErr.message);
  const actionUrl = link?.properties?.action_link;
  if (!actionUrl) {
    throw new ProvisionError(
      'generate_link',
      `generateLink returned no action_link for ${row.email}`,
    );
  }

  // Step 4 — send via Resend.
  try {
    await sendInviteEmail({
      to: row.email,
      fullName: row.full_name,
      role: row.role,
      countryName: countryNameByCode(row.country_code),
      actionUrl,
      userId,
      supportEmail: DEFAULT_SUPPORT_EMAIL,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new ProvisionError('send_email', message);
  }
}

class ProvisionError extends Error {
  constructor(
    public readonly step: ProvisionStep,
    message: string,
  ) {
    super(message);
    this.name = 'ProvisionError';
  }
}

// ── CSV loading + validation ──────────────────────────────────────────────

interface LoadedRow {
  raw: Record<string, string>;
  result:
    | { ok: true; row: CsvRow }
    | { ok: false; message: string; email: string };
}

function loadAndValidate(csvPath: string, countryFilter: string | null): LoadedRow[] {
  const text = readFileSync(csvPath, 'utf8');
  const parsed = Papa.parse<Record<string, string>>(text, {
    header: true,
    skipEmptyLines: true,
    transformHeader: (h) => h.trim(),
  });
  if (parsed.errors.length > 0) {
    throw new Error(
      `csv parse failed: ${parsed.errors
        .map((e) => `row ${e.row}: ${e.message}`)
        .join('; ')}`,
    );
  }
  const rows: LoadedRow[] = [];
  for (const raw of parsed.data) {
    const validated = csvRowSchema.safeParse(raw);
    if (!validated.success) {
      const message = validated.error.issues
        .map((i) => `${i.path.join('.') || '<row>'}: ${i.message}`)
        .join('; ');
      rows.push({
        raw,
        result: { ok: false, message, email: raw.email ?? '<unknown>' },
      });
      continue;
    }
    if (countryFilter !== null) {
      // HQ admins (country_code=null) are excluded from country-filtered runs.
      if (validated.data.country_code !== countryFilter) continue;
    }
    rows.push({ raw, result: { ok: true, row: validated.data } });
  }
  return rows;
}

// ── Env assertion ─────────────────────────────────────────────────────────

function assertEnv(dryRun: boolean): void {
  if (dryRun) return; // dry run never touches Supabase or Resend
  const missing = REQUIRED_ENV.filter((k) => !process.env[k]);
  if (missing.length > 0) {
    process.stderr.write(
      `provision-users: missing required env vars: ${missing.join(', ')}\n`,
    );
    process.exit(1);
  }
}

// ── Main entry ────────────────────────────────────────────────────────────

export interface MainOverrides {
  /**
   * Test-only injection point. The integration test (07-01 Task 3) passes
   * its own admin client so vi.spyOn can observe the call order on
   * `auth.admin.generateLink` vs `from('user_roles').upsert` — the JWT-hook
   * ordering contract is the single most important behavioural invariant
   * of this script and is pinned by a test against a real Supabase stack.
   */
  admin?: ReturnType<typeof createAdminClient>;
  appUrl?: string;
}

export async function main(
  argv: string[],
  overrides: MainOverrides = {},
): Promise<number> {
  const args = parseArgs(argv);
  assertEnv(args.dryRun);

  let loaded: LoadedRow[];
  try {
    loaded = loadAndValidate(args.csvPath, args.countryFilter);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logEvent({ event: 'csv_load_failed', csvPath: args.csvPath, message });
    return 1;
  }

  let succeeded = 0;
  let failed = 0;

  // Lazy admin client + appUrl — only built when we'll actually call them.
  let deps: ProvisionDeps | null = null;

  for (const item of loaded) {
    if (!item.result.ok) {
      failed += 1;
      logEvent({
        event: 'user_provision_failed',
        email: item.result.email,
        message: item.result.message,
        step: 'csv_validation' satisfies ProvisionStep,
      });
      continue;
    }

    const row = item.result.row;

    if (args.dryRun) {
      logEvent({
        event: 'csv_row_validated',
        email: row.email,
        role: row.role,
        country_code: row.country_code,
        ts: new Date().toISOString(),
      });
      succeeded += 1;
      continue;
    }

    if (!deps) {
      deps = {
        admin: overrides.admin ?? createAdminClient(),
        appUrl: overrides.appUrl ?? process.env.NEXT_PUBLIC_APP_URL!,
      };
    }

    try {
      await provisionOne(row, deps);
      succeeded += 1;
      logEvent({
        event: 'user_provisioned',
        email: row.email,
        role: row.role,
        country_code: row.country_code,
        ts: new Date().toISOString(),
      });
    } catch (err) {
      failed += 1;
      const step = err instanceof ProvisionError ? err.step : 'create';
      const message = err instanceof Error ? err.message : String(err);
      logEvent({
        event: 'user_provision_failed',
        email: row.email,
        message,
        step,
      });
    }
  }

  logEvent({
    event: 'provision_summary',
    total: loaded.length,
    succeeded,
    failed,
  });

  return failed === 0 ? 0 : 1;
}

// CLI bootstrap — only when the file is run directly via tsx, not when it's
// imported by a test. Compares the resolved entry-point URL to the script's
// own URL; equal means "this is the main module".
const isDirectInvocation =
  typeof process.argv[1] === 'string' &&
  import.meta.url === `file://${process.argv[1]}`;

if (isDirectInvocation) {
  main(process.argv.slice(2)).then(
    (code) => process.exit(code),
    (err) => {
      const message = err instanceof Error ? err.message : String(err);
      logEvent({ event: 'provision_crashed', message });
      process.exit(1);
    },
  );
}
