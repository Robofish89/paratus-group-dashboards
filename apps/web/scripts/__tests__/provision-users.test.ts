import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  test,
  vi,
} from "vitest";

import { createServiceClient } from "../../test-support/helpers";

/**
 * Phase 7 plan 07-01 task 3 — provision-users.ts integration test.
 *
 * Exercises the bulk-invite script against the hermetic local Supabase
 * stack (apps/web/test-support/vitest.global-setup.ts). Resend is stubbed
 * at the module boundary — the test never hits the real API.
 *
 * Five cases:
 *   1. Happy path        — single agent row → user + role + invite send
 *   2. Idempotency       — re-run on same CSV → no duplicate writes
 *   3. JWT-hook ordering — user_roles upsert resolves BEFORE generateLink
 *   4. CSV rejection     — hq_admin with country_code → no Supabase call
 *   5. CSV rejection     — country_admin with empty country_code → ditto
 *
 * The JWT-hook ordering test is the load-bearing one; reorder the script's
 * per-row flow and that test goes red. (`custom_access_token_hook` reads
 * public.user_roles — if the row isn't there at JWT-mint time the user
 * lands on /unauthorized after clicking the invite. Plan 07-RESEARCH q1.)
 */

// Stub Resend at the @repo/supabase/lib/email module boundary so the script
// can be exercised without hitting the real API. The mock records calls
// for assertion.
const sendInviteEmailMock = vi.fn(async () => ({ id: "msg_test_invite" }));
vi.mock("@repo/supabase/lib/email", () => ({
  sendInviteEmail: sendInviteEmailMock,
}));

// Required env reads inside the script (NEXT_PUBLIC_APP_URL is the only
// one not provided by the global setup; the rest come from
// vitest.global-setup.ts via `supabase status`).
const APP_URL = "http://localhost:3012";
process.env.NEXT_PUBLIC_APP_URL = APP_URL;

// RLS BYPASS marker: the test imports the service-role client from
// helpers.ts (createServiceClient) for setup + teardown only. The
// provisioning script ALSO uses service-role internally — that is the
// thing under test, not the thing under bypass.
const { main } = await import("../provision-users");

// Track every email we create so afterEach can delete the auth.users row
// (cascade flushes user_roles). Local-stack-only — never run against
// the cloud project.
const createdEmails = new Set<string>();

function uniqueEmail(prefix: string): string {
  // Re-running the suite quickly back-to-back must not collide with the
  // previous run's emails (the prior tests' cleanup runs after each case,
  // but the assertion here still benefits from per-run uniqueness).
  const stamp = `${process.pid}-${Date.now()}-${Math.random()
    .toString(36)
    .slice(2, 8)}`;
  createdEmails.add(`${prefix}-${stamp}@paratus.test`);
  return `${prefix}-${stamp}@paratus.test`;
}

async function deleteUserByEmail(email: string): Promise<void> {
  const admin = createServiceClient();
  const { data, error } = await admin.auth.admin.listUsers({
    page: 1,
    perPage: 1000,
  });
  if (error) return;
  const found = data.users.find((u) => u.email === email);
  if (!found) return;
  await admin.auth.admin.deleteUser(found.id);
}

let tmpDir: string;

function writeCsv(filename: string, content: string): string {
  const path = join(tmpDir, filename);
  writeFileSync(path, content, "utf8");
  return path;
}

beforeAll(() => {
  tmpDir = mkdtempSync(join(tmpdir(), "provision-users-test-"));
});

afterAll(() => {
  rmSync(tmpDir, { recursive: true, force: true });
});

beforeEach(() => {
  sendInviteEmailMock.mockClear();
});

afterEach(async () => {
  // Tear down any users created during the test (cascade flushes
  // public.user_roles via the FK ON DELETE CASCADE).
  const emails = Array.from(createdEmails);
  createdEmails.clear();
  for (const email of emails) {
    await deleteUserByEmail(email);
  }
});

