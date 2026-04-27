# Milestones

Phased delivery. Maps 1:1 to GSD phases in `.planning/roadmap.md`.

## Phase 1 — Foundation (~1 week)
**Goal:** Empty app boots, auth works, design system renders, deploy pipeline live.

- [ ] Scaffold `apps/web` Next.js app with shared packages wired
- [ ] Wire `@repo/ui`, `@repo/supabase`, `@repo/config`
- [ ] `apps/web/app/globals.css` imports `@repo/ui/theme.css`
- [ ] Supabase project created; env vars set in Vercel
- [ ] Auth: login page (`AuthLayout`), Supabase Auth wired, logout
- [ ] Middleware: redirect on auth, on role
- [ ] DashboardLayout integrated with Paratus sidebar variant
- [ ] Logo + favicon in place
- [ ] Vercel deploy from `main` working
- [ ] RBAC migration (00001) applied; JWT hook enabled
- [ ] Three placeholder pages render: `(hq)`, `(country-admin)/[country]`, `(sales-rep)/[country]/queue`
- [ ] Visual smoke check: matches AMA aesthetic

**Done when:** A test user with each role logs in and lands on the right placeholder, sidebar branded, no console errors.

## Phase 2 — Data Model & Ingestion (~1 week)
**Goal:** Leads can flow in and persist correctly, with RLS preventing cross-country leakage.

- [ ] Migrations 00002 (reference data + seed countries/forms), 00003 (leads/events/callbacks), 00004 (views)
- [ ] Zod schemas for all tables and ingest payload
- [ ] DAL functions for leads, events, callbacks, dashboard views
- [ ] `/api/leads/ingest` endpoint with HMAC + shared secret
- [ ] CSV importer page on country-admin
- [ ] Round-robin assignment function (Postgres function or TS in handler)
- [ ] RLS verified with two test users in different countries from client SDK
- [ ] Synthetic seed data script for dev (50 leads/country)

**Done when:** A POST to `/api/leads/ingest` creates a `leads` row, fires `lead_events(type='created' & 'assigned')`, and an agent's realtime channel emits the row. Cross-country read returns 0 rows.

## Phase 3 — Sales Rep Queue (~1 week)
**Goal:** The agent-facing screen — the speed-to-lead loop is closed.

- [ ] Queue page: realtime sorted list, colour-coded SLA dots, lead detail panel
- [ ] "Call now" action → status=`contacted`, `first_contacted_at` stamped, `lead_events(type='call')`
- [ ] Outcome modal (reuse `CallOutcomeModal` from AMA): qualified / no-answer / callback / won / lost+reason
- [ ] Callback scheduling: writes to `callbacks`, lead reappears at scheduled time
- [ ] Today's stats strip
- [ ] Filter by service
- [ ] Mobile responsive — verified on phone
- [ ] Playwright E2E: sales-rep golden path

**Done when:** From an empty queue, a synthetic lead appears via webhook, agent calls, captures outcome, lead exits queue, stats strip updates — all without a refresh.

## Phase 4 — Country Admin Dashboard (~1 week)
**Goal:** Country admins have a live operational view of their team.

- [ ] KPI strip (today / week / month)
- [ ] Pipeline funnel (`StatusPipeline`)
- [ ] Speed-to-lead chart (Recharts area)
- [ ] Agent performance table (kiosk striped)
- [ ] Lead source breakdown (`HorizontalBarChart`)
- [ ] Lead list with search + filter + reassignment
- [ ] CSV export of filtered list
- [ ] Playwright E2E: country admin reassigns a stuck lead

**Done when:** Country admin opens dashboard, sees live numbers, drills into agent, reassigns a lead, exports a CSV. All matches mockup `docs/design-reference/country-admin-dashboard.html`.

## Phase 5 — HQ Overview (~3-4 days)
**Goal:** Group leadership sees all 13 countries on one screen.

- [ ] Group KPI strip
- [ ] Country leaderboard (`HorizontalBarChart` + sparklines per row)
- [ ] Group pipeline funnel
- [ ] Group speed-to-lead trend with country band
- [ ] Service mix breakdown
- [ ] Drill-in: clicking a country opens its admin dashboard read-only
- [ ] Playwright E2E: HQ Monday review flow

**Done when:** HQ user logs in, sees leaderboard, drills into worst-performing country, returns to group view. Matches mockup `docs/design-reference/hq-dashboard.html`.

## Phase 6 — Production Hardening (~3-4 days)
**Goal:** Ready for client UAT.

- [ ] Pilot country selected (Mozambique or Namibia per William)
- [ ] Real form ingestion wired (Path 1 webhook or Path 2 n8n bridge)
- [ ] SLA breach alerts (email via Resend)
- [ ] Audit log for admin actions
- [ ] Security checklist passes end-to-end
- [ ] Production env vars confirmed
- [ ] Performance budget met (LCP < 2s, queue < 1.5s)
- [ ] Backup + restore procedure documented
- [ ] Rate limiting on auth + webhook
- [ ] Synthetic monitoring on `/api/health`

**Done when:** Pilot country runs live for 48h with real leads, no incidents, no cross-country leakage observed.

## Phase 7 — Rollout (~3-4 days, partly retainer)
**Goal:** All 12 active countries live; 3 coming-soon countries staged.

- [ ] Country admin and agent users provisioned per active country (12)
- [ ] Coming-soon countries (Lesotho, Malawi, Zimbabwe) seeded as `status='coming_soon'` — flipped on later via retainer when Paratus is ready
- [ ] Onboarding doc for country admins (one-pager)
- [ ] Onboarding video / Loom walkthrough
- [ ] Cutover plan per country (with William)
- [ ] Phase out Google Sheets gradually
- [ ] Handover doc for client (Google account credentials, repo access, runbook)

**Done when:** All 12 active countries are live, agents are using the queue, HQ has a stable Monday review running, coming-soon flags are in place for the remaining 3.

## Future / Retainer
- Gamification (leaderboards, streaks, weekly winners)
- AI lead scoring
- WhatsApp auto-acknowledgement
- AI call-note summarisation
- Self-serve form/funnel addition
- Per-language UI (FR / PT)
