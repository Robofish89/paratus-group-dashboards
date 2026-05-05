# Phase 7: Rollout — Research

**Researched:** 2026-05-05
**Domain:** Bulk user provisioning + onboarding + handover ceremony for a multi-tenant Supabase/Vercel app
**Confidence:** HIGH on the technical thread (Supabase Auth admin API); MEDIUM on the operational threads (onboarding/handover are template work, not deeply ecosystem-driven)

<research_summary>
## Summary

Phase 7 is mostly operational: provision ~30 users across 12 active countries, seed 3 coming-soon flags (already done in migration `00004`), write onboarding docs, run a per-country cutover with William, hand the keys over. Out of those five workstreams, **only one has a non-trivial technical thread worth researching**: the bulk-invite flow against Supabase Auth.

The bulk-invite flow has three traps that bite at scale and are not obvious from `inviteUserByEmail`'s docstring:
1. **JWT-hook race condition** — `custom_access_token_hook` (migration `00001`) reads `public.user_roles`. If the user clicks the email and signs in *before* we've inserted their `user_roles` row, the hook returns null claims and middleware bounces them to `/unauthorized`. Order matters.
2. **Email rate-limit ceiling** — Supabase's default SMTP is **2 messages/hour**, custom SMTP starts at **30/hour**. We have 30+ users to invite. We already use Resend for SLA alerts (Phase 6 plan 06-01) — wire Resend as the auth SMTP provider too, single vendor for transactional + auth email.
3. **Re-invite is broken** — calling `inviteUserByEmail` again on an existing user returns "user already registered" (open issue [supabase/auth#2180](https://github.com/supabase/auth/issues/2180)). Workaround: use `generateLink({type: 'invite'})` which re-issues the OTP without sending, then send via Resend ourselves.

**Primary recommendation:** Build a single `provisionUsers(...)` script in `apps/web/scripts/` that takes a CSV of `{email, role, country_code, full_name}`, calls `admin.createUser({email, email_confirm: false})` to get the UUID, INSERTs `user_roles`, then calls `generateLink({type: 'invite'})` and sends via the existing Resend client with a branded `<InviteEmail>` React Email template. Idempotent on email (skip if `user_roles` row exists; re-issue link if user exists but no row). Run from a developer machine with `SUPABASE_SERVICE_ROLE_KEY` — not a route handler.

The remaining workstreams are template work:
- **Coming-soon countries** — already shipped (Phase 2 migration `00004` seeds LS/MW/ZW with `status='coming_soon'`). Phase 7 verifies group views still exclude them and adds nothing.
- **Onboarding docs** — short Loom walkthroughs (60–90 s for atomic actions, 2–4 min for a full role flow), three role-specific one-pagers in `docs/onboarding/`, plus an in-app "?" link from each shell to the relevant Loom.
- **Cutover** — per-country checklist in `docs/CUTOVER.md`: confirm contact list, run provisioning script for that country, smoke-test from agent + admin seats, flip the form-side webhook to point at production, observe for 24 h, sign-off from William.
- **Handover** — Supabase + Vercel are already owned by `para.group.n8n@gmail.com` (the master Google account). Handover is an *invite-the-client* ceremony, not an org-transfer. Add William (or a Paratus IT contact) as Owner on the Supabase org and Member on the Vercel team; transfer the GitHub repo from `Robofish89` to a `paratusgroup` org under the master Google account; deliver the existing `docs/RUNBOOK.md` + `docs/BACKUP_RESTORE.md` (Phase 6) as final artifacts.
</research_summary>

<standard_stack>
## Standard Stack

Phase 7 introduces no new runtime dependencies. Everything runs through what Phases 1–6 already shipped.

### Already in the project (no install needed)
| Library | Version | Purpose | Used by Phase 7 for |
|---------|---------|---------|---------------------|
| `@supabase/supabase-js` | already pinned | Auth admin API | `admin.createUser`, `admin.generateLink({type:'invite'})` |
| `resend` | already pinned (Phase 6 plan 06-01) | Transactional email | Sending invite + welcome emails |
| `@react-email/components` | already pinned | Inline-styled email templates | Reusing the Phase 6 SLA template patterns for the invite email |
| `@repo/supabase/admin` | internal | `createAdminClient()` service-role client | Provisioning script |
| `pino` / structured `process.stdout.write` | already used in cron route | Provisioning audit trail | `{event:'user_provisioned', email, role, country_code}` lines for Vercel runtime drain |

### New tooling (zero deps, optional)
| Tool | Purpose | Notes |
|------|---------|-------|
| Loom (web app) | Record onboarding walkthroughs | No SDK; just record + paste public links into one-pagers and the in-app "?" target |
| `csv-parse` (already a transitive of CSV importer 02-05) | Parse `rollout-contacts.csv` for the script | Reuse the Phase 2 path if it's already there; otherwise `node:fs` + manual split is fine for a 30-row file |

### Alternatives considered
| Instead of | Could use | Why we're not |
|------------|-----------|----------------|
| `generateLink` + custom Resend send | `inviteUserByEmail` (Supabase sends) | Couples invite delivery to Supabase's default SMTP rate limit (2/hr), which capsizes a bulk run. With Resend already wired, sending ourselves is one extra line for full control over copy + branding + retry. |
| Build an in-app admin invite UI | Manual script | Out of scope — we have one rollout, not an ongoing invite cadence. Retainer scope can add the UI if Paratus adds country admins regularly. |
| Magic-link-only flow (no password) | Password setup on accept-invite | Rejected at design time — country admins need to log in from devices that don't always have email handy on. Password auth is the locked v1 model (Phase 1). |

**Installation:** none — Phase 7 is operational on top of the Phase 1–6 stack.
</standard_stack>

<architecture_patterns>
## Architecture Patterns

### Recommended layout (additions only)

```
apps/web/
├── scripts/
│   └── provision-users.ts            # NEW — bulk-invite runner
├── lib/emails/
│   ├── sla-breach.tsx                # already shipped (06-01)
│   └── invite.tsx                    # NEW — branded React Email template for invites
docs/
├── RUNBOOK.md                        # already shipped (06-05)
├── BACKUP_RESTORE.md                 # already shipped (06-05)
├── CUTOVER.md                        # NEW — per-country activation checklist
└── onboarding/
    ├── agent.md                      # NEW — one-pager for sales reps
    ├── country-admin.md              # NEW — one-pager for country admins
    ├── hq-admin.md                   # NEW — one-pager for HQ admins
    └── loom-links.md                 # NEW — index of recorded walkthroughs
.planning/
└── rollout-contacts.csv              # NEW — input to provision-users.ts (sourced from rollout-contacts.md)
```

### Pattern 1: Provision-then-invite (avoids JWT-hook race)

**What:** Always insert `user_roles` BEFORE the user can log in. Two-step Auth admin call: create user with `email_confirm: false` (gets UUID, no email), insert role row, then issue invite link.

**When to use:** Every Phase 7 user creation.

**Example:**
```typescript
// apps/web/scripts/provision-users.ts (sketch)
import { createAdminClient } from '@repo/supabase/admin';
import { Resend } from 'resend';
import { InviteEmail } from '@/lib/emails/invite';
import { render } from '@react-email/render';

const supabase = createAdminClient();
const resend = new Resend(process.env.RESEND_API_KEY!);

async function provisionOne(row: {
  email: string;
  role: 'hq_admin' | 'country_admin' | 'agent';
  country_code: string | null;
  full_name: string;
}) {
  // Step 1 — create the auth user without sending anything.
  const { data: created, error: createErr } = await supabase.auth.admin.createUser({
    email: row.email,
    email_confirm: false,
    user_metadata: { full_name: row.full_name },
  });

  // Idempotency: if the user already exists, fetch them.
  let userId = created?.user?.id;
  if (createErr?.code === 'email_exists') {
    const { data: existing } = await supabase.auth.admin.listUsers();
    userId = existing.users.find((u) => u.email === row.email)?.id;
  }
  if (!userId) throw new Error(`No user_id for ${row.email}: ${createErr?.message}`);

  // Step 2 — upsert the user_roles row BEFORE the invite is consumed.
  const { error: roleErr } = await supabase
    .from('user_roles')
    .upsert(
      { user_id: userId, role: row.role, country_code: row.country_code, is_active: true },
      { onConflict: 'user_id' },
    );
  if (roleErr) throw roleErr;

  // Step 3 — generate (don't send) an invite link, then send via Resend.
  const { data: link, error: linkErr } = await supabase.auth.admin.generateLink({
    type: 'invite',
    email: row.email,
    options: {
      redirectTo: `${process.env.NEXT_PUBLIC_APP_URL}/auth/accept-invite`,
    },
  });
  if (linkErr) throw linkErr;

  await resend.emails.send({
    from: process.env.SLA_ALERT_FROM_EMAIL!,
    to: row.email,
    subject: 'Welcome to Paratus Group Dashboards',
    html: await render(
      <InviteEmail fullName={row.full_name} role={row.role} actionUrl={link.properties.action_link} />,
    ),
    headers: { 'X-Entity-Ref-ID': `invite-${userId}` }, // mirrors the SLA email anti-thread-collapse pattern
  });

  console.log(JSON.stringify({ event: 'user_provisioned', email: row.email, role: row.role, country_code: row.country_code }));
}
```

### Pattern 2: Per-country cutover checklist

**What:** A repeatable, signed-off per-country activation. Same checklist for all 12 active countries.

**When to use:** Every country activation. William signs off the bottom of each before the form-side webhook flips.

**Example skeleton (lives in `docs/CUTOVER.md`):**
```markdown
## <Country> (<CC>) — cutover checklist

- [ ] Contact list confirmed by William (agents + admin emails)
- [ ] `provision-users.ts` run for this country (verify Vercel logs: `event:'user_provisioned'` × N)
- [ ] Smoke test from agent seat: log in → land on `/<cc>/queue` → 0 leads (or seed leads visible)
- [ ] Smoke test from admin seat: log in → land on `/<cc>` → KPIs render zeros
- [ ] Form-side webhook (n8n bridge or direct Path 1) flipped to production HMAC
- [ ] First real lead observed within `agent_today_stats.to_call_count`
- [ ] 24 h soak: zero `event:'audit_write_failed'`, zero `429` from rate-limiter, zero P1/P2 in Sentry
- [ ] William sign-off: <date>
```

### Pattern 3: Coming-soon countries — no schema work in Phase 7

**What:** LS / MW / ZW already exist in `public.countries` with `status='coming_soon'` (Phase 2 migration `00004`). Group views (`group_today_stats`, `country_performance_today`, `leads_by_service_group`) already filter on `status='active'` — verify, don't change.

**When to use:** Phase 7's "coming-soon countries seeded" deliverable is already met by migration `00004`. Phase 7 work is **verification only**: assert the HQ leaderboard renders 12 rows, not 15.

### Pattern 4: Three role-specific one-pagers + a video index

**What:** One short markdown one-pager per role. Each links a 60–90 s "first action" Loom + a 2–4 min "full flow" Loom. In-app, the dashboard shell's existing sidebar gets a `?` icon at the bottom that opens the role's onboarding page.

**When to use:** All three roles. The agent one-pager is the heaviest because the call queue UX has the most moving parts (4 tabs, range picker, inline outcomes). Country admin and HQ admin are lighter — the surfaces are largely read-only with one write action each (reassign / drill-in).

**Format (verified against the search-result best-practice):**
- One-pager: < 1 page printed; sectioned as "What this screen is for" / "First three things to do" / "Common questions" / "Who to ask for help".
- Loom: ≤ 90 s for "First action" (e.g. agent: "How to take your first call"). 2–4 min for "Full flow" (e.g. agent: "Calls → outcomes → callbacks in one minute").
- No PDFs. Markdown rendered in the repo + linked from the in-app sidebar.

### Anti-patterns to avoid

- **Building an in-app invite UI for v1.** Out of scope — one rollout, then retainer adds it if Paratus needs ongoing onboarding.
- **Manual SQL inserts via Supabase Studio.** Bypasses the JWT-hook ordering, leaks credentials into screenshots, no audit trail. The script is the single path.
- **Sending invites via the default Supabase SMTP.** 2/hr ceiling. Will silently fail at scale.
- **Issuing one Loom per page.** Too granular — 30+ videos to maintain. One per role + one "first action" deeplink within each.
- **Transferring Supabase / Vercel ownership *to* DigimountAI before handover.** Already not the case (master account is `para.group.n8n@gmail.com`). Don't undo the Phase 1 architecture.
</architecture_patterns>

<dont_hand_roll>
## Don't Hand-Roll

| Problem | Don't build | Use instead | Why |
|---------|-------------|-------------|-----|
| Sending the invite email | Custom Nodemailer / SES wiring | Existing Resend client + React Email template | Already wired in Phase 6 (06-01); same DKIM/SPF posture; one less moving part |
| Generating the invite token | A homegrown signed-URL scheme | `supabase.auth.admin.generateLink({type:'invite'})` | Issues a real Supabase OTP that the standard `/auth/callback` flow consumes — no parallel auth path |
| Dedupe / idempotency on re-runs | A "did I send this already" tracker | `email_exists` from `createUser` + `upsert` on `user_roles` + reissued link | Both Supabase APIs are idempotency-friendly when used in the right order |
| Coming-soon visibility filter | A new `is_visible` column or migration | Existing `countries.status` enum + `WHERE status='active'` in HQ views (already shipped) | Already shipped — adding a parallel field invites drift |
| Per-tenant feature flag service | LaunchDarkly / ConfigCat / homegrown | The `country_status` enum we already have | Single coming-soon ↔ active transition — a SaaS-grade feature-flag service is overkill |
| Onboarding video hosting | Self-host MP4s on Vercel Blob | Loom share links | We already pay for Loom adjacent in DigimountAI work; Loom handles transcripts + captions for free |
| Runbook from scratch | Write from a blank page | Iterate `docs/RUNBOOK.md` (shipped 06-05) | Already covers infra cheat sheet, on-call contacts, common incidents — Phase 7 adds the cutover/provisioning sections only |

**Key insight:** Phase 7's "boil the ocean" temptation is to build infrastructure for a thing that happens *once*. Don't. The script is fine. The Looms are fine. The Markdown one-pagers are fine. Save the in-app invite UI, the runbook generator, the per-tenant flag service for retainer scope — when there's a recurring need.
</dont_hand_roll>

<common_pitfalls>
## Common Pitfalls

### Pitfall 1: JWT-hook race when user_roles row missing
**What goes wrong:** User clicks the invite email, sets a password, gets bounced to `/unauthorized` because the JWT has `user_role: null` / `country_code: null`.
**Why it happens:** `custom_access_token_hook` runs at JWT-issuance time and reads `public.user_roles`. If the row isn't there yet (because we sent the invite before inserting), the claims are null and middleware doesn't know where to route them.
**How to avoid:** Always sequence `createUser` → `upsert user_roles` → `generateLink + send invite`. Never the reverse. The provisioning script enforces this order.
**Warning signs:** `User logged in but landed on /unauthorized` reports during a cutover; `user_role:null` lines in the JWT decoded from the cookie.

### Pitfall 2: Default SMTP 2/hour rate limit
**What goes wrong:** First 2 invites land, the next 28 silently 429.
**Why it happens:** Supabase's built-in SMTP is **explicitly not for production** — capped at 2 emails/hour to discourage anyone using it past the prototype stage.
**How to avoid:** Configure custom SMTP via Resend before the rollout starts (`Auth → Email → Custom SMTP`). Resend's free tier is 3,000/month — comfortable for the rollout + ongoing SLA email volume. Verify DKIM + SPF + DMARC on the sending domain (the same posture Phase 6 plan 06-01 already established for SLA emails).
**Warning signs:** `429 email rate limit exceeded` in `auth.audit_log_entries` when running a dry run.

### Pitfall 3: Re-invite of an existing user fails
**What goes wrong:** Calling `inviteUserByEmail` a second time (token expired, user lost the email, retry after a corporate-domain bounce) returns `email_exists` / "A user with this email address has already been registered".
**Why it happens:** Open Supabase Auth issue ([#2180](https://github.com/supabase/auth/issues/2180)) — the `/invite` endpoint doesn't re-issue for existing users.
**How to avoid:** Provisioning script always uses `generateLink({type:'invite'})` rather than `inviteUserByEmail`. `generateLink` happily re-issues an OTP for an existing user; we send the resulting URL via Resend ourselves. Tested workaround, not a hack.
**Warning signs:** `email_exists` errors from `createUser` (expected on re-runs — script handles via `listUsers` lookup); "user already registered" from `inviteUserByEmail` (don't use it).

### Pitfall 4: Corporate-domain spam filtering
**What goes wrong:** Invites sent to `@paratus.co.sz`, `@paratus.ke`, `@paratus.co.zm` etc. land in spam or a quarantine inbox the agent never checks.
**Why it happens:** Paratus's corporate Microsoft / Google Workspace tenants apply aggressive filtering on first-time senders. Even with DKIM/SPF/DMARC verified, the first email from a new sender domain can sit in quarantine until an IT admin allow-lists it.
**How to avoid:** Brief William ahead of the rollout — ask Paratus IT to allow-list the sender domain (`@<the-domain-Resend-sends-from>`) before the cutover window. Send a single test invite to William's own corporate inbox 24 h before the rollout to surface filtering early. If filtering is intractable for one country, send invites to a personal email and ask the user to forward themselves a password reset.
**Warning signs:** `delivered: true` in Resend logs but the user reports never receiving anything; bounce reasons containing "550 5.7.1 quarantined" or "spam policy".

### Pitfall 5: Dual-role users (e.g. Martin Cox)
**What goes wrong:** Martin Cox appears in `rollout-contacts.md` under both Group Sales (`country_admin`-ish) and HQ Contacts (`hq_admin`). Our schema constrains exactly one row per user in `user_roles`.
**Why it happens:** `user_roles_user_id_key` UNIQUE constraint (migration `00001`). Real-world usage has dual-role humans; our v1 data model enforces single-role.
**How to avoid:** Resolve with William before provisioning. Two options:
- **Option A (recommended):** assign `hq_admin` (broader read) — covers everything Group Sales needs and avoids a schema change.
- **Option B:** create two separate Supabase users with different emails (e.g. `+hq` Gmail alias) for the two roles. Adds login friction but preserves audit clarity.
- **Option C (defer to retainer):** add a junction `user_role_assignments(user_id, role, country_code)` to support multi-role. Out of v1 scope.
**Warning signs:** Same person appears in two role buckets in `rollout-contacts.md`; William defers the decision past the cutover window.

### Pitfall 6: "Group Sales" doesn't map to the schema
**What goes wrong:** William's contact list has a "Group Sales" bucket (Martin Cox, Thas Pillay, Stephen Petersen) that needs cross-country queue visibility. Our roles are `hq_admin` / `country_admin` / `agent` — no fourth role.
**Why it happens:** Real-world organisational design diverged from our v1 schema (Phase 1).
**How to avoid:** Resolve with William *before* Phase 7 starts. Options:
- **Option A:** Treat them as `hq_admin`s (read-everything, no queue). Cheapest. Lets them see the HQ overview + drill into any country admin surface — no agent queue.
- **Option B:** Provision them as `agent` per country they sell into. Pollutes round-robin assignment.
- **Option C (retainer):** Add a `group_agent` role with a junction table on countries. Schema work.
This is **the #1 thing to clarify with William before user provisioning**.
**Warning signs:** No clear answer from William when asked "which role does Group Sales get?".

### Pitfall 7: Form-side webhook cutover happens before users are provisioned
**What goes wrong:** The webhook starts ingesting real leads for a country, but agents haven't been invited yet — leads pile up unassigned (or misassigned via round-robin to the only seeded test user).
**Why it happens:** The cutover ceremony doesn't pin a strict order.
**How to avoid:** The cutover checklist (Pattern 2) explicitly orders: provision users → smoke test from real seats → THEN flip the webhook. Don't reorder.
**Warning signs:** `assigned_to` is the e2e-test user UUID on the first real production lead.
</common_pitfalls>

<code_examples>
## Code Examples

### Bulk provision skeleton (full sketch in Pattern 1 above)

```typescript
// apps/web/scripts/provision-users.ts — usage: pnpm tsx apps/web/scripts/provision-users.ts
import { parse } from 'csv-parse/sync';
import { readFileSync } from 'node:fs';

const rows = parse(readFileSync('.planning/rollout-contacts.csv', 'utf8'), {
  columns: true,
  skip_empty_lines: true,
});

for (const row of rows) {
  try {
    await provisionOne(row);
  } catch (err) {
    console.error(JSON.stringify({ event: 'user_provision_failed', email: row.email, message: String(err) }));
  }
}
```

### Invite email template (extends Phase 6 pattern)

```tsx
// apps/web/lib/emails/invite.tsx
import { Body, Container, Heading, Html, Link, Preview, Text } from '@react-email/components';
import * as React from 'react';

export function InviteEmail({ fullName, role, actionUrl }: { fullName: string; role: string; actionUrl: string }) {
  return (
    <Html>
      <Preview>You've been invited to Paratus Group Dashboards</Preview>
      <Body style={{ fontFamily: 'system-ui, sans-serif', backgroundColor: '#F8FAFC', padding: 24 }}>
        <Container style={{ backgroundColor: '#FFFFFF', borderRadius: 8, padding: 32, maxWidth: 480 }}>
          <Heading style={{ color: '#2B479B', marginBottom: 16 }}>Welcome, {fullName}</Heading>
          <Text style={{ color: '#0F172A', lineHeight: 1.5 }}>
            Paratus Group has set up a new sales dashboard for you. Click below to set your password
            and log in. Your role: <strong>{role.replace('_', ' ')}</strong>.
          </Text>
          <Link
            href={actionUrl}
            style={{
              display: 'inline-block',
              backgroundColor: '#F7941D',
              color: '#FFFFFF',
              padding: '12px 24px',
              borderRadius: 6,
              textDecoration: 'none',
              marginTop: 16,
              fontWeight: 600,
            }}
          >
            Set up your account
          </Link>
          <Text style={{ color: '#64748B', fontSize: 12, marginTop: 24 }}>
            This link expires in 24 hours. If it expires, ask your country admin to re-invite you.
          </Text>
        </Container>
      </Body>
    </Html>
  );
}
```

### CSV schema (input to the script)

```csv
email,role,country_code,full_name
sandile.masuku@paratus.co.sz,agent,SZ,Sandile Masuku
anele.dlamini@paratus.co.sz,country_admin,SZ,Anele Dlamini
joyce.gachuhi@paratus.ke,country_admin,KE,Joyce Gachuhi
... etc.
```

(Note: schema constraint says HQ admins must have `country_code=NULL`. The CSV uses an empty string for that and the script translates `'' → null`.)
</code_examples>

<sota_updates>
## State of the Art (2026)

| Old approach | Current approach | When changed | Impact |
|--------------|------------------|--------------|--------|
| `inviteUserByEmail` for every invite | `createUser({email_confirm:false}) → upsert user_roles → generateLink + send via Resend` | Mid-2025, after Supabase Auth `/invite` re-invite limitation entrenched in [#2180](https://github.com/supabase/auth/issues/2180) | Three calls instead of one, but bulletproof on re-runs |
| `app_metadata.role` for RBAC | Custom-claim hook reading a `user_roles` table | Phase 1 (already in place) | More flexible — role/country/active are queryable + RLS-able directly |
| Default Supabase SMTP for production | Custom SMTP via Resend (or AWS SES / Postmark / SendGrid / Brevo / ZeptoMail) | Always — Supabase docs explicitly say default is "not meant for production" | We're already on Resend for SLA; one provider config, two use cases |
| Long PDF onboarding decks | Short Loom (60–90 s atomic / 2–4 min flow) + a one-page markdown | 2024+ | Higher retention, easier to update when the UI changes |

**New tools/patterns to consider for retainer:**
- **In-app invite UI** if Paratus adds country admins regularly — wraps `provision-users.ts` behind `/<country>/admin/users`.
- **Per-tenant feature flags** via a `tenant_flags(country_code, feature, enabled)` table if more than one feature ever needs the coming-soon-style staged-launch treatment.

**Deprecated/outdated:**
- **`inviteUserByEmail` as the only invite path** — works on first call but fails on re-invite. Don't rely on it for anything more than a manual one-off.
</sota_updates>

<open_questions>
## Open Questions

These need a decision *before* the provisioning script runs. They're all on William.

1. **Group Sales role assignment (Martin Cox / Thas Pillay / Stephen Petersen)** — `hq_admin` (read-everything, no queue) or per-country `agent`? Recommended: `hq_admin`. Schema constraint forces this decision before any provisioning.
2. **Martin Cox dual-role** (`hq_admin` AND Group Sales) — pick one or use a Gmail-alias workaround. Recommended: pure `hq_admin` covers both reads.
3. **Eswatini admin (Anele Dlamini)** — confirmed `country_admin` + queue access? Or `country_admin`-only?
4. **Kenya admin (Joyce Gachuhi)** — same question.
5. **10 missing active countries** — full sales + admin contact lists per country. Pilot is Mozambique (urgent).
6. **Pilot ingestion path** — Path 1 (Paratus form direct webhook) or Path 2 (n8n bridge)? Phase 6 plan 06-05 documents both; Phase 7 needs the actual decision per country before flipping.
7. **HQ org transfer recipient** — who at Paratus / Brainstorm Projects gets Owner on the Supabase org? William, a Paratus IT lead, or both?
8. **Loom hosting account** — record under DigimountAI's Loom or set up `para.group.n8n@gmail.com`'s? Recommended: the master account, so Loom links survive an eventual full agency-out handover.

Recommendation: send a single email to William with these eight questions before the plan-phase step. If we plan with the answers in hand, the plan can be tighter.
</open_questions>

<sources>
## Sources

### Primary (HIGH confidence)
- [`/supabase/supabase` Context7 docs](https://github.com/supabase/supabase) — `auth.admin.createUser`, `app_metadata` vs `user_metadata`, custom-claim patterns
- [Supabase Auth: `inviteUserByEmail` reference](https://supabase.com/docs/reference/javascript/auth-admin-inviteuserbyemail)
- [Supabase Auth: `generateLink` reference](https://supabase.com/docs/reference/javascript/auth-admin-generatelink)
- [Supabase Auth: `createUser` reference](https://supabase.com/docs/reference/javascript/auth-admin-createuser)
- [Supabase Auth rate limits guide](https://supabase.com/docs/guides/auth/rate-limits) — default 2/hr, custom SMTP starts at 30/hr
- [Supabase custom SMTP guide](https://supabase.com/docs/guides/auth/auth-smtp) — six recommended providers; production SMTP is required, not optional
- [Resend × Supabase integration](https://resend.com/supabase) — DKIM/SPF/DMARC posture for production deliverability
- [Supabase platform access control](https://supabase.com/docs/guides/platform/access-control) — Owner/Admin/Developer roles, organization ownership rules
- [Vercel: How do I transfer ownership of a team](https://vercel.com/kb/guide/how-do-i-transfer-ownership-of-a-vercel-team) — confirms the *invite-the-client-as-Owner-then-leave* ceremony
- Local repo: `packages/supabase/migrations/00001_rbac_schema.sql` — JWT hook reads from `user_roles`, NOT `app_metadata`. The single most important constraint on the provisioning order.
- Local repo: `packages/supabase/migrations/00004_reference_data.sql` — confirms `country_status` enum + LS/MW/ZW already seeded as `coming_soon`.
- Local repo: `docs/RUNBOOK.md` — already covers infra cheat sheet + on-call. Phase 7 extends it, doesn't replace it.

### Secondary (MEDIUM confidence — verified against primary)
- [Supabase Auth issue #2180](https://github.com/supabase/auth/issues/2180) — confirms re-invite-of-existing-user is broken; cross-checked against the official `inviteUserByEmail` doc which doesn't acknowledge it.
- [GitHub Supabase issue #15804](https://github.com/supabase/supabase/issues/15804) — anecdotal evidence of email-rate-limit being triggered on default SMTP at low volumes.
- [Vidyard customer onboarding videos guide](https://www.vidyard.com/blog/customer-onboarding-videos/) and [SundaySky sales onboarding video best practices](https://sundaysky.com/blog/video-onboarding-sales-reps/) — converged on the 60–90 s atomic / 2–4 min workflow split.

### Tertiary (LOW confidence — informed but not load-bearing)
- General multi-tenant feature-flag articles (LaunchDarkly / ConfigCat / WorkOS guides) — confirm the existing `country_status` enum is a reasonable per-tenant flag for a single transition, not requiring a feature-flag service.
- General SaaS handover/offboarding guides — informed the cutover/handover sections, but the project's specific architecture (master Google account already owns infra) makes most generic advice not load-bearing.
</sources>

<metadata>
## Metadata

**Research scope:**
- Core technical thread: Supabase Auth admin API for bulk user provisioning (createUser + generateLink + Resend SMTP)
- JWT hook interaction with provisioning order
- Coming-soon country flag verification (already shipped)
- Onboarding documentation format (Loom + markdown one-pager)
- Handover ceremony specifics (Supabase + Vercel + GitHub) given Paratus already owns infrastructure

**Confidence breakdown:**
- Auth admin API: HIGH — verified via Context7 + official docs + cross-checked against the Phase 1 JWT-hook source
- Rate limits + SMTP: HIGH — verified against official Supabase docs (2/hr default, 30/hr custom starting tier)
- Re-invite limitation: HIGH — confirmed via the open GitHub issue + the documented behaviour
- Coming-soon countries: HIGH — verified directly in `00004_reference_data.sql`
- Onboarding format: MEDIUM — based on industry best practice; the actual recordings are project-specific work and won't be validated until they ship
- Handover specifics: MEDIUM — Supabase / Vercel ownership transfer mechanics confirmed, but the exact Paratus IT contact + GitHub org timing are open with William

**Research date:** 2026-05-05
**Valid until:** 2026-08-05 (3 months — Supabase Auth admin API is stable; if the rollout slips past August, re-verify rate limits and the re-invite issue status before running)

---

*Phase: 07-rollout*
*Research completed: 2026-05-05*
*Ready for planning: yes — but the eight open questions for William should land before `/gsd:plan-phase 7` to keep the plan tight.*
</metadata>
