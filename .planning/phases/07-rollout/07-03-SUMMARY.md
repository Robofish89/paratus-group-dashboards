---
phase: 07-rollout
plan: 03
subsystem: rollout
tags: [pilot, mozambique, supabase-auth, smtp, github-org, scaffold]

requires:
  - phase: 07-rollout
    provides: provision-users.ts script (07-01), CUTOVER.md + onboarding docs (07-02)
provides:
  - Q1-Q8 resolutions captured verbatim in 07-USER-SETUP.md
  - .gitignore negation for rollout-contacts.csv.example
  - Local rollout-contacts.csv with header + commented examples (no PII)
  - Four staged checklists for live cutover ceremony (SMTP / GitHub org / 11 env vars / pilot decisions)
affects: [07-04, milestone-1-handover]

tech-stack:
  added: []
  patterns:
    - "Scaffold-only checkpoint: capture decisions + stage checklists; gate live actions on William present"

key-files:
  created:
    - .planning/phases/07-rollout/07-USER-SETUP.md
    - .planning/rollout-contacts.csv (local-only, gitignored)
    - .planning/phases/07-rollout/07-03-SUMMARY.md
  modified:
    - .gitignore (negation for rollout-contacts.csv.example)

key-decisions:
  - "Q1-Q5 deferred — defaults stand awaiting William's contact list"
  - "Q6 = Path 2 (n8n bridge) for MZ pilot ingestion"
  - "Q7 = William as Supabase Owner; William + Paratus IT lead as Vercel + GitHub Members"
  - "Q8 = para.group.n8n@gmail.com owns Loom training videos"
  - "07-USER-SETUP.md count discrepancy: Phase 7 docs say '13 missing env vars'; 06-USER-SETUP.md tables list 11 (the Upstash pair + IP_HASH_SALT + Resend triple + Sentry quintuple). Documented honestly with PARATUS_INGEST_SECRET (Phase 2) + INVITE_FROM_EMAIL (07-01 optional) called out separately."

patterns-established:
  - "Scaffold-only resume: decision-checkpoint resolutions captured verbatim with date + 'deferred — awaiting <input>' format for deferred items"
  - "Live cutover gate: every checklist UNTICKED until ceremony runs; per-section verification steps stay in the scaffold rather than the SUMMARY"

duration: 18min
completed: 2026-05-05
---

# Plan 07-03 — Pilot cutover scaffold — SUMMARY

**Scaffold-only close: Q1–Q8 resolutions captured, 07-USER-SETUP.md staged with 4 untickled checklists, rollout-contacts.csv seeded locally (gitignored, no PII). Live cutover ceremony deferred to next session with William present.**

## Performance

- **Duration:** ~18 min
- **Started:** 2026-05-05 (resume from prior-session bookmark)
- **Completed:** 2026-05-05
- **Tasks:** 4 atomic commits + this SUMMARY/STATE close
- **Files modified:** 4 (`.gitignore` + `07-USER-SETUP.md` + local `rollout-contacts.csv` + `07-03-SUMMARY.md`)

## Accomplishments

