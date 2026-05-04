# Phase 4: Country Admin Dashboard — Research

**Researched:** 2026-05-04
**Domain:** Admin analytics dashboard on top of an existing Next.js 16 + Supabase + Tailwind v4 + AMA-mirrored design system
**Confidence:** HIGH

<research_summary>
## Summary

Phase 4 builds the country-admin surface defined by `docs/design-reference/country-admin-dashboard.html`: five stat cards, a Leads-by-Service horizontal bar chart, a Lead-Status-Pipeline funnel, a Sales-Rep performance table, and a Speed-to-Lead gauge + 7-day sparkline — plus a filterable lead list with reassignment and a CSV export. The mockup is already explicit and matches primitives (`MetricCard`, `StatusPipeline`, `HorizontalBarChart`, `Table`) that are **already shipped** in `packages/ui/src/components/`.

This is **not a niche/complex domain** — by the research-phase workflow's own skip criteria, most of Phase 4 is "Standard web dev (auth, CRUD, REST APIs)" + "Well-known patterns" + "Commodity features Claude handles well." Phases 1–3 already locked the realtime, RLS, Zod-DAL, RPC-with-JWT-guard, date-range, and CSV-import patterns. The honest research questions are narrow:

1. **Recharts** — first chart library in this repo (apps/web has zero chart deps today). The AMA companion repo already pins `recharts ^3.8.1` and ships a verified `LineChart` precedent. The mockup's "Speed to Lead" sparkline maps cleanly to a Recharts `AreaChart` + `ReferenceLine` (5-min target).
2. **CSV export from a Route Handler** — `papaparse ^5.5.3` is already a dep (used by the importer). `Papa.unparse` is the symmetric pattern, runtime=`nodejs`, country-locked by the cookie session's RLS on the read.
3. **Per-agent aggregation queries** — five new aggregations (KPI strip with yesterday compare, leads-by-service, status pipeline, agent performance, speed-to-lead percentile + 7-day series). All read from `leads`/`lead_events`. Patterns: `security_invoker = true` views for live-tile reads, SECURITY DEFINER RPCs (`country_stats_in_range`, `agent_performance_in_range`, `speed_to_lead_series`) for range-aware reads, mirroring Phase 3's `agent_stats_in_range` shape.
4. **Reassignment RPC** — new `reassign_lead(lead_id, to_agent_id)` SECURITY DEFINER, EXECUTE-granted to `authenticated`, gated `(jwt.role IN ('country_admin','hq_admin')) AND (jwt.country_code = leads.country_code) AND (target agent's country_code = leads.country_code)`, emits `lead_events(type='reassigned')`. Same shape as Phase 3 queue RPCs.

**Primary recommendation:** Install `recharts ^3.8.1` in `apps/web`. Mirror AMA's `TrendChart` pattern at `~/Projects/ama-amacare-stats-callback-dashboard/apps/admin/app/(dashboard)/stats/components/trend-chart.tsx` for the speed-to-lead chart (swap `LineChart` → `AreaChart` with `ReferenceLine y={300}` for the 5-minute target — units are seconds in the DB). Reuse every Phase 3 primitive — stats split, range picker, RPC pattern, broadcast hook, DAL + Zod. Migration `00011` adds two views + three RPCs. CSV export uses `Papa.unparse` in a Route Handler with the cookie session (RLS does the country lock). Custom-SVG the gauge ring (mockup shows it as raw SVG — 12 lines, no library).
</research_summary>

<standard_stack>
## Standard Stack

### Core (already locked, no install needed)
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| next | ^16.2.2 | App Router, Server Components, Route Handlers | Locked, Phase 1 |
| react / react-dom | ^19.2.4 | UI runtime | Locked, Phase 1 |
| @supabase/ssr | (via `@repo/supabase`) | Cookie session for Server Components and Route Handlers | Locked, Phase 1 |
| tailwindcss | ^4.2.2 | Styling, theme tokens at `packages/ui/src/styles/theme.css` | Locked, Phase 1 |
| `@repo/ui` | workspace | `MetricCard`, `StatusPipeline`, `HorizontalBarChart`, `Table`, `Badge`, `Skeleton`, `Dialog` — all already shipped | Locked, Phase 1 |
| `@repo/supabase` | workspace | DAL + Zod + `usePrivateBroadcast<T>` + `parseRangeParams` | Locked, Phase 3 |
| zod | (transitive via `@repo/supabase`) | Input validation in Route Handlers + RPC arg shapes | Locked, Phase 2 |
| papaparse | ^5.5.3 | CSV parse (importer) + CSV unparse (export, this phase) | Locked, Phase 2 |
| lucide-react | ^1.7.0 | Icons | Locked, Phase 1 |

