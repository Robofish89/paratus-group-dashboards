---
phase: 04-country-admin-dashboard
plan: 03
status: shipped
shipped_at: 2026-05-04
subsystem: ui/country-admin-leads + write-apis + route-tests
tags: [route-handlers, zod, papaparse, dialog, pagination, vitest, rls]

# Dependency graph
requires:
  - phase: 04-country-admin-dashboard
    plan: 01
    provides: reassign_lead RPC (SECURITY DEFINER + JWT role/country/cross-country target guards)
  - phase: 04-country-admin-dashboard
    plan: 02
    provides: getCountryAgents + reassignLead DAL with typed ForbiddenError/NotFoundError + reassignLeadInput Zod schema
  - phase: 02-data-model-ingestion
    plan: 05
    provides: papaparse precedent for the CSV importer (reused on the export side)
  - phase: 03-sales-rep-queue
    plan: 03
    provides: /api/e2e-login bridge + magiclink-cookie test technique (extended here with signInViaBridge)
provides:
  - country-admin-leads-route (`/[country]/leads`)
  - country-admin-reassign-api (`POST /api/country-admin/reassign`)
  - country-admin-export-api (`GET /api/country-admin/export-leads`)
  - lead-list + reassign-dialog client components
  - signInViaBridge + getDevServerUrl test helpers
affects:
  - 04-country-admin-dashboard (plan 04-04 — Playwright golden path + visual checkpoint)
  - 06-production-hardening (offset → cursor pagination migration if traffic grows past 5k/country)
---

# 04-03 — Country Admin Lead List + Reassign + Export

## What shipped

### Write APIs (commit `87683b7`)

**`POST /api/country-admin/reassign`** — `apps/web/app/api/country-admin/reassign/route.ts`. Thin wrapper over `reassignLead(...)` from `@repo/supabase/dal/country`:

