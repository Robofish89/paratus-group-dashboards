# Phase 5: HQ Overview — Research

**Researched:** 2026-05-04
**Domain:** Group-wide aggregation dashboard over an established Phase 1–4 stack
**Confidence:** HIGH

<research_summary>
## Summary

Phase 5 is a third dashboard surface (after sales-rep queue and country-admin) that
sums Phase 4's per-country views across all 12 active countries and adds a clickable
country leaderboard that drills into the existing `/[country]` country-admin view.
Almost the entire stack is already locked: Recharts 3.8.1, Server Components +
DAL + Zod, `usePrivateBroadcast` hook, two-source today/range stats split,
ring-around-card KPI tiles, `requireRole(['hq_admin'])` layout gate, even the
empty `apps/web/app/(hq)/_components/hq-shell.tsx` shell. Real research load is
small.

The single biggest finding: **Phase 5 needs surprisingly little new SQL**.
Migration 00006 already ships `country_leaderboard` (per-country 30d rollup)
for exactly this surface, and migration 00011's per-country views
(`country_today_stats`, `leads_by_service_today`, `country_speed_to_lead_today`,
`status_pipeline_today`) are RLS-keyed not JWT-pinned — HQ admin's
`*_hq_admin_all` policies on `leads / lead_events / callbacks` mean an HQ
admin SELECTing without a WHERE clause gets one row per country. The
mockup's leaderboard shape diverges from 00006's existing view (mockup wants
*today*-windowed columns; existing view is 30d), so one new view is needed,
plus a thin group rollup wrapper. The remaining novelty is UI.

**Primary recommendation:** Two new SQL views (`group_today_stats`,
`country_performance_today`) + one new RPC (`group_speed_to_lead_series`) +
one new realtime trigger + topic policy (`group:all`). Everything else is
React assembly using inherited primitives. Treat the lift as "wire it up and
match the mockup," not "design from scratch."
</research_summary>

<standard_stack>
## Standard Stack

Almost everything is inherited verbatim from Phase 4 — listed here for
completeness, with the Phase 5 deltas called out. **No new top-level
dependencies are needed.**

### Core (locked, no change)
| Library | Version | Purpose | Source of truth |
|---------|---------|---------|------------------|
| next | 16.x | App Router, Server Components, route handlers | Phase 1 |
| react | 19.x | UI runtime | Phase 1 |
| typescript | 5.x | strict types | Phase 1 |
| tailwindcss | v4 | utility CSS, theme tokens in `packages/ui/src/styles/theme.css` | Phase 1 |
| @supabase/ssr | 0.7.x | Server / browser / middleware clients | Phase 1 |
| @supabase/supabase-js | 2.x | DAL + realtime subscriber | Phase 1 |
| zod | 3.x | Input validation on every route handler | Phase 1 |

### Phase 4 carry-overs (still locked, still in use)
| Library | Version | Purpose | Notes |
|---------|---------|---------|-------|
| recharts | ^3.8.1 | Speed-to-Lead trend AreaChart with `<ReferenceLine>` and gradient fill | Already pinned to `apps/web` only (not monorepo root). The 7-day group-wide trend in the HQ mockup is the same shape as Phase 4's country gauge sparkline — reuse the chart component, swap the data prop. |

### Phase 5 deltas
**Zero new packages.** The deltas are workspace-internal:
1. Promote `apps/web/app/(sales-rep)/_lib/date-range.ts` → `apps/web/app/_lib/date-range.ts` (Phase 4 RESEARCH.md flagged this carry-over at line 233 because Phase 5 will be the third caller of `parseRangeParams`).
2. Add `packages/supabase/src/dal/group.ts` — mirrors the shape of `country.ts` but with no `country_code` arg.
3. Add `packages/supabase/src/realtime/use-group-broadcast.ts` (or extend the existing `usePrivateBroadcast` hook with a `group:all` wrapper).

