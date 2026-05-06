# Plan 07-05 — Pre-pilot UI polish + RLS scoping fix — SUMMARY

**Status:** shipped 2026-05-06
**Trigger:** Live execution before William's first review meeting on
2026-05-06; closes the "HQ sidebar stubs → real surfaces" carry-over
flagged in `STATE.md` post-Phase-6 and patches a previously-undetected
HQ-admin lead-scoping leak.

**Commits (in order, all on `main`):**

| Commit | Subject |
|--------|---------|
| `a954a3d` | chore(deploy): throttle SLA-check cron to daily for Hobby-plan deploys |
| `fa639cb` | feat(hq): replace stubs with real Countries directory + Service Mix table |
| `3999cbf` | feat(hq): empty-state status dot + real Settings page + stale comment cleanup |
| `f8623c2` | feat(hq): surface Phase 6 audit log on Overview via Recent Activity panel |
| `245fc55` | fix(country-admin): scope leads list + export to URL country (HQ leak) |
| `2199c7d` | feat(country-admin): empty-state banner for zero-lead countries |
| `e3afaaf` | feat(country-admin): add per-country Recent Activity panel + extend DAL |
| `1d4b6a2` | feat(country-admin): real Settings page (was 404'ing) |

## What landed

### Real surfaces (HQ)

```
apps/web/app/(hq)/
├── countries/page.tsx                          MOD — replaced stub with card grid
├── countries/_components/country-card.tsx      NEW — active + coming-soon variants
├── service-mix/page.tsx                        MOD — replaced stub with rank/share/distribution table
├── settings/page.tsx                           MOD — replaced stub with health probe + footprint + SLA + audit log access + future-iteration note
├── _components/recent-activity-card.tsx        NEW — last 10 audit events across the group
├── _components/country-leaderboard.tsx         MOD — `none` status dot for zero-lead rows
├── _components/kpi-strip.tsx                   MOD — `slate` accent for empty-state avg speed
└── page.tsx                                    MOD — wires RecentActivityCard
```

### Real surfaces (country-admin)

```
apps/web/app/(country-admin)/[country]/
├── settings/page.tsx                           NEW — read-only profile + roster + audit link
├── _components/recent-activity-card.tsx        NEW — last 5 events teaser → /<country>/audit
└── page.tsx                                    MOD — empty-state banner + RecentActivityCard
```

### RLS scoping fix

```
apps/web/app/(country-admin)/[country]/leads/page.tsx        MOD — eq('country_code', countryCode)
apps/web/app/api/country-admin/export-leads/route.ts          MOD — accept ?country=, apply filter, filename uses explicit country
```

### DAL + schemas

```
packages/supabase/src/dal/group.ts        MOD — getCountriesDirectory(); CountryDirectoryRow re-export
packages/supabase/src/dal/audit.ts        MOD — getRecentGroupActivity(limit, countryCode?); GroupActivityRow type
packages/supabase/src/dal/index.ts        MOD — barrel exports
packages/supabase/src/schemas/group.ts    MOD — countryDirectoryRowSchema; ResponseStatus gains `'none'`; computeResponseStatus({ hasData })
packages/supabase/src/schemas/index.ts    MOD — barrel exports
apps/web/tests/hq.dal.test.ts             MOD — empty-state branch coverage
```

### Nav + stale references

```
apps/web/app/_lib/nav.ts                                                  MOD — country-admin trimmed to Overview/Leads/Audit/Settings; sales-rep trimmed to My Queue
apps/web/app/(country-admin)/[country]/_components/range-picker.tsx       MOD — comment updated to "shipped in 06-04 task 3"
apps/web/app/(sales-rep)/[country]/queue/page.tsx                         MOD — observer notice no longer references unshipped Phase 4
```

### Operational

```
apps/web/vercel.json                      MOD — SLA-check cron `* * * * *` → `0 6 * * *` (Hobby unblock)
```

## Decisions made

### Why three new "real" pages instead of removing the stubs

The mockups (`docs/design-reference/hq-dashboard.html`) and the `roadmap.md`
Phase 5 outcome ("HQ sees country leaderboard, drills into worst country,
returns") implied these surfaces existed. Removing them from the nav would
have signalled regression. Building real read-only versions closed the
gap and surfaced the production-hardening work that William couldn't see
from the headline pages alone.

### Why `'none'` instead of overriding the call site

The `computeResponseStatus` helper is the single source of truth for the
status dot semantics across three dashboards (sales-rep, country-admin,
HQ). Adding a fourth variant in the helper ensures every consumer adopts
the same "empty state vs. off target" distinction; pre-computing at
individual call sites would have copied the rule and risked drift.
Backwards-compatible default (`hasData` defaults to `true`) so existing
callers keep their semantics.

### Why a `country` query param on the export route, not a path

The export route is shared between country admins (RLS-scoped) and HQ
admins (cross-country). A path param like `/api/country-admin/<code>/export`
would have been more idiomatic but required a route move + redirect for
existing callers. The query param + ISO-code regex validation is
surgical, observable in URLs, and the leads page is the only caller — no
back-compat surface to manage.

### Cron throttle: daily not removed

Removing the cron entirely would have lost the SLA breach detection
plumbing built in plan 06-01. Daily preserves the wiring; restoring per-
minute is a one-line change after the Pro upgrade. Memory note recorded
to flag this when active SLA monitoring becomes a discussion item.

### Country admin Settings: read-only

Provisioning is HQ admin's responsibility (plan 07-01 bulk-invite engine);
country admins shouldn't mutate role rows. The Settings page mirrors the
HQ pattern and explicitly documents the provisioning flow as "request
from HQ admin," consistent with the role one-pagers shipped in plan
07-02.

## Verification

| Check | Expected | Observed |
|-------|----------|----------|
| `npm run type-check` (every commit) | green | green ✓ |
| `npm run lint` (every commit) | green | green ✓ |
| `npm run build` (every commit) | green | green ✓ |
| `git grep -n "Phase 6 — coming soon" apps/web` | empty | empty ✓ |
| `git grep -n "Phase [0-9]" apps/web/app -- ':!**/*.md'` | only audited references (e.g. plan-comment provenance) | green ✓ |
| Vercel production deploy (8/8 commits) | Ready | all Ready ✓ |
| `SELECT country_code, COUNT(*) FROM leads GROUP BY 1` | only MZ has rows | 9 MZ ✓ |
| HQ admin opens `/cd/leads` post-fix | 0 leads (no DRC data) | 0 leads ✓ |
| HQ admin opens `/mz/leads` post-fix | 9 leads | 9 leads ✓ |
| `/<country>/settings` for any active country | renders, no 404 | confirmed ✓ |
| Auto-deploy from `git push` | triggers + lands Ready | confirmed ✓ |

## Carry-overs

### Restored cron schedule on Pro upgrade

`apps/web/vercel.json` cron `/api/cron/sla-check` is currently `0 6 * * *`
(daily). Restore to per-minute (`* * * * *`) when the `paratusgroup`
Vercel team upgrades to Pro. Tracked in memory note
`project_vercel_pro_upgrade_pending.md`.

### Phase 7-03 (still gated on William)

Plan 07-05 did NOT touch any Plan 07-03 deliverables. The pilot cutover
ceremony (Resend SMTP wiring, GitHub org creation, Mozambique
provisioning run, soak start) remains paused awaiting William's Q1–Q8
answers in `07-USER-SETUP.md`.

### Documented in `MEMORY.md`

- `project_vercel_pro_upgrade_pending.md` — SLA cron throttled; restore
  cadence after Pro upgrade.

## Boil-the-Ocean checks

- [x] Every commit type-checks, lints, and builds clean
- [x] No `TODO` / `FIXME` / `XXX` markers introduced
- [x] No half-wired buttons (every nav item resolves)
- [x] No mock data on production paths
- [x] Visual fidelity: all new surfaces use existing `@repo/ui` primitives
      (SectionCard, MetricCard, Table, cn) — no design drift
- [x] Security checklist re-applied: HQ-admin scoping leak found and
      fixed; no new RLS bypass paths introduced; defence-in-depth
      `requireRole` re-checks preserved on every new server component
- [x] Every shipped commit deployed to production successfully
- [x] Documentation parity: this PLAN + SUMMARY + STATE update lands
      with the work, not after