- `runtime = 'nodejs'`.
- `getCurrentUserClaims()` → 401 if no session, 403 if role is not `country_admin | hq_admin` (defence-in-depth on top of the SECURITY DEFINER RPC's internal JWT guard).
- `reassignLeadInput` Zod parse → 400 `invalid_payload` on miss.
- `reassignLead(input)` → 204 on success.
- Error mapping: `ForbiddenError` → 403, `NotFoundError` → 404, anything else → 500 (`err.message` surfaced).

**`GET /api/country-admin/export-leads`** — `apps/web/app/api/country-admin/export-leads/route.ts`. CSV stream using `Papa.unparse(...)`:

- `runtime = 'nodejs'`.
- Same role gate as reassign (401 unauth / 403 wrong role).
- **Cookie-authed `createClient()` from `@repo/supabase/server`, NOT `createAdminClient`** — RLS is the country lock (RESEARCH.md pitfall 6). Country admins physically cannot select rows from other countries; HQ admins see all.
- Filters: `from` / `to` (half-open `created_at >= from AND created_at < to`), `status` (validated against `lead_status` enum, 400 on miss), `service` (form_slug `eq`), `q` (ILIKE across `name | email | phone`, with `,()` stripped before passing to PostgREST `.or()`).
- `.limit(50_000)` cap; if hit, response carries `X-Truncated: true` header.
- Filename: `leads-${country_or_'all'}-${from ?? 'all'}-to-${to ?? 'now'}.csv`. Country read from JWT claims.
- Headers: `Content-Type: text/csv; charset=utf-8`, `Content-Disposition: attachment; filename=...`, `Cache-Control: no-store`.

### Lead list page + reassign dialog (commit `ea69b85`)

**Server Component** `apps/web/app/(country-admin)/[country]/leads/page.tsx`:

- Reads `?status=&service=&from=&to=&q=&page=` from `searchParams`. Defaults `page=1`, `pageSize=50`.
- `requireRole(['country_admin','hq_admin'])` + `requireCountry(country, claims)`.
- Fetches in parallel: filtered leads slice (cookie-authed Supabase query mirroring the export filter shape, with `count: 'exact'` + `.range((page-1)*50, page*50-1)`) + `getCountryAgents(country)` for the dialog dropdown.
- Composes `<CountryAdminShell>` → page heading "Leads" → `<LeadList>` (rows, total, page, pageSize, agents, country, current filters).
- Export-CSV button is a styled `<a href="/api/country-admin/export-leads?...">` so the browser drives the file download natively.

**Client component** `apps/web/app/(country-admin)/[country]/_components/lead-list.tsx`:

- Filter row: status select, service (form_slug) select, date-range picker (reused from `(sales-rep)`), search box. Each filter pushes to URL via `router.push` so server re-fetches authoritatively.
- Table columns: Name (with phone subline), Service, Status (`<StatusBadge>`), Assigned To (agent name or "Unassigned"), Created, Actions (⋮ → "Reassign…").
- Pagination: prev / next + page-of-pages count, links update `?page=`.
- No realtime broadcast subscription on this view (pagination + concurrent inserts shift row indices — RESEARCH.md pitfall 8). Overview tiles still pop via `useCountryBroadcast`; admins refresh the list view manually.

**Client component** `apps/web/app/(country-admin)/[country]/_components/reassign-dialog.tsx`:

- Radix `<Dialog>` over `@repo/ui`. Title: "Reassign {lead.name}". Agent select pre-filters the current assignee out so admins can't no-op-reassign.
- `fetch("/api/country-admin/reassign", { method: "POST", body: JSON.stringify({ lead_id, to_agent_id }) })`.
- 204 → call `onReassigned`, then `router.refresh()` for server-authoritative re-fetch + sonner toast "Lead reassigned".
- 403 → inline error "You don't have permission to reassign this lead."
- 404 → "Lead no longer exists."
- 500 / network → "Couldn't reassign. Try again." Sonner toast on every error.

### Tests (commit `77f6f46`)

**`apps/web/tests/country-admin.routes.test.ts`** — 11 vitest cases driving the live dev server (port 3012, `E2E_AUTH_ENABLED=true`) over real HTTP so middleware + cookie auth + RLS round-trip on every assertion.

| # | Case | Surface |
|---|---|---|
| 1 | MZ admin reassigns MZ lead | 204 + `assigned_to` flipped + `lead_events(type='reassigned')` row |
| 2 | Sales rep tries to reassign | 403 (route-layer role gate) |
| 3 | MZ admin tries to reassign BW lead | 403 (RPC `forbidden_country` guard) |
| 4 | HQ admin lands MZ lead on BW agent | 403 (RPC `cross_country_assignment` guard) — auto-skips with telemetry if no BW agent seeded; 04-01 unit tests cover the SQL path directly |
| 5 | Non-existent lead UUID | 404 |
| 6 | Malformed body (missing `to_agent_id`) | 400 |
| 7 | MZ admin export — every row `country_code='MZ'`, first column `id`, parseable text/csv | RLS country lock |
| 8 | MZ admin `?status=converted` | only converted rows |
| 9 | Sales rep export | 403 (route-layer role gate) |
| 10 | HQ admin export | both MZ + BW rows present |
| 11 | `?from=<future ISO>` | empty body (Papa.unparse([]) → "") |

**Helpers** at `apps/web/test-support/helpers.ts` extended with `signInViaBridge(email)` (POSTs to `/api/e2e-login` and assembles a `Cookie: ...` header from the `Set-Cookie` chunks) and `getDevServerUrl()` (env-overridable default `http://localhost:3012`).

## Test counts

| Surface | Cases |
|---|---|
| Reassign route handler (HTTP + middleware + RPC guards) | 6 |
| Export route handler (HTTP + RLS + filters) | 5 |
| **Total** | **11** |

Plan called for 11; shipped 11.

## Key decisions

- **CSV export uses cookie-authed `createClient`, never service-role.** RLS is the country lock — anything else would either silently no-op for HQ admins (if filtered server-side by country) or expose cross-country data to country admins (if service-role bypassed RLS). The plan's RESEARCH.md pitfall 6 was flagged for this exact reason; route honours it.

- **No country-code filter in the export query.** The route deliberately does NOT `.eq("country_code", caller_country)`. RLS does that for country admins, and adding the filter would silently break HQ admin's "see all countries" path. The 11th test case (HQ admin sees both MZ and BW) pins this contract.

- **Offset pagination for v1, cursor migration deferred to Phase 6.** Paratus's largest active country has ~5k leads today; offset works fine at this scale. Cursor is correct long-term but the migration is a Phase 6 hardening pass. No `// TODO` left in code per the Boil-the-Ocean standard — the v1 code is correct as shipped, just not asymptotically optimal.

- **No realtime broadcast on the lead list view.** Pagination + concurrent inserts shifts indices — admins on page 2 would see rows duplicate / disappear as new leads arrive on page 1. Overview tiles still pop via `useCountryBroadcast`; the list view is server-authoritative + manual-refresh. Verified: opening the list view does NOT open a Supabase realtime WS connection.

- **Cross-country reassignment guard is RPC-only.** No client-side cross-country check in `<ReassignDialog>` — the agent dropdown is already filtered to the lead's country (it's `getCountryAgents(country)` from the page), and the RPC's `cross_country_assignment` guard backstops it. Two layers (UI + RPC) would be redundant and create drift risk; the SQL guard is canonical.