### Alternatives Considered
| Instead of | Could Use | Why we don't |
|------------|-----------|--------------|
| Recharts `<AreaChart>` for the 7-day trend | Visx, custom SVG | Phase 4 already pinned Recharts and proved the gauge sparkline pattern. Adding a second charting lib for one chart is churn. |
| New `group:all` broadcast topic + RLS policy | HQ admin subscribes to all 12 `country:<code>` topics in parallel | 12 WS subscriptions per HQ tab burns connections and complicates the client. One trigger + one policy is ~10 lines of SQL. See Pattern 3 below. |
| Building a fresh "country performance" view | Extend `country_leaderboard` (00006) with today-windowed columns | The 30d-window of the existing view is genuinely useful for trend context (we may want to keep it). Building a second `country_performance_today` view is cleaner than entangling two windows in one SELECT. |
</standard_stack>

<architecture_patterns>
## Architecture Patterns

### Recommended File Structure
Mirrors Phase 4's `(country-admin)/[country]` layout, scaled to single-tenant HQ:
```
apps/web/app/(hq)/
├── layout.tsx                    # exists — requireRole(['hq_admin'])
├── page.tsx                      # exists — Phase 5 replaces the SectionCard placeholder body
├── _components/
│   ├── hq-shell.tsx              # exists — sidebar + DashboardLayout
│   ├── kpi-strip.tsx             # NEW — 5 tiles, ring-around-card pattern (mirror Phase 4)
│   ├── country-leaderboard.tsx   # NEW — 13-row sortable table, status dot, row click → /[country]
│   ├── leads-by-service-card.tsx # NEW — horizontal-bar list, group totals
│   └── speed-to-lead-trend-card.tsx # NEW — Recharts AreaChart, 7 days, group-wide

apps/web/app/_lib/
└── date-range.ts                 # NEW location — promoted from (sales-rep)/_lib/

packages/supabase/src/dal/
└── group.ts                      # NEW — Zod schemas + 4 query functions

packages/supabase/migrations/
└── 00013_hq_overview.sql         # NEW — 2 views + 1 RPC + 1 broadcast trigger + 1 RLS policy
```

### Pattern 1: HQ aggregation via `security_invoker` + RLS bypass
**What:** New group-level views use `security_invoker = true` + a sane GROUP BY.
The underlying `*_hq_admin_all` RLS policies on `leads`, `lead_events`,
`callbacks` (already shipped in 00005) let `hq_admin` read every row, so
the view's GROUP BY naturally returns one row per country (or one
single-row aggregate). No special HQ branching is needed inside the view —
RLS does it.

**When to use:** Every new HQ view in 00013.

**Example:**
```sql
-- group_today_stats: single-row group-wide rollup for the 5-tile KPI strip.
DROP VIEW IF EXISTS public.group_today_stats;
CREATE VIEW public.group_today_stats AS
SELECT
  count(c.code) FILTER (WHERE c.status = 'active') AS active_country_count,
  sum(t.total_leads)         AS total_leads_group,
  sum(t.new_today)           AS new_today_group,
  sum(t.contacted_today)     AS contacted_today_group,
  sum(t.converted_today)     AS converted_today_group,
  sum(t.lost_today)          AS lost_today_group,
  -- Rolling group conversion: converted across all time / total across all time.
  -- Matches the mockup's 14.2% number which is "Conversion Rate" with no window.
  count(l.id) FILTER (WHERE l.status = 'converted')::numeric
    / NULLIF(count(l.id), 0) AS conversion_rate_alltime,
  -- Avg first-response in seconds across countries (today only).
  avg(EXTRACT(EPOCH FROM (l.first_contacted_at - l.submitted_at)))
    FILTER (
      WHERE l.first_contacted_at IS NOT NULL
        AND l.created_at >= (date_trunc('day', now() AT TIME ZONE 'UTC'))
    ) AS avg_speed_to_lead_seconds_today
FROM public.countries c
LEFT JOIN public.country_today_stats t ON t.country_code = c.code
LEFT JOIN public.leads l ON l.country_code = c.code
WHERE c.status = 'active';

ALTER VIEW public.group_today_stats SET (security_invoker = true);
GRANT SELECT ON public.group_today_stats TO authenticated;
```

