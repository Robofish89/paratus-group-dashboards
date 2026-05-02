# Paratus Group Dashboards — Build

## What This Is

A multi-tenant Next.js + Supabase dashboard system for **Paratus Group** (standalone — NOT Paratus Namibia, NOT a Paratus Africa internal tool). Spans 12 active African countries (15 once coming-soon countries activate) with three role-based views: HQ Overview, Country Admin, Sales Rep Call Queue. Built to collapse Paratus's 47-hour average lead response time into minutes by surfacing every new lead in a real-time prioritised queue with full outcome capture.

All infrastructure (Supabase, Vercel, n8n, GitHub, domain) sits under a dedicated **Paratus Group Google account** that the user is creating — not under DigimountAI's existing accounts.

Visual design is inherited from the AMA / AMA Care dashboards purely for brand congruence; data, auth, billing, and ownership are independent.

This is the **build** project. The companion repo `paratus-hq-dashboards` holds the approved quote/proposal (live deploy site) — do not touch from here.

## Core Value

10× pipeline efficiency for Paratus without hiring more sales staff. First-ever group-wide visibility across 13 markets. Sub-5-minute lead response becomes the new normal.

## Requirements

### Validated

- Quote and scope signed off (R30,000 build + R2,500/mo retainer)
- Visual direction signed off (mockups in `docs/design-reference/`)
- Architecture: single Next.js app, single Supabase project, RLS multi-tenancy, Vercel deploy
- Brand congruence with AMA / AMA Care dashboards is required
- **Phase 1 — Foundation:** Next.js app scaffolded, design system wired, auth + role routing live, RBAC migration applied, Vercel deploy serving from `main`. Validated 2026-04-28 against `https://paratus-group-dashboards.vercel.app`: all three test users land on the right route, cross-tenant access blocked, full security header set present, `/api/health` returning 200 with commit SHA.
- **Phase 2 — Data Model & Ingestion:** Migrations 00003–00008 live on Supabase project `tgswsdfaszvztbpczfve`; `leads`/`lead_events`/`callbacks` shipped with country-scoped RLS + five `security_invoker` views; `ingest_lead(jsonb)` RPC routes through `assign_lead` (round-robin with `FOR UPDATE SKIP LOCKED`) for atomic insert + assign + event log; webhook ingest at `/api/leads/ingest` (HMAC + Zod) and CSV importer at `/api/leads/import-csv` (multipart, country-locked for non-HQ admins) both live in production; realtime Broadcast-from-Database triggers push every assigned lead to private `agent:<uid>` and `country:<code>` channels with RLS on `realtime.messages`. Validated 2026-05-01 by `apps/web/tests/` integration suite: 9/9 green across 3 files (cross-tenant RLS = 0 rows, idempotency same `lead_id`, broadcast within 5 s).
- **Phase 3 — Sales Rep Queue:** Migrations 00009 + 00010 live on `tgswsdfaszvztbpczfve`; five queue RPCs (`mark_lead_contacted`, `complete_call`, `schedule_callback`, `record_no_answer`, `agent_stats_in_range`) plus the `agent_today_stats` view (v2) — all SECURITY DEFINER with `auth.uid() = leads.assigned_to` + `country_code` JWT guards inside the function. Agent surface at `/[country]/queue` ships a 4-tab UI (To Call / Follow-ups / Converted / Lost) with inline state-aware card actions — no modal anywhere, no dead buttons on terminal leads. URL-stateful date range picker (`?range=today|week|month|custom`) drives the Converted/Lost tile counts via the `agent_stats_in_range` RPC; live tiles drive the To Call / Follow-ups counts via the view. Soft-no-answer flow: 3+ unanswered calls move the card to Follow-ups but never auto-flip status. Sales-pipeline jargon collapsed — UI label "Converted" maps to DB `status='converted'`; the `lead_events.outcome='won'` enum value is preserved for analytics back-compat. Two production bugs from the plan-03-03 modal phase fixed at the DB layer (done_today double-count + dead-button on terminal leads). Validated 2026-05-02 by `apps/web/tests/queue.rpcs.test.ts` (17 vitest assertions green, 4 new) and `apps/web/e2e/sales-rep-golden-path.spec.ts` (3 Playwright tests green: Converted golden path, no-answer 3× → Follow-ups, tab vocabulary).

### Active (current phase)
- [ ] **Phase 4 — Country Admin Dashboard (next):** KPIs, pipeline funnel, speed-to-lead chart, agent performance, lead list with reassignment
- [ ] **Phase 5 — HQ Overview:** group KPIs, country leaderboard, group pipeline, drill-in
- [ ] **Phase 6 — Production Hardening:** real form ingestion (pilot country), SLA alerts, audit log, security pass, perf budget
- [ ] **Phase 7 — Rollout:** all 13 countries provisioned, onboarding docs, cutover plans

