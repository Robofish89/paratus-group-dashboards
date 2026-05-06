# Phase 7: User Setup Required

**Generated:** 2026-05-05 (plan 07-03, scaffold-only mode)
**Phase:** 07-rollout
**Status:** Scaffold staged — waiting on William for live cutover ceremony

This file is the live cutover playbook for the Mozambique pilot (and the
template plan 07-04 reuses for the remaining 11 active countries). Every
checklist below is **UNTICKED** by design — none of the production-side
work has been executed in this scaffold pass. The five sections below
gate the cutover; nothing in plan 07-03 advances past Section 5 until
Sections 1–4 are signed off.

---

## 1. Open question answers from William (Q1–Q8)

**Resolved:** 2026-05-05 (resume bookmark from prior session in `.planning/STATE.md`).
**Resolution mode:** scaffold-only — Q1–Q5 deferred awaiting William's contact list; Q6–Q8 locked at recommended defaults.

The eight questions originate in `.planning/phases/07-rollout/07-RESEARCH.md` "Open Questions" section. Verbatim resolutions:

### Q1 — Group Sales role assignment (Martin Cox / Thas Pillay / Stephen Petersen)

**Resolution:** **DEFERRED — awaiting William's contact list (date received: TBD).** Default assumption stands: `hq_admin` (read-everything, no queue). Will be confirmed when contact list arrives; CSV row shape preserved for either path (per-country `agent` rows would replace the HQ-admin rows wholesale).

### Q2 — Martin Cox dual-role (`hq_admin` AND Group Sales)

**Resolution:** **DEFERRED — awaiting William's contact list (date received: TBD).** Default assumption stands: pure `hq_admin` covers both reads (research recommendation). One `auth.users` row, one `user_roles` row, no `+hq` Gmail-alias workaround needed.

### Q3 — Eswatini admin (Anele Dlamini)

**Resolution:** **DEFERRED — awaiting William's contact list (date received: TBD).** Default assumption stands: `country_admin` for SZ. Queue access via separate seat if William wants it later (would mean a second `auth.users` row with role=`agent`, country=`SZ`).

### Q4 — Kenya admin (Joyce Gachuhi)

**Resolution:** **DEFERRED — awaiting William's contact list (date received: TBD).** Default assumption stands: `country_admin` for KE. Same posture as Q3.

### Q5 — 10 missing active countries (full sales + admin contact lists per country)

**Resolution:** **DEFERRED — awaiting William's contact list (date received: TBD).** Pilot is Mozambique only; the other 10 countries ride plan 07-04. The CSV (`/.planning/rollout-contacts.csv`) is staged with header + commented examples ready to receive real rows when William delivers them.

### Q6 — Pilot ingestion path for Mozambique

**Resolution:** **LOCKED — Path 2 (n8n bridge).** Existing Sheets/email flows fan out to `https://paratus-group-dashboards.vercel.app/api/leads/ingest` with the production HMAC secret. Lower change cost than asking Paratus IT to wire a direct webhook on day one; revisit per-country during 07-04 if specific country teams want Path 1.

### Q7 — HQ org transfer recipients

**Resolution:** **LOCKED — William as Supabase Owner; William + Paratus IT lead as Vercel Members + GitHub Members.** The master Google account (`para.group.n8n@gmail.com`) retains primary ownership across all three platforms; client gets the seat shapes that let them operate without DigimountAI in the loop. Full handover ceremony lands in plan 07-04.

### Q8 — Loom hosting account

**Resolution:** **LOCKED — `para.group.n8n@gmail.com` (master account).** Survives an eventual full agency-out handover. Loom links in `docs/onboarding/loom-links.md` continue to resolve when DigimountAI is no longer in the picture.

---

## 2. Supabase Auth SMTP wiring (Resend) — UNTICKED