**Pitfall to remember:** an HQ admin's JWT custom claim has *no*
`country_code`. Any view whose body reads `(SELECT auth.jwt() ->> 'country_code')`
returns NULL for HQ — those views must NOT be used inside HQ aggregations.
The above is safe because it filters on `c.status` and joins by FK only,
never reading the JWT claim.

### Pattern 2: Drill-down navigation HQ → country-admin
**What:** A row click in `country-leaderboard.tsx` calls
`router.push('/' + country_code)`. Because:
- `(country-admin)/[country]/layout.tsx` already accepts both
  `country_admin` AND `hq_admin` (Phase 4 plan 04-03 added the role gate).
- The country-admin DAL functions (`country.ts`) all take a
  `country_code: string` argument and `.eq('country_code', country_code)` —
  they do NOT trust the JWT for the country selector. So HQ landing on
  `/NA` fetches Namibia data correctly.
- The country-admin layout's middleware routing (Phase 1) sends `hq_admin`
  to `/` by default but allows them through `/[country]` because of the
  layout guard.

**Result:** zero new routing or auth code. Drill-in is just an `<a href="/${code}">`.

**Verify in test:** Phase 4's playwright golden path already opens an HQ
session and navigates to a country page; it should pass unchanged.

### Pattern 3: `group:all` realtime topic for HQ live updates
**What:** Add one new broadcast trigger that fans every lead INSERT/UPDATE
to a single `group:all` topic, plus one new RLS policy gating it to
`hq_admin`. HQ pages subscribe via `usePrivateBroadcast({ topic: 'group:all' })`
and `router.refresh()` on any event, same shape as Phase 4's
`useCountryBroadcast`.

**Why not subscribe to all 12 country topics?** A long-lived HQ tab would
hold 12 simultaneous WS subscriptions, each duplicating the same payload.
A single fan-out topic is half the SQL of any other approach and trivially
extensible to the 3 coming-soon countries when they activate (no client
change needed).

**Example (additions to migration 00013):**
```sql
-- After the existing per-country trigger from 00008.
CREATE OR REPLACE FUNCTION public.broadcast_lead_to_group()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM realtime.broadcast_changes(
    'group:all',
    TG_OP, TG_OP, TG_TABLE_NAME, TG_TABLE_SCHEMA, NEW, OLD
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS leads_broadcast_group ON public.leads;
CREATE TRIGGER leads_broadcast_group
  AFTER INSERT OR UPDATE ON public.leads
  FOR EACH ROW EXECUTE FUNCTION public.broadcast_lead_to_group();

-- RLS on realtime.messages — only hq_admin can read group:all.
DROP POLICY IF EXISTS "hq_group_topic" ON realtime.messages;
CREATE POLICY "hq_group_topic" ON realtime.messages
  FOR SELECT TO authenticated
  USING (
    (SELECT auth.jwt() ->> 'user_role') = 'hq_admin'
    AND realtime.topic() = 'group:all'
  );
```

The existing `hq_country_topic` policy from 00008 stays — HQ retains the
ability to subscribe to a specific `country:<code>` topic when drilling in.

### Pattern 4: Per-country leaderboard view (mockup-shape)
**What:** New `country_performance_today` view returning the exact columns
the mockup needs. NOT an extension of `country_leaderboard` (00006) — that
view is 30d-windowed and we keep it for the secondary "trend context" view
later if needed.

**Mockup columns:** Country, Total Leads (all-time), New Today,
Contacted % (of total), Converted % (of total), Avg Response (today, mins),
Status (derived from Avg Response — see Pitfall 4).