### New for Phase 4
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| recharts | ^3.8.1 | Speed-to-Lead AreaChart + ReferenceLine, 7-day sparkline | Same major + version pinned in the AMA companion repo (`apps/admin/package.json`); verified via Context7 (`/recharts/recharts`, source reputation: High, current `v3.x`); component model fits React 19; `ResponsiveContainer` solves the responsive sizing problem the mockup needs |

### Supporting (already in repo)
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `@playwright/test` | ^1.59.1 | Country-admin golden-path E2E | The reassignment + export flow |
| `vitest` | ^3.2.4 | Aggregation RPC + Zod schema tests | Mirror Phase 3 test pattern |
| `dotenv` | ^17.4.2 | Test env loading | Already wired in `apps/web/tests/setup.ts` |

### Alternatives Considered
| Instead of Recharts | Could Use | Tradeoff |
|---------------------|-----------|----------|
| Recharts | visx (Airbnb), nivo, Tremor, Chart.js, Apache ECharts | All capable; Recharts wins because (a) AMA companion repo already uses it, (b) declarative React-component API matches the rest of the codebase, (c) no extra wrapper layer. visx is more flexible but requires you to draw axes by hand. Tremor is opinionated dashboard primitives but pulls a lot of design-system that conflicts with our AMA tokens. ECharts requires imperative init. **Don't reconsider — pick what matches AMA precedent.** |
| Recharts | Hand-rolled SVG (mockup approach) | The mockup's sparkline is hand-rolled SVG (240×48 viewBox, 7 fixed data points). For 7 days that works. For the responsive parent + dynamic data length + axis labels + tooltip on hover, it's faster and more correct to use Recharts than to hand-roll the same. **Use Recharts for the chart card, custom SVG for the gauge ring (mockup is already minimal SVG for the gauge).** |

**Installation (single command, single workspace):**
```bash
npm install recharts@^3.8.1 --workspace=apps/web
```