### Out of Scope (this engagement)

- Agent gamification (badges, streaks) — retainer phase
- AI lead scoring — retainer phase
- WhatsApp / SMS auto-acknowledgement — retainer phase
- AI call-note summarisation — retainer phase
- Self-serve form/funnel addition — retainer phase
- Customer-facing portal — never

## Context

- **Client:** Paratus Africa Group — pan-African telecom/ISP, 13+ countries
- **Middleman:** William @ Brainstorm Projects
- **Provider:** DigimountAI (footnote on deliverables)
- **Existing relationship:** Multiple delivered projects (kiosk lead automation, WhatsApp AI agent, social sponsor bot, statistics automation)
- **12 Active countries (v1):** Angola, Botswana, DRC, Eswatini, Kenya, Mozambique, Namibia, Rwanda, South Africa, Tanzania, Uganda, Zambia
- **3 Coming-soon countries:** Lesotho, Malawi, Zimbabwe (data model + flag in place at launch; dashboards activated via retainer when Paratus signals ready)
- **10 Form/Service types:** General Contact, Carrier Services, Satellite, Data Centers, Broadband, OneWeb, Starlink, Essential Access, Connect2Care, Starlink for Schools
- **Current state of leads:** 7+ disconnected Google Sheets, manual triage by email per country per service. No unified view, no SLA tracking.
- **Speed-to-lead data:** Industry — respond in 5 mins = 10× conversion. Paratus current = ~47 hrs.
- **Design reference:** AMA project at `~/Projects/ama-amacare-stats-callback-dashboard` — mirror its design system for visual congruence.
- **Visual contract:** approved mockups in `docs/design-reference/` (HQ, country-admin, sales-rep). User has been burned before when shown mockups didn't match what got built — fidelity is a hard requirement.

## Constraints

- **Design:** Must match AMA design system (theme tokens, components, layouts) for brand congruence across all Paratus properties
- **Stack:** Next.js 16 + Supabase + Vercel (locked from quote)
- **Architecture:** Single Next.js app under `apps/web` with role-grouped routes; single Supabase project with RLS multi-tenancy by `country_code`
- **Timeline:** 4–6 weeks from kick-off to all-12-countries-live (+3 coming-soon flagged)
- **Budget:** R30,000 fixed-price build, R2,500/mo ongoing retainer
- **Security:** RLS on every table from migration 001; cross-country leakage is a hard fail; HMAC + shared secret on lead ingest webhook
- **Quality bar — Boil the Ocean:** No phase ships with TODOs, half-wired features, missing tests, missing docs, or known broken paths. The target reaction is "holy shit, that's done" — not "yeah, looks fine." See `CLAUDE.md` § "The Standard — Boil the Ocean" for the full standard and operational rules.

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Single Next.js app (not three) | Same org, three roles — simpler deploy, simpler middleware, reuse one design system bundle | ✅ Locked |
| Single Supabase project, multi-tenant via RLS | Cheaper, easier to maintain, one source of truth for cross-country views | ✅ Locked |
| Mirror AMA design system wholesale | Brand congruence + saves weeks of design work | ✅ Locked |
| GSD framework with `mode: yolo`, gates off | User's standard for solo-builder velocity | ✅ Locked |
| New repo `paratus-group-dashboards` (not in proposal repo) | Protects live proposal site; clean separation build vs. quote | ✅ Locked |
| English-only UI for v1 | French/Portuguese is a phase-future ask | ✅ Locked |
| Pilot country = Mozambique (default) | Mid-volume, multiple form types, English-friendly admin | -- Pending William confirm |
| Coming-soon strategy: Lesotho / Malawi / Zimbabwe seeded as `status='coming_soon'` at v1 launch | Avoids polluting group KPIs; one-flag flip when Paratus is ready; covered by retainer | ✅ Locked |
| Master account = dedicated Paratus Group Google account (user creating) | Clean ownership boundary, easy handover, isolates from DigimountAI's other clients | ✅ Locked |

## Companion Docs

- `PRD/` — full product requirements (overview, features, user-flows, data-model, lead-ingestion, technical, milestones, open-questions)
- `STYLE_GUIDE.md` — design tokens + components
- `CLAUDE.md` — project-specific guidance for AI sessions
- `SECURITY_CHECKLIST.md` — RLS + deployment hard gates
- `CREDENTIALS.md` — services + env vars (no secrets)
- `roadmap.md` (this folder) — phase breakdown

---
*Last updated: 2026-05-02 — Phase 3 (Sales Rep Queue) closed; agent surface live with 4-tab queue, inline outcome capture, URL-stateful date range, modal-free; vitest 17/17 + Playwright 3/3 green.*