**Example:**
```sql
DROP VIEW IF EXISTS public.country_performance_today;
CREATE VIEW public.country_performance_today AS
SELECT
  c.code AS country_code,
  c.name AS country_name,
  count(l.id) AS total_leads,
  count(l.id) FILTER (
    WHERE l.created_at >= (date_trunc('day', now() AT TIME ZONE c.timezone) AT TIME ZONE c.timezone)
      AND l.created_at <  (date_trunc('day', now() AT TIME ZONE c.timezone) AT TIME ZONE c.timezone) + interval '1 day'
  ) AS new_today,
  count(l.id) FILTER (WHERE l.first_contacted_at IS NOT NULL)::numeric
    / NULLIF(count(l.id), 0) AS contacted_pct,
  count(l.id) FILTER (WHERE l.status = 'converted')::numeric
    / NULLIF(count(l.id), 0) AS converted_pct,
  avg(EXTRACT(EPOCH FROM (l.first_contacted_at - l.submitted_at)))
    FILTER (WHERE l.first_contacted_at IS NOT NULL) AS avg_response_seconds
FROM public.countries c
LEFT JOIN public.leads l ON l.country_code = c.code
WHERE c.status = 'active'
GROUP BY c.code, c.name
ORDER BY count(l.id) DESC;

ALTER VIEW public.country_performance_today SET (security_invoker = true);
GRANT SELECT ON public.country_performance_today TO authenticated;
```

### Anti-Patterns to Avoid
- **Reading the JWT `country_code` claim inside an HQ view body** — returns NULL for HQ admin. Use FK joins to `countries` instead.
- **Hand-rolling a "sum 12 country views" loop in the DAL** — push aggregation into SQL where the planner can index it. The DAL should call one view, not 12.
- **Adding a country dropdown that filters HQ tiles** — out of scope. Drill-in via leaderboard row click is the navigation, not in-page filtering.
- **Using `postgres_changes` for HQ live updates** — Phase 2 RESEARCH.md already established Broadcast-from-Database is the architecture. Don't reverse it.
</architecture_patterns>

<dont_hand_roll>
## Don't Hand-Roll

The lift here is mostly DON'T-rebuild rather than DO-build.

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Per-country lead pipeline rollup | new GROUP BY logic | existing `country_today_stats`, `status_pipeline_today`, `leads_by_service_today` (00011) — security_invoker views | HQ reads all rows because of `*_hq_admin_all` RLS bypass; sum the existing rows in the new group view instead of re-rolling-up from `leads`. |
| Per-country 30d conversion rate | new view | existing `country_leaderboard` (00006) | Already shipped, already grants SELECT to authenticated. Use it for any 30d-context view; keep `country_performance_today` for the today-shaped mockup. |
| Per-day speed-to-lead group trend | per-row aggregation in the DAL | extend `speed_to_lead_daily` (00006) into a `group_speed_to_lead_series(p_days)` RPC that GROUP BYs out the country dimension | The base view already computes per-country per-day P50/P95 — group rollup is one extra outer GROUP BY. |
| KPI ring-around-card visual | rebuild from mockup | reuse `apps/web/app/(country-admin)/[country]/_components/kpi-strip.tsx` shape | Plan 04-04 explicitly locked this pattern as cross-dashboard standard ("ring around card matching tile's domain colour with the number coloured to match"). HQ MUST match. Three stat-tile patterns exist now (`MetricCard`, queue-stats, country kpi-strip) — pick the kpi-strip one for congruence; consolidation is Phase 6. |
| Status dot logic | new component | extend the existing dot pattern from queue-stats; threshold function lives in the DAL (`computeResponseStatus(seconds)`) returning `'green' \| 'amber' \| 'red'` | Mockup thresholds: `<5min` green, `5–8min` amber, `>8min` red. UI never recomputes; DAL emits the bucket. |
| HQ → country-admin drill-in routing | new route | use existing `/[country]` (Phase 4) | Auth gate already accepts hq_admin. The country-admin DAL is country-arg-driven, not JWT-pinned. |
| Date-range URL contract | new code | promote `parseRangeParams` (Phase 4 carry-over) to `apps/web/app/_lib/date-range.ts` and import from both `(sales-rep)` and `(hq)` | Phase 4 RESEARCH.md called this out at line 233 — Phase 5 IS the third caller. |
| Real-time hook | new hook | extend `usePrivateBroadcast<T>` from `packages/supabase/src/realtime.ts` with a thin `useGroupBroadcast` wrapper that bakes in `topic: 'group:all'` and `event: '*'` | Same shape as `useAgentBroadcast` and `useCountryBroadcast`. Listening on `event: '*'` not `'INSERT'` — same reason as Phases 3 & 4 (the webhook path emits `UPDATE`, not `INSERT`). |
| HQ role auth on the route | re-implement | trust `apps/web/app/(hq)/layout.tsx` (already calls `requireRole(['hq_admin'])`) | Phase 1 wired this. No new auth code in Phase 5. |