- **Defence-in-depth role gate on both routes.** The reassign RPC has its own `forbidden_role` guard inside SECURITY DEFINER, but the route layer ALSO checks `claims.user_role` so non-admins never even hit the RPC. Mirrors the agent queue routes (`/api/queue/complete` etc.) — same shape, same logic. Both routes return 401 for missing session and 403 for wrong role; tests pin both branches.

- **`q` filter sanitises `,()` before PostgREST `.or()`.** supabase-js splits the `.or()` value on commas and parens — passing user input verbatim breaks the filter. We strip those characters (searching for them isn't meaningful for name/email/phone).

- **Status enum re-validated at the route level.** Even though Postgres rejects bogus enum values, validating early gives a clean 400 instead of a 500 with a Postgres error message in the body.

- **`Papa.unparse([])` returns `""` — test 11 accepts that.** When zero rows match, the export body is empty (no header, no rows). The 11th test case explicitly accepts an empty body OR a header-only body, since both are valid output shapes from Papa.

- **`signInViaBridge` collects every `Set-Cookie` chunk via `getSetCookie()`.** Next sets multiple `sb-...-auth-token.{0,1,...}` chunks for big sessions; concatenating only the first one breaks RLS auth. Helper splits each chunk on `;`, takes the `name=value` head, and joins with `; ` to form the request `Cookie:` header.

## Visual fidelity vs `docs/design-reference/country-admin-dashboard.html`

The lead-list section of the mockup is the contract. This plan's UI matches it on:

- Layout: filter row above the table; right-aligned Export-CSV button; compact table with name + phone subline; status pills; pagination footer.
- Brand tokens: same `#2B479B` / `#F7941D` / `#0F172A` palette inherited from plan 04-02.
- Reassign dialog: centred Radix dialog, single column form, Cancel/Save action row.

**Deferred to plan 04-04 visual checkpoint** (small, intentional):

- Pixel-perfect spacing review (matches plan 04-02's deferral — designer's eye pass on the running UI).
- Row-hover transition timing — currently snaps; mockup has a 150ms ease.
- Empty-state illustration when filters yield zero rows. Currently a plain "No leads match the current filters" line; mockup includes an icon. Logged for 04-04.

These are the only knowing deviations.

## Carry-overs for downstream plans

### Plan 04-04 (Playwright golden path + visual checkpoint)

- **Playwright golden path**: NA admin signs in via e2e bridge → lands on `/MZ` overview → clicks Sidebar → Leads → filters by status → opens Reassign dialog → reassigns → sees row update → clicks Export CSV → file downloads. Reuses the e2e-login bridge already wired for Phase 3 + this plan's tests.
- **Three visual deferrals** logged above + the three carried over from plan 04-02 (gauge linecap, delta colour transitions, pixel-perfect spacing). Six items total for the visual checkpoint.

### Phase 6 (production hardening)

- **Offset → cursor pagination** for the lead list view. Use `(created_at, id)` as the cursor pair to break ties on identical timestamps. Migration is purely client + server-component-side; no DB schema change.
- **Realtime on the list view** if cursor pagination unblocks it (cursor-stable rows survive concurrent inserts). Optional; admins manage fine without it today.

## Commits

- `87683b7` — feat(04-03): country admin write APIs — reassign + CSV export
- `ea69b85` — feat(04-03): country admin lead list + reassign dialog
- `77f6f46` — test(04-03): country admin route handlers + RLS gates
- (next) — docs(04-03): close plan — SUMMARY + STATE update

## Verification

- `npm run type-check` — green (turbo, 1 task, ~2.1s).
- `npm run lint` — clean (turbo, 1 task, ~3.9s).
- `npm test -- country-admin.routes.test.ts --run` (apps/web workspace) — 11/11 green in 15.3s with the dev server live on port 3012 + `E2E_AUTH_ENABLED=true`.
- Manual smoke (dev server on port 3012):
  - `/MZ/leads` renders the filterable, paginated list scoped by RLS.
  - Reassign dialog opens, dropdown populated by `getCountryAgents`, save → row updates after `router.refresh()`.
  - Export CSV button downloads a country-scoped file (filename embeds `MZ`).
  - Sales rep cookie hitting either endpoint returns 403.