**Why this gate exists:** Supabase's default SMTP is **2 messages/hour**, custom SMTP starts at **30/hour**. We have 30+ users to invite over the rollout. Without custom SMTP wired before any production-bound auth email (password reset, email change, magic link), the rollout's first password-reset traffic 429s after two attempts.

The provisioning script (`apps/web/scripts/provision-users.ts`) sends invites via Resend directly — the SMTP gate matters for *post-invite* auth flows (password reset, email change), not the invite send itself. Both paths need to work before the pilot can soak.

**Source values:** Reuse the Resend API key already in Vercel for SLA emails (Phase 6 plan 06-01). Same DKIM/SPF/DMARC posture; one verified domain serves both flows.

### Dashboard checklist (DO NOT EXECUTE — needs William present)

- [ ] **Configure custom SMTP in Supabase Auth**
  - Location: Supabase Dashboard → Project `tgswsdfaszvztbpczfve` → Auth → Settings → SMTP Settings
  - Host: `smtp.resend.com`
  - Port: `465` (SSL) or `587` (STARTTLS)
  - Username: `resend`
  - Password: `<RESEND_API_KEY>` (the same key already in Vercel for SLA emails)
  - Sender email: same as `SLA_ALERT_FROM_EMAIL`
  - Sender name: `Paratus Group Dashboards`
  - Save → click "Send test email" to your own inbox to verify deliverability.

- [ ] **Add accept-invite redirect URL to Auth allow-list**
  - Location: Supabase Dashboard → Auth → URL Configuration → Redirect URLs
  - Add: `https://paratus-group-dashboards.vercel.app/auth/accept-invite`
  - Preview deploys already use the wildcard from Phase 1.

### Verification (run after live wiring)

- [ ] Trigger `supabase.auth.resetPasswordForEmail(<your-test-email>)` from the local dev box.
- [ ] Assert the email lands in inbox-not-spam.
- [ ] Assert delivery within 30 s.
- [ ] Assert from-address matches `SLA_ALERT_FROM_EMAIL`.

---

## 3. GitHub `paratusgroup` org creation — UNTICKED

**Why this gate exists:** Repo handover (plan 07-04) requires a destination GitHub org under the master Google account so we can transfer ownership without losing CI/CD or Vercel-GitHub integration. Created here, the repo transfer happens in plan 07-04.

### Dashboard checklist (DO NOT EXECUTE — needs William present)

- [ ] **Create the `paratusgroup` org**
  - URL: <https://github.com/account/organizations/new>
  - Plan: Free
  - Owner: `para.group.n8n@gmail.com`
  - Name: `paratusgroup`
  - Skip if the org already exists under that account.

- [ ] Adding William or a Paratus IT contact as Owner is a plan 07-04 task — the org just needs to exist now.

### Verification (run after live creation)

- [ ] `gh auth refresh -s admin:org` — re-auth GitHub CLI with org admin scope.
- [ ] `gh org list` — confirm `paratusgroup` appears in the output.

---

## 4. Vercel production env-vars carry-over from Phase 6 — UNTICKED

**Why this gate exists:** Phase 6 introduced 11 production env vars across five services (Upstash, IP-hash salt, Resend, Sentry × 5). They have to be live in Vercel Production + Preview before plan 07-03's pilot soak — the SLA cron, audit log, rate limiter, and Sentry source-map upload all gate on them. Each row is a single "verified-in-Vercel" checkbox; full descriptions, source-of-value, and rotation runbooks live in `06-USER-SETUP.md` (single source of truth — do NOT duplicate descriptions here).

> **Note on count:** prior Phase 7 docs reference "13 missing env vars". The actual carry-over checklist in `06-USER-SETUP.md` enumerates 11 net-new vars (the Upstash pair + IP-hash salt + Resend triple + Sentry quintuple). `PARATUS_INGEST_SECRET` is Phase 2 (already ticked in `02-USER-SETUP.md`), and `INVITE_FROM_EMAIL` is an *optional* override introduced by plan 07-01 (falls back to `SLA_ALERT_FROM_EMAIL`). Confirm those two with William alongside the 11 if the "13" framing is load-bearing for him.