**Key insight:** Phase 5 is mostly *connecting wires*. The Phase 1–4 codebase is unusually well-prepared for HQ — that wasn't an accident. 00006 was written with HQ in mind ("country_leaderboard — country-level rollup for HQ overview"). 00011 used per-country views and `security_invoker=true` because the same data model serves both surfaces. The only places HQ needs new SQL are:
1. group rollup (currently a 6-row missing wrapper view)
2. mockup-shaped per-country leaderboard (different window from 00006's view)
3. group-wide speed-to-lead trend (one outer GROUP BY over an existing view)
4. group:all realtime fan-out (10 lines of SQL)
</dont_hand_roll>

<common_pitfalls>
## Common Pitfalls

### Pitfall 1: HQ admin's JWT has no `country_code` claim → NULL inside views
**What goes wrong:** An HQ-side view that reads `(SELECT auth.jwt() ->> 'country_code')` in its body returns no rows for HQ admin (NULL doesn't match any country code).
**Why it happens:** RBAC v2 (00003) intentionally leaves `country_code` NULL for hq_admin; only country-scoped roles get the claim. Several Phase 3/4 RPCs (`country_stats_in_range`, `agent_performance_in_range`, the queue RPCs) explicitly branch on `v_jwt_role = 'hq_admin'` to handle this. New Phase 5 views must NOT read the claim at all — aggregate via FK joins to `countries` instead.
**How to avoid:** Code review checklist for every new view in 00013 — `git grep "country_code" 00013_hq_overview.sql | grep -v "FROM\|JOIN\|GROUP BY\|c\.code"` should return nothing.
**Warning signs:** HQ tiles show 0 / N/A while a service-role SQL Editor query of the same view returns the right numbers.

### Pitfall 2: 12 vs 13 active countries (mockup says "Countries Active: 13")
**What goes wrong:** The mockup shows 13. Today there are 12 active + 3 coming-soon. Hard-coding 13 in the KPI tile means the value never updates when a coming-soon country activates (or when one drops back to maintenance).
**Why it happens:** Mockup numbers are illustrative.
**How to avoid:** Read live from `count(*) WHERE status = 'active'` in `group_today_stats`. The first render will show 12; in production after the first coming-soon activates, it shows 13 automatically.
**Warning signs:** A reviewer questions why the tile says 12 when the mockup says 13 — answer: "the mockup is illustrative, the live data is 12 today."

### Pitfall 3: Single Avg Speed-to-Lead across countries can mislead
**What goes wrong:** Averaging across countries with very different volumes hides outliers. Namibia at 2.1 min and Eswatini at 14.2 min collapse to a Group avg in the mid-single-digits — but the user impression is "we're hitting SLA" when half the countries aren't.
**Why it happens:** Group-level KPIs are a *summary*, the leaderboard is *the truth*. The mockup correctly pairs the two.
**How to avoid:** Don't drop the leaderboard. Keep the group-avg KPI tile, but ensure the leaderboard's status-dot threshold drives the user's eye to per-country detail. Document this UX intent in `_components/kpi-strip.tsx` so a future contributor doesn't "simplify" by removing the leaderboard.
**Warning signs:** Visual checkpoint feedback like "the green tile is misleading me — Eswatini is clearly red."

### Pitfall 4: Status dot threshold ownership (UI vs view)
**What goes wrong:** UI computes the threshold from `avg_response_seconds`, then a copy in the cell tooltip drifts out of sync with the dot, then the legend at the bottom says different numbers.
**Why it happens:** The threshold (`<5 min` green, `5–8 min` amber, `>8 min` red) is metadata about the metric, not a UI rendering choice.
**How to avoid:** DAL exports a single `computeResponseStatus(seconds): 'green' | 'amber' | 'red'` and emits the bucket from `country_performance_today`'s consumer (`getCountryPerformanceToday`). Component reads the bucket; legend imports the same bucket labels. One source of truth.
**Warning signs:** Reviewer asks "why does Zambia show amber but the avg of 5.1 min would seem green?" Answer should never be "let me check the component."

### Pitfall 5: Realtime topic mismatch — server emits `country:<code>`, HQ subscribes to `group:all`
**What goes wrong:** Without the new `broadcast_lead_to_group` trigger, HQ pages never receive any realtime events even though country admins do.
**Why it happens:** Migration 00008 only emits `country:<code>` and `agent:<uid>`. Adding the HQ topic policy without adding the trigger is a silent no-op.
**How to avoid:** 00013 must contain BOTH the trigger AND the policy in the same migration; vitest realtime test asserts an HQ session receives an event after a webhook ingest.
**Warning signs:** HQ KPIs only update on hard refresh. Inspecting the WS in DevTools shows the channel connected but no inbound messages.

### Pitfall 6: Mockup leaderboard row click ≠ free pass
**What goes wrong:** Clicking a row navigates to `/[country]` but Phase 4 verified the layout accepts hq_admin — *until* a future Phase 6 cleanup tightens the role check and forgets HQ. The Playwright golden path for HQ must include drill-in.
**Why it happens:** Cross-surface navigation is brittle when the destination is owned by another phase.
**How to avoid:** Phase 5's playwright spec MUST cover: HQ login → leaderboard → row click → land on `/[country]` → see country-admin shell. Document the dependency on country-admin layout's role gate in 05-04 SUMMARY. Any Phase 6 tightening that touches `(country-admin)/[country]/layout.tsx` must keep `hq_admin` in the allow-list.
**Warning signs:** The HQ Playwright test starts failing after a country-admin code change.

### Pitfall 7: "Leads by Service (Group)" window — today vs all-time
**What goes wrong:** Country admin's bar list is *today*-windowed. Mockup HQ numbers (2,847 + ... = 8,432) match the "Total Leads (Group)" KPI tile, implying *all-time*. Mismatch with country-admin breaks visual congruence.
**Why it happens:** The mockup's "all-time" reading is implicit, not labelled. A naive HQ implementation copies country-admin's "today" → numbers don't add up to the headline KPI tile.
**How to avoid:** Decide explicitly during planning: (a) all-time matches mockup; (b) today matches country-admin. **Recommendation: all-time, because HQ is the high-altitude view and the chart bars are visibly a breakdown of the total-leads tile right above them.** Document the deviation from country-admin in the SUMMARY.
**Warning signs:** User checkpoint feedback: "the bars don't add up to 8,432."

### Pitfall 8: Conversion-rate KPI delta arrow direction
**What goes wrong:** Mockup's Conversion Rate tile shows "14.2% ↑ 2.1%" — implying a delta vs prior period. The arrow direction is "up = good" for conversion (correct) but "up = bad" for Avg Response Time. Without explicit semantics, a generic delta component shows the wrong colour for one of them.
**Why it happens:** Phase 4's KPI strip handled this correctly per-tile but ad-hoc. Phase 5 is the third caller; high time to formalise.
**How to avoid:** `KpiTile` prop `direction: 'higher-is-better' | 'lower-is-better'` drives both arrow icon and colour token. Document in PHASE-SUMMARY for the Phase 6 stat-tile consolidation work.
**Warning signs:** Visual checkpoint: "the speed-to-lead tile is showing green-up arrow when speed got faster — it should be green-down."
</common_pitfalls>

<code_examples>
## Code Examples

### Reusing `usePrivateBroadcast` for the HQ topic
```typescript
// packages/supabase/src/realtime/use-group-broadcast.ts
import { usePrivateBroadcast } from "../realtime";

/**
 * Listens on group:all. Calls the supplied refresh on any lead change in any country.
 * Use only inside (hq) routes — the realtime.messages RLS policy gates the topic to hq_admin.
 */
export function useGroupBroadcast(refresh: () => void) {
  return usePrivateBroadcast<unknown>({
    topic: "group:all",
    event: "*",            // webhook path emits UPDATE not INSERT — see Phase 3/4 lessons
    onMessage: () => refresh(),
  });
}
```

### Group DAL surface (shape, not full implementation)
```typescript
// packages/supabase/src/dal/group.ts
import "server-only";
import { z } from "zod";
import { createClient } from "../server";

export const groupTodayStatsSchema = z.object({
  active_country_count: z.number(),
  total_leads_group: z.number(),
  new_today_group: z.number(),
  contacted_today_group: z.number(),
  converted_today_group: z.number(),
  lost_today_group: z.number(),
  conversion_rate_alltime: z.number().nullable(),
  avg_speed_to_lead_seconds_today: z.number().nullable(),
});
export type GroupTodayStats = z.infer<typeof groupTodayStatsSchema>;

export async function getGroupTodayStats(): Promise<GroupTodayStats> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("group_today_stats")
    .select("*")
    .single();
  if (error) throw error;
  return groupTodayStatsSchema.parse(data);
}

// computeResponseStatus is the single source of truth for the green/amber/red bucket.
export function computeResponseStatus(seconds: number | null): "green" | "amber" | "red" {
  if (seconds === null) return "red";
  const minutes = seconds / 60;
  if (minutes < 5) return "green";
  if (minutes <= 8) return "amber";
  return "red";
}
```

### Drill-in row link
```tsx
// apps/web/app/(hq)/_components/country-leaderboard.tsx (excerpt)
import Link from "next/link";

<tr key={row.country_code} className="country-row">
  <td>
    <Link
      href={`/${row.country_code}`}
      className="block px-6 py-3.5 text-sm font-semibold text-slate-900"
    >
      {row.country_name}
    </Link>
  </td>
  {/* ...other cells... */}
</tr>
```

No new auth code — `(country-admin)/[country]/layout.tsx` already calls
`requireRole(['country_admin', 'hq_admin'])`.
</code_examples>

<sota_updates>
## State of the Art (2026)

Nothing material has shifted in the stack between Phase 4 (2026-05-02) and
Phase 5 (2026-05-04). Recharts hasn't released, Supabase realtime
broadcast pattern is stable, Next.js 16 App Router is stable.

The one open carry-forward worth tracking: Next.js 16 `middleware` →
`proxy` rename produces a deprecation warning at every build. Phase 6
target. Doesn't block Phase 5.
</sota_updates>

<open_questions>
## Open Questions

1. **"Leads by Service (Group)" window — all-time, 30d, or today?**
   - What we know: mockup numbers add up to the "Total Leads (Group)" KPI (8,432), implying all-time.
   - What's unclear: country-admin bar list is today-windowed; HQ choosing all-time is a deliberate divergence.
   - Recommendation: **all-time** to match mockup math and the headline KPI. Document the divergence in the SUMMARY.

2. **Status dot thresholds — confirm `<5 / 5–8 / >8 min`?**
   - What we know: legend at the bottom of the leaderboard says exactly those bands.
   - What's unclear: should they be DB-configurable (per `countries.row` SLA target) or fixed in code?
   - Recommendation: **fixed in DAL** for v1. The single 5-min SLA is already baked in elsewhere (Phase 4 gauge `<ReferenceLine y={300} />`). Per-country SLA targets can be added later without breaking the v1 view.

3. **Conversion Rate KPI window — all-time, 30d, or today?**
   - What we know: mockup tile shows 14.2% with no window label.
   - What's unclear: a value of 14.2% suggests a meaningful denominator — today's conversion rate at 12 active countries is volatile.
   - Recommendation: **all-time** (matches the all-time leads tile). 30d is the better business view; flag for William's call at the visual checkpoint.

4. **Should "Conversion Rate" KPI tile carry a delta vs prior period?**
   - What we know: mockup shows ↑ 2.1%.
   - What's unclear: what's the comparator? Same window prior, or yesterday-vs-today, or 30d-vs-30d?
   - Recommendation: omit the delta for v1; ship the static value. Add delta in v2 once we know the comparator. (`group_today_stats` already returns just the rate; the DAL doesn't have to commit yet.)

5. **Sidebar nav items in mockup: Countries / Services / Reports**
   - What we know: only "Overview" is highlighted active in the mockup.
   - What's unclear: are Countries / Services / Reports Phase 5 deliverables or future placeholders?
   - Recommendation: **placeholders, like Phase 1 did for the country-admin sidebar.** Each link goes to a "Phase 6" stub page. Document this in the SUMMARY so the user isn't surprised they don't work yet.
</open_questions>

<sources>
## Sources

### Primary (HIGH confidence)
- Internal codebase — `packages/supabase/migrations/00006_views.sql` (country_leaderboard, speed_to_lead_daily, lead_source_mix already shipped for HQ)
- Internal codebase — `packages/supabase/migrations/00008_realtime_broadcast.sql` (per-country broadcast pattern + RLS policy structure to mirror for group:all)
- Internal codebase — `packages/supabase/migrations/00011_country_admin.sql` (per-country views are RLS-keyed not JWT-pinned, work for HQ as-is)
- Internal codebase — `apps/web/app/(hq)/layout.tsx` (requireRole + HQShell already wired in Phase 1)
- Internal codebase — `apps/web/app/(country-admin)/[country]/_components/kpi-strip.tsx` (Phase 4 04-04-locked ring-around-card pattern; Phase 5 mirrors verbatim)
- `.planning/STATE.md` "Key decisions still in force" — locked patterns: two-source today/range stats split, listening on `event:'*'`, security_invoker pattern, hq_admin RLS bypass, JWT custom claim names (`user_role`, `country_code`)
- `.planning/phases/04-country-admin-dashboard/04-RESEARCH.md` — Phase 4's research already noted (line 233) that `parseRangeParams` should be promoted before Phase 5
- `docs/design-reference/hq-dashboard.html` — visual contract

### Secondary (MEDIUM confidence)
- Mockup interpretation of windows (today vs all-time) — inferred from the math (sum of bars = headline KPI). Confirm at visual checkpoint.

### Tertiary (LOW confidence — needs validation)
- Status dot threshold band exact boundaries (`<5` / `5–8` / `>8`) — taken from the legend in the mockup, but the user may want different bands.
- Whether "Countries / Services / Reports" sidebar links should resolve to anything or remain placeholders.

### External docs
- Skipped intentionally. Same stack as Phase 4 (Recharts, Supabase realtime broadcast, Next.js App Router) which was researched two days ago. Re-fetching docs would not surface new information.
</sources>

<metadata>
## Metadata

**Research scope:**
- Internal codebase audit for Phase 5 dependencies
- Mockup analysis (`hq-dashboard.html`)
- Cross-reference with locked patterns from STATE.md and 04-RESEARCH.md
- Identified the *new* SQL surface (2 views + 1 RPC + 1 trigger + 1 policy)
- Identified the *novel* UX decisions (status dot bucket source, drill-in route, group:all topic)

**Confidence breakdown:**
- Standard stack: HIGH — fully inherited from Phase 4
- Architecture patterns: HIGH — three of four are direct mirrors of established patterns; the fourth (group:all topic) is a 10-line addition to Phase 2's broadcast model
- Pitfalls: HIGH — drawn from Phase 3/4 production lessons (JWT NULL, event:'*' subscription, RLS keying)
- Code examples: HIGH — taken from current codebase shape
- Open questions: MEDIUM — five user-facing decisions need confirmation at the visual checkpoint

**Research date:** 2026-05-04
**Valid until:** 2026-06-04 (30 days; stack is stable)
</metadata>

---

*Phase: 05-hq-overview*
*Research completed: 2026-05-04*
*Ready for planning: yes*