- Captured William's resume-bookmark resolutions for the 8 open questions verbatim in `07-USER-SETUP.md`. Q1–Q5 marked `deferred — awaiting William's contact list (date received: TBD)`; Q6–Q8 locked at recommended defaults.
- `.gitignore` now has the `!.planning/rollout-contacts.csv.example` negation (line 51) — schema example stays committed, real PII CSV stays out of git.
- Created `.planning/rollout-contacts.csv` locally with header row + commented per-country example shapes (no real PII). `git status` confirms it does not appear as untracked.
- Built `.planning/phases/07-rollout/07-USER-SETUP.md` mirroring the Phase 6 user-setup shape: 5 sections (Q1–Q8 answers, Supabase SMTP wiring, GitHub org creation, Vercel env-vars carry-over, pilot decisions log). Every checkbox is UNTICKED — nothing was executed against production.
- Honest count-discrepancy footnote: prior Phase 7 docs say "13 missing env vars"; the actual `06-USER-SETUP.md` tables enumerate 11. The other two (`PARATUS_INGEST_SECRET` already-set Phase 2; `INVITE_FROM_EMAIL` optional 07-01 override) are called out separately so William can confirm without count-confusion at the cutover.

## Task Commits

Each scaffold step committed atomically:

1. **Step 2: gitignore negation** — `e733722` (chore)
2. **Step 4: 07-USER-SETUP.md scaffold** — `a6718ab` (docs)
3. **Step 3: rollout-contacts.csv seeded locally** — *no commit* (gitignored by design — local artifact only)
4. **Plan close: SUMMARY + STATE update** — final commit (docs)

_Note: Step 3's CSV is intentionally not committed; the gitignore is the contract. `git check-ignore -v` was the verification._

## Files Created/Modified

- `.gitignore` — added `!.planning/rollout-contacts.csv.example` negation
- `.planning/phases/07-rollout/07-USER-SETUP.md` — NEW, 5-section live-cutover playbook (all checkboxes untickled)
- `.planning/rollout-contacts.csv` — NEW, local-only, gitignored. Header row + commented examples.
- `.planning/phases/07-rollout/07-03-SUMMARY.md` — NEW (this file)
- `.planning/STATE.md` — MOD, plan tracker entry updated, resume bookmark refreshed

## Decisions Made

### Scaffold-only mode resolution recorded verbatim

User resolved the Task 1 decision checkpoint as **"scaffold-only, leave space for users"**. That means:
- Q1–Q5: defer (CSV stays empty of real PII; defaults stand for shape-of-rows when contact list arrives)
- Q6: Path 2 — n8n bridge — locked
- Q7: William as Supabase Owner; William + Paratus IT lead as Vercel + GitHub Members — locked
- Q8: `para.group.n8n@gmail.com` owns Loom training — locked

### Count-discrepancy framing

Phase 7 plan + state docs reference "13 missing env vars". Source-of-truth `06-USER-SETUP.md` tables enumerate 11. Rather than invent two extra rows or silently mismatch the upstream count, the carry-over section in `07-USER-SETUP.md` calls out the discrepancy: 11 in the main table + a "do not block on" subsection covering `PARATUS_INGEST_SECRET` (already set Phase 2) and `INVITE_FROM_EMAIL` (optional 07-01 override). The cutover ceremony can confirm both alongside the 11 if William wants the "13" framing closed precisely.

## Deviations from Plan

**The plan called for full execution; the directive narrowed scope to scaffold-only.** That's not a deviation from the directive (which is what we executed against), but it IS a deviation from the original `07-03-PLAN.md`. Recording for clarity:

- **Skipped:** Resend-as-Auth-SMTP wiring (`Supabase Dashboard → Auth → Settings → SMTP Settings`)
- **Skipped:** Accept-invite redirect URL whitelist (`Supabase Dashboard → Auth → URL Configuration`)
- **Skipped:** `paratusgroup` GitHub org creation
- **Skipped:** `npx tsx apps/web/scripts/provision-users.ts --country=MZ ...` against production Supabase
- **Skipped:** Form-side webhook flip for Mozambique
- **Skipped:** Agent + country-admin seat smoke tests
- **Skipped:** First real-lead observation
- **Skipped:** Ticking items 1–8 of `docs/CUTOVER.md` Mozambique section

All eight of the above are blocked on **William present in real-time** for the cutover ceremony. They are individually checkboxed in `07-USER-SETUP.md` so the next session re-enters cleanly.

## Issues Encountered

None — every step in the scaffold-only directive landed on first attempt.

## User Setup Required

**External services require manual configuration AND a live cutover ceremony with William.** See [07-USER-SETUP.md](./07-USER-SETUP.md) for:

- Q1–Q8 resolutions (already captured)
- Resend-as-Auth-SMTP wiring checklist (untickled)
- GitHub `paratusgroup` org creation checklist (untickled)
- 11 Phase-6 carry-over env vars + 2 optional/already-set (untickled)
- Pilot decisions log + post-cutover observation slots (untickled)

## Next checkpoint — ready for live cutover ceremony

The scaffold is complete. The next checkpoint is the **live Mozambique cutover ceremony**, which requires William present. Re-enter via `/gsd:execute-phase 7` (or directly `/gsd:execute-plan 07-03`); the orchestrator will detect this SUMMARY at the scaffold boundary and route to the live-cutover phase.

### Inputs needed from William before live run

- **Real Mozambique contact list** — minimum 3 rows: 1 country admin + ≥2 agents. Domain shape (`@paratus.co.mz` vs personal addresses) flagged so we can pre-warn Paratus IT about corporate-domain quarantine (07-RESEARCH pitfall 4).
- **Confirmation on Q1–Q5 defaults** — Group Sales as `hq_admin` (Martin Cox / Thas Pillay / Stephen Petersen), Anele Dlamini = SZ `country_admin`, Joyce Gachuhi = KE `country_admin`. Either approve verbatim or surface the divergent answer per-question.
- **Live cutover ceremony time slot** — ~30 min synchronous. Steps run in this order, no skips: SMTP wiring → redirect URL whitelist → GitHub org create → 11 env vars confirmed in Vercel → `provision-users.ts --country=MZ` live run → agent seat smoke test → admin seat smoke test → cross-tenant smoke test → form-side webhook flip → first-lead observation. Deferred to plan 07-04: 24–48 h soak validation + sign-off + remaining 11 countries.

### Real-production actions deferred (next session)

- Wire Resend as Supabase Auth SMTP (replaces the 2/hr default ceiling)
- Whitelist `https://paratus-group-dashboards.vercel.app/auth/accept-invite` in Supabase Auth Redirect URLs
- Create the `paratusgroup` GitHub org under `para.group.n8n@gmail.com`
- Confirm 11 Phase-6 carry-over env vars in Vercel Production + Preview (per scopes documented in `06-USER-SETUP.md`)
- Run `npx tsx apps/web/scripts/provision-users.ts --country=MZ .planning/rollout-contacts.csv` against production Supabase (after William provides real MZ rows in the gitignored CSV)
- Smoke-test agent + country-admin seats end-to-end (welcome email → set password → reach `/<mz-slug>/queue` and `/<mz-slug>` overview respectively)
- Cross-tenant smoke test from country-admin seat (attempt to open another country's slug; assert 403)
- Flip form-side ingestion path (n8n workflow activation per Q6 = Path 2)
- Wait for first real lead; observe arrival in `agent_today_stats.to_call_count` via realtime broadcast
- Tick items 1–8 of `docs/CUTOVER.md` Mozambique section as each step lands

### Plan 07-04 readiness

- **Blocked** until the Mozambique live cutover above runs cleanly. 07-04 inherits:
  - Mozambique soak start time (T+0)
  - The provisioning cadence (`--country=<CC>` per remaining country)
  - The `paratusgroup` GitHub org as the destination for the repo transfer
  - The Resend-as-Auth-SMTP posture for all subsequent country password resets

---

*Phase: 07-rollout*
*Plan: 03 (scaffold-only mode)*
*Completed: 2026-05-05*