No type-package install needed — `recharts` ships its own types. No SSR wrapper needed — Recharts components are client-only (use `"use client"` on the component file, same as AMA's `TrendChart`).
</standard_stack>

<architecture_patterns>
## Architecture Patterns

### Recommended File Layout (mirrors Phase 3 conventions)
```
apps/web/app/(country-admin)/[country]/
├── page.tsx                           # Server Component — fetches all data, renders cards/charts
├── _components/
│   ├── kpi-strip.tsx                  # 5 stat cards (server-rendered numbers, client wrapper for live broadcast)
│   ├── leads-by-service-card.tsx      # uses @repo/ui HorizontalBarChart
│   ├── status-pipeline-card.tsx       # uses @repo/ui StatusPipeline
│   ├── agent-performance-table.tsx    # client component with row-click drill-in
│   ├── speed-to-lead-card.tsx         # gauge SVG + Recharts AreaChart sparkline
│   ├── lead-list.tsx                  # filterable + paginated, with reassign action
│   ├── reassign-dialog.tsx            # @repo/ui Dialog with agent select
│   ├── use-country-broadcast.tsx      # typed wrapper around usePrivateBroadcast<T>
│   └── speed-to-lead-chart.tsx        # "use client" — Recharts AreaChart wrapper
├── leads/
│   └── page.tsx                       # standalone lead list page (sidebar Leads link)
└── _lib/
    └── csv.ts                         # papaparse unparse helper

apps/web/app/api/country-admin/
├── reassign/route.ts                  # POST { lead_id, to_agent_id } → reassign_lead RPC
└── export-leads/route.ts              # GET ?status=&from=&to=&q=&service= → CSV stream
```

### Pattern 1 — Two-Source Stats Split (carry forward from Phase 3)
**What:** Live tiles read from a `security_invoker = true` view; range-aware tiles read from a SECURITY DEFINER RPC. Both fetched server-side on every render; client only optimistically bumps a single counter on broadcast.

**When to use:** Every tile in the KPI strip. Today's "Total Leads / New Today / Contacted / Converted" tiles read from a new `country_today_stats` view (mirrors `agent_today_stats`). Range-aware extras (when the user selects "this week" / custom) read from `country_stats_in_range(from, to)` RPC.

**Example (locked precedent at `apps/web/app/(sales-rep)/[country]/queue/page.tsx`):**
```typescript
const [todayStats, rangeStats] = await Promise.all([
  getCountryTodayStats(country),                              // live view
  getCountryStatsInRange(country, range.from, range.to),      // range RPC
]);
```

### Pattern 2 — Recharts AreaChart for Speed-to-Lead (verified pattern)
**What:** `AreaChart` with `ReferenceLine` at the 5-minute / 300-second target. Wrapped in `ResponsiveContainer width="100%" height={N}`. Client component only.

**When to use:** Speed-to-Lead 7-day sparkline. Shape — one row per day, value is "median or P75 seconds-to-first-contact for that day's leads."

**Verified example (Context7 + AMA TrendChart fusion):**
```typescript
"use client";
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ReferenceLine, ResponsiveContainer } from "recharts";

interface SpeedDataPoint { day: string; median_seconds: number }

export function SpeedToLeadChart({ data }: { data: SpeedDataPoint[] }) {
  return (
    <ResponsiveContainer width="100%" height={48}>
      <AreaChart data={data} margin={{ top: 4, right: 0, left: 0, bottom: 0 }}>
        <defs>
          <linearGradient id="speedGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#10b981" stopOpacity={0.15} />
            <stop offset="100%" stopColor="#10b981" stopOpacity={0.02} />
          </linearGradient>
        </defs>
        {/* ReferenceLine y={300} marks the 5-min target threshold */}
        <ReferenceLine y={300} stroke="#94a3b8" strokeDasharray="3 3" />
        <Area
          type="monotone"
          dataKey="median_seconds"
          stroke="#10b981"
          strokeWidth={2.5}
          fill="url(#speedGrad)"
          dot={{ r: 3, fill: "#10b981" }}
          activeDot={{ r: 4, stroke: "white", strokeWidth: 2 }}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}
```
*Sources: Context7 `/recharts/recharts` AreaChart + ReferenceLine docs; AMA precedent at `apps/admin/app/(dashboard)/stats/components/trend-chart.tsx` (LineChart variant).*

### Pattern 3 — SECURITY DEFINER RPC with JWT Country Guard (Phase 3 precedent)
**What:** Every write/aggregation RPC is `SECURITY DEFINER`, gates `(SELECT auth.jwt() ->> 'country_code') = <target country_code>` and the role-allowed set inside the function, EXECUTE-granted to `authenticated` (not `service_role` — that's only `ingest_lead`).

**When to use:** `reassign_lead`, `country_stats_in_range`, `agent_performance_in_range`, `speed_to_lead_series`.

**Example shape (mirrors `mark_lead_contacted` in migration 00009):**
```sql
CREATE OR REPLACE FUNCTION public.reassign_lead(p_lead_id uuid, p_to_agent_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_jwt_country text := (SELECT auth.jwt() ->> 'country_code');
  v_jwt_role    text := (SELECT auth.jwt() ->> 'role');
  v_lead_country text;
  v_target_country text;
BEGIN
  IF v_jwt_role NOT IN ('country_admin','hq_admin') THEN
    RAISE EXCEPTION 'forbidden_role' USING ERRCODE = '42501';
  END IF;
  SELECT country_code INTO v_lead_country FROM leads WHERE id = p_lead_id;
  SELECT country_code INTO v_target_country FROM user_roles WHERE user_id = p_to_agent_id;
  IF v_lead_country IS NULL OR v_target_country IS NULL THEN
    RAISE EXCEPTION 'not_found' USING ERRCODE = 'P0002';
  END IF;
  IF v_jwt_role = 'country_admin' AND v_jwt_country <> v_lead_country THEN
    RAISE EXCEPTION 'forbidden_country' USING ERRCODE = '42501';
  END IF;
  IF v_target_country <> v_lead_country THEN
    RAISE EXCEPTION 'cross_country_assignment' USING ERRCODE = '42501';
  END IF;
  UPDATE leads SET assigned_to = p_to_agent_id, updated_at = now() WHERE id = p_lead_id;
  INSERT INTO lead_events (lead_id, actor_id, type, payload, country_code)
  VALUES (p_lead_id, (SELECT auth.uid()), 'reassigned', jsonb_build_object('to_agent_id', p_to_agent_id), v_lead_country);
END;
$$;
REVOKE ALL ON FUNCTION public.reassign_lead(uuid, uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.reassign_lead(uuid, uuid) TO authenticated;
```

### Pattern 4 — CSV Export from a Route Handler
**What:** Server route handler reads filtered leads via the cookie-authed Supabase client (RLS does the country lock — country_admin sees only their country, hq_admin sees all), maps rows to plain JSON, `Papa.unparse(rows)`, returns with `Content-Type: text/csv` + `Content-Disposition: attachment`. Runtime `nodejs` (matches importer).

**When to use:** `/api/country-admin/export-leads?from=&to=&status=&service=&q=`.

**Example shape:**
```typescript
import Papa from "papaparse";
import { createClient } from "@repo/supabase/server";
export const runtime = "nodejs";

export async function GET(req: Request) {
  const supabase = await createClient();
  const { data, error } = await supabase.from("leads").select("...").match(filters);
  if (error) return new Response(error.message, { status: 500 });
  const csv = Papa.unparse(data);
  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="leads-${country}-${range}.csv"`,
    },
  });
}
```

### Pattern 5 — Country Broadcast (Phase 3 carry-forward)
**What:** `usePrivateBroadcast<T>({ topic: \`country:\${country_code}\`, event: '*' })` to bump the live tiles when a new lead arrives. The broadcast trigger from Phase 2 already emits to this topic.

**When to use:** Top of the page on the country-admin dashboard. Optimistic +1 on the "New Today" / "Total Leads" tiles; everything else stays server-authoritative until the next `router.refresh()`.

**Example (typed wrapper, identical shape to `apps/web/app/(sales-rep)/_components/use-agent-broadcast.ts`):**
```typescript
"use client";
import { usePrivateBroadcast } from "@repo/supabase/realtime";
import type { Database } from "@repo/supabase/types";

type LeadRow = Database["public"]["Tables"]["leads"]["Row"];
export function useCountryBroadcast(country_code: string, onChange: (row: LeadRow) => void) {
  return usePrivateBroadcast<LeadRow>({
    topic: `country:${country_code}`,
    event: "*",
    onMessage: onChange,
  });
}
```

### Pattern 6 — URL-stateful Date Range (Phase 3 carry-forward)
**What:** `?range=today|week|month|custom&from=&to=`. `parseRangeParams` helper at `apps/web/app/(sales-rep)/_lib/date-range.ts` is the single source of truth — extract to `apps/web/app/_lib/date-range.ts` (workspace-shared) before Phase 5 reuses it again.

### Anti-Patterns to Avoid
- **Don't fetch chart data in a `useEffect`** — fetch server-side in the page Server Component, pass props down. Loading shimmer comes from React Suspense + Skeleton, not client fetch state.
- **Don't compute aggregations in TypeScript** — push them into Postgres views or RPCs. `agent_today_stats` is the precedent; for ranges use a SECURITY DEFINER RPC.
- **Don't add a chart wrapper component** — let pages import Recharts components directly with `"use client"` at the top of each chart file. Wrappers proliferate fast and hide what the chart actually does.
- **Don't hand-roll the CSV** — `Papa.unparse(rows)` handles quoting, embedded commas, embedded newlines, BOM. The importer already proved papaparse works in this repo.
- **Don't put reassignment logic in the route handler** — the route is a thin wrapper over `reassign_lead(...)`. Atomicity, validation, audit (`lead_events(type='reassigned')`) all happen in the SQL function, same as `mark_lead_contacted`.
- **Don't filter by `country_code` in the client** — RLS does the lock. Country admins literally cannot read other countries' rows from the cookie session, so a client-side filter is dead code.
</architecture_patterns>

<dont_hand_roll>
## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Speed-to-lead 7-day sparkline | Custom SVG with hard-coded `<polyline>` (mockup approach) | Recharts `AreaChart` + `ResponsiveContainer` + `ReferenceLine` | Mockup hard-codes 7 fixed points; real data is dynamic length, needs hover tooltip, needs threshold line, needs responsive sizing. Recharts gives all of that for ~30 lines vs. ~100 of `useMemo` + `d=` path math. |
| CSV serialisation | Custom string concat with manual quote escaping | `Papa.unparse(rows)` (already a dep) | Quotes, commas, newlines, multi-byte, RFC 4180 conformance — papaparse is the source of truth. The importer (Phase 2 plan 02-05) already proved `papaparse` round-trips cleanly. Same library, symmetric API. |
| Country-scoped lead aggregation | TypeScript reduce over `select * from leads` | New views + RPCs in migration 00011 | Postgres aggregates 1M rows in <50ms; Node aggregates 1M rows in seconds and ships them all over the wire. Phase 2's `agent_today_stats` view is the locked precedent. |
| Per-row reassignment in client | Two `update` queries from the client + a manual event insert | Single `reassign_lead(lead_id, to_agent_id)` RPC, EXECUTE-granted to `authenticated` | Atomicity (status update + event insert in one tx), authorisation (JWT role + country guard inside the function), audit log (`lead_events(type='reassigned')`) all in SQL. Phase 3's queue RPCs are the locked pattern. |
| Real-time country tile bump | New WebSocket connection or `postgres_changes` subscriber | `usePrivateBroadcast<T>({ topic: \`country:\${code}\` })` — already shipped | Phase 2 plan 02-03 wired the broadcast trigger; Phase 3 plan 03-02 wired the hook. New countries are 1 line of code (the `topic` string). |
| Date range parsing | New `useSearchParams` + `Date.parse` per page | Re-use `parseRangeParams` from `apps/web/app/(sales-rep)/_lib/date-range.ts` (extract to a shared `_lib/`) | Already locked single source of truth per Phase 3 STATE.md decision. |
| Stats with "vs yesterday" delta | Two parallel queries + manual diff | Single SQL view with two CTEs computing `today` and `yesterday` and a derived `delta_pct` column | Server returns the final shape; client just renders. Avoids divide-by-zero handling in TS. |
| Filterable lead list pagination | Custom offset/limit + manual page count | Supabase JS `.range(from, to)` + `count: 'exact'` (or `'estimated'`) | One query gets rows + total count; standard pattern. |
| Gauge ring (87% on-target) | A library | Custom SVG (mockup already shows it) | Mockup is already 12 lines of `<circle stroke-dasharray>`. A library would be heavier than the actual implementation. **The gauge is the one place to keep custom SVG.** |

**Key insight:** Phase 4 has *one* genuinely new tool (Recharts) and a wide reuse surface from Phases 1–3. The pattern is "mirror what worked, do not invent." Every tile/chart/RPC has a Phase 3 precedent — find it, copy its shape, swap the table.
</dont_hand_roll>

<common_pitfalls>
## Common Pitfalls

### Pitfall 1: Recharts SSR Hydration Warnings
**What goes wrong:** A `LineChart` / `AreaChart` rendered without `"use client"` on the file produces a hydration mismatch — Recharts measures DOM during render to compute axes.
**Why it happens:** Recharts is a client-only lib (uses `ResizeObserver` internally for `ResponsiveContainer`).
**How to avoid:** `"use client"` at the top of every file that imports from `recharts`. Wrap `<ResponsiveContainer>` in a fixed-height parent (e.g. `<div className="h-12">…</div>`) — without an explicit height the container collapses to 0 on first paint.
**Warning signs:** "Hydration failed because the server rendered text didn't match the client" pointing at SVG; or charts that render once, then disappear, then re-render.

### Pitfall 2: Recharts `ResponsiveContainer` 0×0 Sizing
**What goes wrong:** Chart renders empty when its parent has no explicit height (Tailwind's `h-full` is "100% of parent" — and the parent's parent is `auto`, so the cascade is undefined).
**Why it happens:** `ResponsiveContainer` reads the parent's measured box; if parent has no height, container is 0.
**How to avoid:** Give the chart's *direct parent* a fixed height (`h-12`, `h-48`) or a fixed aspect ratio. Mockup sparkline is `48px` tall — set `h-12` on the wrapper.
**Warning signs:** Chart renders but is invisible; DevTools shows the `<svg>` is `0×0`.

### Pitfall 3: `first_contacted_at` is NULL for fresh leads
**What goes wrong:** Speed-to-lead aggregation `EXTRACT(EPOCH FROM first_contacted_at - created_at)` is NULL for any lead the agent hasn't called yet, which silently drops them from `AVG()` — looking artificially fast.
**Why it happens:** Phase 2 schema sets `first_contacted_at` only when `mark_lead_contacted` runs; new + lost-without-contact leads have NULL.
**How to avoid:** Decide a policy and document it. Recommend: speed-to-lead aggregations operate over leads where `first_contacted_at IS NOT NULL`. The "% on target" tile is `count(*) FILTER (WHERE first_contacted_at - created_at <= interval '5 minutes') / count(*) FILTER (WHERE first_contacted_at IS NOT NULL)`. Document this in the view's SQL comment.
**Warning signs:** "Avg response 1.2 min" the day a country onboards (because the only contacted leads were testing).

### Pitfall 4: Aggregation Views Bypass RLS
**What goes wrong:** A new aggregation view without `security_invoker = true` runs as the view's owner (postgres) and shows hq numbers to a country admin.
**Why it happens:** Postgres default for views is `SECURITY DEFINER` (owner privileges).
**How to avoid:** Every view this phase creates MUST end with `WITH (security_invoker = true)`. Phase 2's view migration is the precedent (00006_views.sql). RLS on the underlying `leads` table then does the filtering.
**Warning signs:** A country admin sees the same numbers as an HQ admin during integration tests.

### Pitfall 5: Reassignment Across Countries Silently Succeeds
**What goes wrong:** Country admin in NA reassigns a lead to an agent in BW; the lead's `country_code` doesn't change but `assigned_to` now points at a user the lead's RLS would never let through.
**Why it happens:** SECURITY DEFINER bypasses RLS, so without an explicit cross-country guard inside `reassign_lead`, the function will happily write a cross-country pointer.
**How to avoid:** Inside `reassign_lead`, lookup the target agent's `country_code` from `user_roles` and reject if it doesn't match the lead's `country_code` (see Pattern 3 SQL). This is the same defence-in-depth shape as Phase 3's `mark_lead_contacted`.
**Warning signs:** Lead assigned to a user who can't read it (queue won't show it; agent can never call it; lead sits forever).

### Pitfall 6: CSV Export Reads from Service Role
**What goes wrong:** Developer copies the CSV importer's `createAdminClient()` into the export route, bypassing RLS and shipping every country's leads to anyone with the route URL.
**Why it happens:** Importer uses service-role because `ingest_lead` is service-role-only. Export has no such requirement.
**How to avoid:** Export uses the *cookie-authed* `createClient()` from `@repo/supabase/server`. RLS does the country lock for free. Validate the caller's role (must be `country_admin` or `hq_admin`) but the row filter is RLS, not handler logic.
**Warning signs:** A country admin's CSV contains rows where `country_code` ≠ their own.

### Pitfall 7: Recharts Tooltip + Tailwind v4 Token Collision
**What goes wrong:** Recharts's default tooltip uses inline `style` attributes that don't pick up theme tokens, leading to a light tooltip in a dark mode that looks "off-brand."
**Why it happens:** Recharts inlines styles; Tailwind v4 oklch tokens live in CSS variables.
**How to avoid:** Pass an explicit `contentStyle={{ borderRadius: 8, border: "1px solid #e2e8f0", fontSize: 12 }}` matching AMA's TrendChart. Defer dark-mode tokens to Phase 6 (project is light-mode-only at v1 per CLAUDE.md).
**Warning signs:** Tooltip looks generic-grey instead of brand-aware.

### Pitfall 8: Pagination With Realtime Insertion
**What goes wrong:** Lead list is paginated; live broadcast inserts a new row at the top; pagination indices shift; "next page" skips a row.
**Why it happens:** Offset-based pagination + concurrent inserts is a known bug class.
**How to avoid:** Either (a) pause realtime on this view (the dashboard tiles still pop, just not the table), or (b) use cursor-pagination keyed on `created_at DESC, id DESC`. Recommend (a) for v1 — agent reassignment is rare enough that the admin can refresh.
**Warning signs:** Admin reports "I keep seeing the same lead twice when I page."
</common_pitfalls>

<code_examples>
## Code Examples

### Speed-to-Lead AreaChart (composed from Context7 + AMA precedent)
```typescript
// apps/web/app/(country-admin)/[country]/_components/speed-to-lead-chart.tsx
"use client";
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ReferenceLine, ResponsiveContainer
} from "recharts";

interface SpeedDataPoint {
  day: string;            // ISO date "2026-05-04"
  median_seconds: number; // median seconds to first contact for that day
}

export function SpeedToLeadChart({ data }: { data: SpeedDataPoint[] }) {
  if (data.length === 0) {
    return <div className="h-12 flex items-center text-xs text-slate-400">No data</div>;
  }
  return (
    <div className="h-12">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 4, right: 0, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id="speedGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#10b981" stopOpacity={0.15} />
              <stop offset="100%" stopColor="#10b981" stopOpacity={0.02} />
            </linearGradient>
          </defs>
          <ReferenceLine y={300} stroke="#94a3b8" strokeDasharray="3 3" />
          <Area
            type="monotone"
            dataKey="median_seconds"
            stroke="#10b981"
            strokeWidth={2.5}
            fill="url(#speedGrad)"
            dot={{ r: 3, fill: "#10b981" }}
            activeDot={{ r: 4, stroke: "white", strokeWidth: 2 }}
            isAnimationActive={false}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
```
*Sources: Context7 `/recharts/recharts` AreaChart + ResponsiveContainer + ReferenceLine; AMA `apps/admin/app/(dashboard)/stats/components/trend-chart.tsx`.*

### Reassignment Route Handler
```typescript
// apps/web/app/api/country-admin/reassign/route.ts
import { z } from "zod";
import { createClient } from "@repo/supabase/server";

export const runtime = "nodejs";

const Body = z.object({
  lead_id: z.string().uuid(),
  to_agent_id: z.string().uuid(),
});

export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json());
  if (!parsed.success) return new Response("invalid_payload", { status: 400 });

  const supabase = await createClient();
  const { error } = await supabase.rpc("reassign_lead", {
    p_lead_id: parsed.data.lead_id,
    p_to_agent_id: parsed.data.to_agent_id,
  });
  if (error) {
    if (error.code === "42501") return new Response("forbidden", { status: 403 });
    if (error.code === "P0002") return new Response("not_found", { status: 404 });
    return new Response(error.message, { status: 500 });
  }
  return new Response(null, { status: 204 });
}
```

### CSV Export Route Handler
```typescript
// apps/web/app/api/country-admin/export-leads/route.ts
import Papa from "papaparse";
import { createClient } from "@repo/supabase/server";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const from = url.searchParams.get("from");
  const to   = url.searchParams.get("to");
  const supabase = await createClient();

  // RLS ensures country_admin only sees their country, hq_admin sees all
  let q = supabase
    .from("leads")
    .select("id, full_name, email, phone_e164, status, form_id, assigned_to, country_code, created_at, first_contacted_at, lost_reason")
    .order("created_at", { ascending: false });
  if (from) q = q.gte("created_at", from);
  if (to)   q = q.lte("created_at", to);

  const { data, error } = await q;
  if (error) return new Response(error.message, { status: 500 });

  const csv = Papa.unparse(data ?? []);
  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="leads-${from ?? "all"}-to-${to ?? "now"}.csv"`,
    },
  });
}
```
</code_examples>

<sota_updates>
## State of the Art (2024-2026)

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Recharts 2.x JS-only | Recharts 3.x with first-class TS types + React 18+/19 support | 2024–2025 | TypeScript types now ship in-package; no `@types/recharts` install needed |
| Charts in `useEffect` fetch | Server Components fetch + pass props to `"use client"` chart leaf | Next.js 13+ | Locked in Phase 1; this just continues the pattern |
| Postgres `postgres_changes` realtime | Broadcast-from-Database via `realtime.messages` + RLS-policied private channels | Supabase 2024 GA | Already locked Phase 2 |
| `next.config.middleware` | `proxy` (Next 16 rename) | Next 16 | Phase 6 carry-over per STATE.md — **don't touch in Phase 4** |

**New tools/patterns to consider (deferred):**
- **`shadcn/ui` Charts** — wraps Recharts with token-aware styling. Could replace inline Recharts but adds another design-system layer; AMA precedent doesn't use it. **Defer.**
- **Tremor v3** — opinionated dashboard primitives. Visually different from AMA. **Reject for this project.**

**Deprecated/outdated:**
- **Recharts 1.x patterns (no `ResponsiveContainer`, hard-coded width/height)** — don't follow Stack Overflow answers older than 2023.
- **`@types/recharts`** — no longer needed; types ship in-package since 2.x.
</sota_updates>

<open_questions>
## Open Questions

1. **Speed-to-lead percentile choice (median vs P75 vs avg)?**
   - What we know: industry "5-minute response = 10× conversion" is the headline; the gauge tile shows "% leads contacted within 5 min" which is unambiguous (a count). The 7-day sparkline needs *one* number per day.
   - What's unclear: Whether the sparkline tracks median seconds (robust to outliers), P75 (catches the long tail), or avg (matches the stat-card "Avg Response Time 4.2 min").
   - Recommendation: Use **median** in the sparkline to resist outliers (a single 6-hour-old lead getting its first call would explode the avg); use **avg** in the stat card because that's the mockup's literal label. Document the asymmetry in the view's SQL comment. Decision can move to /gsd:plan-phase if you have a strong opinion.

2. **"vs yesterday" delta on 5 stat cards — calendar-day or rolling-24h?**
   - What we know: mockup shows "+12% vs yesterday" on the New Today tile.
   - What's unclear: "Yesterday" — calendar-day (00:00–23:59 in country TZ) or rolling 24h (now-48h to now-24h).
   - Recommendation: Calendar-day in the country's time zone (`countries.timezone` column already exists from Phase 2 reference data). Cleaner mental model for the admin and consistent with `agent_today_stats`'s "today" cutoff (also calendar-day).

3. **Pagination cursor or offset for the lead list?**
   - Pitfall 8 above. Defaulting to offset for v1; document the cursor migration as a Phase 6 carry-over if pagination ever becomes hot.

4. **Should HQ admin land on a country-admin page or be redirected to HQ Overview?**
   - Phase 4 builds the country-admin page. Phase 5 builds HQ Overview. Today's middleware routes `hq_admin` to `(hq)/`.
   - For Phase 4, the country-admin page should accept `[country]` from any country (HQ admin can drill in via Phase 5's leaderboard later). Country-admin is locked to their own country by RLS regardless.
</open_questions>

<sources>
## Sources

### Primary (HIGH confidence)
- **Context7 `/recharts/recharts`** — AreaChart with linear gradients, ReferenceLine, ResponsiveContainer (Source Reputation: High; Benchmark: 89.27; v3.x current).
- **`packages/ui/src/components/horizontal-bar-chart.tsx`** — locked precedent in this repo.
- **`packages/ui/src/components/status-pipeline.tsx`** — locked precedent in this repo.
- **`packages/ui/src/components/metric-card.tsx`** — locked precedent.
- **`apps/web/app/api/leads/import-csv/route.ts`** — locked papaparse + service-role precedent (read it once before mirroring; **don't copy the service-role client**, see Pitfall 6).
- **`apps/web/app/(sales-rep)/[country]/queue/page.tsx`** — locked two-source-stats + range-picker + broadcast pattern.
- **`apps/web/app/(sales-rep)/_lib/date-range.ts`** — locked `parseRangeParams`.
- **`packages/supabase/src/realtime.ts` (`usePrivateBroadcast`)** — locked.
- **Migration `00009_queue_rpcs.sql`** — locked SECURITY DEFINER + JWT guard pattern.
- **`docs/design-reference/country-admin-dashboard.html`** — visual contract (494 lines).
- **`PRD/features.md` + `PRD/milestones.md` + `PRD/technical.md`** — explicitly names Recharts.

### Secondary (HIGH confidence — independent project precedent)
- **AMA companion repo at `~/Projects/ama-amacare-stats-callback-dashboard/apps/admin`** — pins `recharts ^3.8.1`; live `LineChart` precedent at `app/(dashboard)/stats/components/trend-chart.tsx`.

### Tertiary (LOW — none — every claim cross-verified)
- N/A.
</sources>

<metadata>
## Metadata

**Research scope:**
- Core technology: Recharts (chart library). No other new libraries.
- Ecosystem: papaparse (already a dep), Recharts (new), Phase 3 carry-overs (DAL, RPC, broadcast, range).
- Patterns: AreaChart with threshold reference line; SECURITY DEFINER reassignment RPC; CSV export from cookie-authed handler; aggregation views with security_invoker; two-source stats split.
- Pitfalls: Recharts SSR, ResponsiveContainer sizing, NULL `first_contacted_at`, RLS-bypassing views, cross-country reassignment, service-role-on-export, Tooltip styling, paginated-with-realtime.

**Confidence breakdown:**
- Standard stack: HIGH — every component except Recharts already in repo; Recharts version pinned in AMA companion.
- Architecture: HIGH — every pattern has a Phase 1/2/3 precedent in this exact codebase.
- Pitfalls: HIGH — Recharts SSR + sizing are documented in Recharts issues; NULL handling, RLS, cross-country reassignment all have direct Phase 2/3 precedents.
- Code examples: HIGH — composed from Context7 docs + repo precedent.

**Research date:** 2026-05-04
**Valid until:** 2026-06-04 (30 days; Recharts 3.x is stable, repo patterns locked).
</metadata>

---

*Phase: 04-country-admin-dashboard*
*Research completed: 2026-05-04*
*Ready for planning: yes*