describe("provision-users.ts — bulk invite engine", () => {
  test("1. happy path — single agent provisioned end-to-end", async () => {
    const email = uniqueEmail("happy");
    const csv = writeCsv(
      "happy.csv",
      `email,role,country_code,full_name\n${email},agent,MZ,Happy Agent\n`,
    );

    const exitCode = await main([csv]);
    expect(exitCode).toBe(0);

    // auth.users has the user.
    const admin = createServiceClient();
    const { data: page } = await admin.auth.admin.listUsers({
      page: 1,
      perPage: 1000,
    });
    const user = page.users.find((u) => u.email === email);
    expect(user).toBeDefined();
    const userId = user!.id;

    // user_roles row matches.
    const { data: role } = await admin
      .from("user_roles")
      .select("user_id, role, country_code, is_active")
      .eq("user_id", userId)
      .single();
    expect(role).toMatchObject({
      user_id: userId,
      role: "agent",
      country_code: "MZ",
      is_active: true,
    });

    // sendInviteEmail called once with the expected shape.
    expect(sendInviteEmailMock).toHaveBeenCalledTimes(1);
    const calls = sendInviteEmailMock.mock.calls as unknown as Array<
      [
        {
          to: string;
          role: string;
          countryName: string | null;
          actionUrl: string;
          userId: string;
          supportEmail: string;
        },
      ]
    >;
    const args = calls[0]![0];
    expect(args.to).toBe(email);
    expect(args.role).toBe("agent");
    expect(args.countryName).toBe("Mozambique");
    expect(args.userId).toBe(userId);
    // The invite OTP redirect URL — the host stays whatever Supabase Auth
    // gave us (verify_url = local-stack 54321), but the redirect_to query
    // param carries our /auth/accept-invite path.
    expect(args.actionUrl).toContain("/auth/v1/verify");
    expect(args.actionUrl).toContain(
      encodeURIComponent(`${APP_URL}/auth/accept-invite`),
    );
  });

  test("2. idempotency — second run leaves DB unchanged, re-issues invite", async () => {
    const email = uniqueEmail("idem");
    const csv = writeCsv(
      "idem.csv",
      `email,role,country_code,full_name\n${email},agent,MZ,Idem Agent\n`,
    );

    const first = await main([csv]);
    expect(first).toBe(0);
    expect(sendInviteEmailMock).toHaveBeenCalledTimes(1);

    const admin = createServiceClient();
    const { data: pageA } = await admin.auth.admin.listUsers({
      page: 1,
      perPage: 1000,
    });
    const usersA = pageA.users.filter((u) => u.email === email);
    expect(usersA).toHaveLength(1);

    const second = await main([csv]);
    expect(second).toBe(0);
    // The script re-sends on every run by design — that's the
    // "user lost the email" recovery posture.
    expect(sendInviteEmailMock).toHaveBeenCalledTimes(2);

    const { data: pageB } = await admin.auth.admin.listUsers({
      page: 1,
      perPage: 1000,
    });
    const usersB = pageB.users.filter((u) => u.email === email);
    expect(usersB).toHaveLength(1);
    expect(usersB[0]!.id).toBe(usersA[0]!.id);

    const { data: roles } = await admin
      .from("user_roles")
      .select("user_id")
      .eq("user_id", usersA[0]!.id);
    expect(roles).toHaveLength(1);
  });

  test("3. JWT-hook ordering — user_roles upsert resolves BEFORE generateLink", async () => {
    const email = uniqueEmail("order");
    const csv = writeCsv(
      "order.csv",
      `email,role,country_code,full_name\n${email},agent,MZ,Order Agent\n`,
    );

    // RLS BYPASS: build a service-role admin client we can spy on, then
    // inject it via the test-only `overrides.admin` hook so the script
    // talks to OUR client (not its own). Spies record the resolution
    // order of upsert vs generateLink — the load-bearing assertion.
    const admin = createServiceClient();

    const callOrder: string[] = [];

    const originalFrom = admin.from.bind(admin);
    vi.spyOn(admin, "from").mockImplementation(((table: string) => {
      const builder = originalFrom(table);
      if (table === "user_roles") {
        const originalUpsert = builder.upsert.bind(builder);
        // Re-bind upsert so we observe when the awaited promise settles
        // (NOT when the builder is constructed — supabase-js resolves
        // lazily on .then()).
        builder.upsert = ((...args: Parameters<typeof originalUpsert>) => {
          const result = originalUpsert(...args);
          // The builder is itself thenable; tap the resolution.
          const originalThen = result.then.bind(result);
          result.then = ((...thenArgs: Parameters<typeof originalThen>) =>
            originalThen((value) => {
              callOrder.push("user_roles_upsert_resolved");
              return value;
            }, thenArgs[1])) as typeof originalThen;
          return result;
        }) as typeof builder.upsert;
      }
      return builder;
    }) as never);

    const originalGenerateLink = admin.auth.admin.generateLink.bind(
      admin.auth.admin,
    );
    vi.spyOn(admin.auth.admin, "generateLink").mockImplementation(
      async (...args: Parameters<typeof originalGenerateLink>) => {
        callOrder.push("generate_link_called");
        return originalGenerateLink(...args);
      },
    );

    const exitCode = await main([csv], { admin, appUrl: APP_URL });
    expect(exitCode).toBe(0);

    // Both events fired, and the upsert resolved before generateLink fired.
    expect(callOrder).toContain("user_roles_upsert_resolved");
    expect(callOrder).toContain("generate_link_called");
    expect(callOrder.indexOf("user_roles_upsert_resolved")).toBeLessThan(
      callOrder.indexOf("generate_link_called"),
    );
  });

  test("4. CSV rejection — hq_admin with country_code never reaches Supabase", async () => {
    const email = uniqueEmail("hq-bad");
    const csv = writeCsv(
      "hq-bad.csv",
      `email,role,country_code,full_name\n${email},hq_admin,KE,Bad HQ\n`,
    );

    // RLS BYPASS: spy on createUser via an injected admin client to PROVE
    // the rejection happened upstream of any Supabase call.
    const admin = createServiceClient();
    const createUserSpy = vi.spyOn(admin.auth.admin, "createUser");

    const exitCode = await main([csv], { admin, appUrl: APP_URL });
    expect(exitCode).toBe(1);
    expect(createUserSpy).not.toHaveBeenCalled();
    expect(sendInviteEmailMock).not.toHaveBeenCalled();

    // Confirm the user does NOT exist in auth.users.
    const { data: page } = await admin.auth.admin.listUsers({
      page: 1,
      perPage: 1000,
    });
    expect(page.users.find((u) => u.email === email)).toBeUndefined();
    // Drop from cleanup set since we never created anything.
    createdEmails.delete(email);
  });

  test("5. CSV rejection — country_admin with empty country_code never reaches Supabase", async () => {
    const email = uniqueEmail("ca-bad");
    const csv = writeCsv(
      "ca-bad.csv",
      `email,role,country_code,full_name\n${email},country_admin,,Bad CA\n`,
    );

    const admin = createServiceClient();
    const createUserSpy = vi.spyOn(admin.auth.admin, "createUser");

    const exitCode = await main([csv], { admin, appUrl: APP_URL });
    expect(exitCode).toBe(1);
    expect(createUserSpy).not.toHaveBeenCalled();
    expect(sendInviteEmailMock).not.toHaveBeenCalled();

    const { data: page } = await admin.auth.admin.listUsers({
      page: 1,
      perPage: 1000,
    });
    expect(page.users.find((u) => u.email === email)).toBeUndefined();
    createdEmails.delete(email);
  });
});