### Carry-over checklist

| Status | Variable | Source-of-truth |
|--------|----------|-----------------|
| [ ] | `UPSTASH_REDIS_REST_URL` | `06-USER-SETUP.md` § 1 |
| [ ] | `UPSTASH_REDIS_REST_TOKEN` | `06-USER-SETUP.md` § 1 |
| [ ] | `IP_HASH_SALT` | `06-USER-SETUP.md` § 2 |
| [ ] | `RESEND_API_KEY` | `06-USER-SETUP.md` § 3 |
| [ ] | `SLA_ALERT_FROM_EMAIL` | `06-USER-SETUP.md` § 3 |
| [ ] | `CRON_SECRET` | `06-USER-SETUP.md` § 3 |
| [ ] | `NEXT_PUBLIC_SENTRY_DSN` | `06-USER-SETUP.md` § 4 |
| [ ] | `SENTRY_DSN` | `06-USER-SETUP.md` § 4 |
| [ ] | `SENTRY_AUTH_TOKEN` | `06-USER-SETUP.md` § 4 (Vercel **Build** scope, not runtime) |
| [ ] | `SENTRY_ORG` | `06-USER-SETUP.md` § 4 |
| [ ] | `SENTRY_PROJECT` | `06-USER-SETUP.md` § 4 |

### Optional / already-set (do not block on)

| Status | Variable | Notes |
|--------|----------|-------|
| (already set in Vercel) | `PARATUS_INGEST_SECRET` | Phase 2 — see `02-USER-SETUP.md`. Confirm value still present + Sensitive. |
| [ ] | `INVITE_FROM_EMAIL` | Plan 07-01 — *optional* override of `SLA_ALERT_FROM_EMAIL`. Set only if William wants `welcome@` vs `alerts@` segmentation. |

### Verification (run after Vercel population)

- [ ] `vercel env ls production` — confirm every required variable appears with the expected scope (Sensitive flags per `06-USER-SETUP.md`).
- [ ] Trigger a redeploy; confirm the build-time vars (`SENTRY_AUTH_TOKEN`, source-map upload) flow through without errors.

---

## 5. Pilot decisions log

| Decision | Value | Locked by | Locked at |
|----------|-------|-----------|-----------|
| Pilot country | **Mozambique (MZ)** | William (carried from Phase 6 plan 06-05 + reconfirmed 2026-05-05) | 2026-05-05 |
| Ingestion path | **Path 2 — n8n bridge** | Q6 default — William implicit acceptance via "scaffold-only, leave space for users" | 2026-05-05 |
| HQ-org seat policy | **William as Supabase Owner; William + Paratus IT lead as Vercel + GitHub Members** | Q7 default | 2026-05-05 |
| Loom hosting | **`para.group.n8n@gmail.com` master account** | Q8 default | 2026-05-05 |
| First-lead-time observation | **Awaiting cutover** — recorded at the live ceremony, fed into 07-03 SUMMARY post-cutover | n/a | n/a |

### Open observations to record post-cutover

- [ ] First real lead timestamp (form submission → `agent_today_stats.to_call_count` bump)
- [ ] First-lead time-to-realtime arrival (delta between Resend invite delivered and the lead landing in the agent's queue)
- [ ] Any Resend bounce / corporate-domain quarantine (07-RESEARCH pitfall 4) — log domain + remedy
- [ ] Any cross-tenant leak observed in the smoke-test (should be zero — RLS + middleware are belt-and-braces)

---

**Once all checklist items above are ticked AND the cutover ceremony with William has run cleanly:** mark status as "Complete" at the top, update `.planning/phases/07-rollout/07-03-SUMMARY.md` with the live observations, and tick items 1–8 of `docs/CUTOVER.md` Mozambique section. The remaining items (9–11) close out in plan 07-04 at T+24-48h.
