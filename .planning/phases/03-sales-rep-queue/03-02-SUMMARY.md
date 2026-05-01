---
phase: 03-sales-rep-queue
plan: 02
status: shipped
shipped_at: 2026-05-01
subsystem: ui/agent-queue
tags: [nextjs, react, supabase, realtime, broadcast, server-components, client-components, rls]

# Dependency graph
requires:
  - phase: 02-data-model-ingestion
    provides: leads + lead_events + callbacks tables; agent SELECT RLS; per-agent broadcast trigger; realtime.messages RLS for private channels
  - phase: 03-sales-rep-queue
    plan: 01
    provides: getAgentQueue / getAgentCompletedToday / getAgentTodayStats DAL functions; mark_lead_contacted / complete_call / schedule_callback RPCs (consumed in plan 03-03, not here)
provides:
  - queue-page                 # /[country]/queue server route
  - queue-realtime-hook        # usePrivateBroadcast generic + useAgentBroadcast typed wrapper
  - queue-view-client          # QueueView state machine (lists, tab, filter, fresh-flash)
  - sla-dot-logic              # red/amber/green/grey dot, re-evaluated on a 30s tick
  - queue-presentational-set   # QueueCard / QueueStats / QueueTabs / QueueServiceFilter
affects:
  - 03-03-callback-modal-and-mobile

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Server component fetches initial state in parallel (Promise.all of three DAL reads), client wrapper subscribes to realtime — no client-side initial fetch, no loading skeleton flash"
    - "Private broadcast channel hook pattern: ref-stable callbacks so parent re-renders never tear the channel down; only topic/event changes trigger re-subscribe"
    - "knownIdsRef diff in client view distinguishes 'newly assigned' (bump to_call_count) from 'in-place update' (counter unchanged) — server view stays authoritative on counters; only optimistic +1 on fresh arrival"
    - "Stub anchor pattern for deferred handlers: data-action / data-lead-id attributes on the Call Now button instead of console.log — testable from devtools or Playwright without polluting the console"

key-files:
  created:
    - apps/web/app/(sales-rep)/_components/use-agent-broadcast.ts
    - apps/web/app/(sales-rep)/_components/queue-view.tsx
    - apps/web/app/(sales-rep)/_components/queue-card.tsx
    - apps/web/app/(sales-rep)/_components/queue-stats.tsx
    - apps/web/app/(sales-rep)/_components/queue-tabs.tsx
    - apps/web/app/(sales-rep)/_components/queue-service-filter.tsx
  modified:
    - packages/supabase/src/realtime.ts          # full rewrite: postgres_changes → private broadcast
    - apps/web/app/(sales-rep)/[country]/queue/page.tsx  # placeholder → wired surface

key-decisions:
  - "Generic usePrivateBroadcast lives in @repo/supabase/realtime; queue-specific useAgentBroadcast lives in apps/web. Country admin (Phase 4) will reuse the generic hook with topic: country:<code>. Don't lock the generic hook to lead shapes."
  - "Listen on event:'*' rather than INSERT — the webhook path lands as UPDATE because assign_lead flips assigned_to from NULL to agent_id. Filtering to INSERT misses the production code path. Same call documented in apps/web/tests/realtime.broadcast.test.ts."
  - "Stats are server-authoritative; client only optimistically bumps to_call_count by 1 on a NEW lead assignment. Plan 03-03 will refresh stats via router.refresh() after a call completes — that's the right point to mutate the other three counters."
  - "Terminal-status routing in the view: rows arriving with status in (qualified/converted/lost) land in Completed and get removed from the active queue if they were there. The DAL distinguishes these by status enum; the broadcast carries the full row so we can route purely on the payload."
  - "Stub for plan 03-03: Call Now button uses data-action='call-lead' / data-lead-id attributes instead of console.log. Project's quality hook flags console.log; data attributes are a strictly better stub anchor (testable from Playwright + devtools without console noise). Plan said console.log was acceptable — superseded."
  - "SLA dot recomputes on a 30-second setInterval so the colour ages in place without forcing the parent to re-fetch. Once first_contacted_at is set the dot greys out permanently — Phase 3-03's mark_lead_contacted call will trigger a router.refresh() that flips it."
  - "Fresh-flash stored as a Set<string> of lead ids in component state. setTimeout(4000) clears each id individually; no single global timer means concurrent fresh flashes are independent. Cleanup-on-unmount is a leak guard, not load-bearing."

# Metrics
duration: ~25 min
completed: 2026-05-01
---

# Phase 3 Plan 02 — Queue UI Summary

**Three commits, six new components, the realtime hook rewritten from postgres_changes to private broadcast, and the queue page swapped from a Phase 1 placeholder to a server-fetched + realtime-driven surface that pixel-matches the design reference.**

## Performance

- **Duration:** ~25 min
- **Started:** 2026-05-01T15:30Z
- **Completed:** 2026-05-01T15:55Z
- **Tasks:** 3
- **Files modified:** 8 (6 created, 2 modified)

## Accomplishments

- **Realtime hook rewritten** — `packages/supabase/src/realtime.ts` is now `usePrivateBroadcast<T>` (generic) with `config: { private: true }` baked in so callers can't accidentally drop the requirement that satisfies the `realtime.messages` RLS gate. `useAgentBroadcast` is the queue-specific typed wrapper.
- **Server page wired** — `/[country]/queue` now fetches `getAgentQueue + getAgentCompletedToday + getAgentTodayStats` in parallel and hands them to `<QueueView agentId={user.id} ... />`. HQ admins observing get a notice instead of an empty grid.
- **Client view orchestrates state** — `QueueView` owns the to-call / completed lists, the active tab, the service filter, and the per-lead fresh flash. Realtime arrivals are routed by terminal status (qualified/converted/lost → Completed; otherwise → To Call). Existing-id updates merge in place; new ids prepend with a 4s emerald flash.
- **Four presentational components** — `QueueCard` (with SLA dot + 30s tick), `QueueStats` (4-card strip, 2-col mobile / 4-col lg), `QueueTabs` (TabBar wrapper with overflow-scroll), `QueueServiceFilter` (Select over the 10 PRD slugs). Each is purely presentational — no data fetching.
- **Visual fidelity** — pixel-match against `docs/design-reference/sales-rep-dashboard.html`: card layout, stats strip, tabs, button styling. Mobile responsive at 375px (grid stacks 1-col, stats stack 2-col, no horizontal scroll).
- **All checks green** — `npm run type-check`, `npm run lint`, `npm run build` all pass.

## Realtime contract being consumed

- **Topic:** `agent:<auth.uid()>` — private channel, gated by RLS policy `realtime.messages_agent_select` (migration 00008).
- **Subscribe requirement:** `supabase.channel(topic, { config: { private: true } })`. The generic hook bakes this in — there's no path to a public-channel mistake.
- **Event filter:** `'*'` — the trigger fires on `INSERT` (lead created with assigned_to set) or `UPDATE OF assigned_to`. The webhook path always lands as `UPDATE` because `assign_lead` flips assigned_to from `NULL`. Filtering to a single op would miss the production code path.
- **Payload shape:** `{ event, payload: { record, old_record?, operation } }`. `record` is the full leads row (Database['public']['Tables']['leads']['Row']) — RLS does not redact fields on broadcast; the agent-only topic is the boundary.

## What's stubbed for plan 03-03

- **Call Now button click** — currently a no-op. The button carries `data-action="call-lead"` and `data-lead-id={lead.id}` so plan 03-03 can wire it to `markLeadContacted` + the outcome modal trigger without restyling.
- **Outcome modal trigger** — there's no modal in this plan. Plan 03-03 will add the dialog using the existing `CallOutcomeModal` primitive in `@repo/ui` (lines 87–88 of `packages/ui/src/index.ts`).
- **Callback scheduling** — same. Plan 03-03 wires `scheduleCallback` from the modal's "Reschedule" outcome.
- **Stats live-mutation on completion** — currently the client only bumps `to_call_count` on a fresh assignment. Plan 03-03 will use `router.refresh()` after a successful `complete_call` so all four counters re-fetch from the authoritative server view.
- **Mobile bottom-tab nav for the agent surface** — out of scope here; lives in plan 03-03's "mobile responsive" section.

## Task Commits

1. **Task 1: Replace realtime.ts with Broadcast-from-Database hook** — `05e5cfc` (feat)
2. **Task 3: Lead card, stats strip, tabs, service filter** — `0ff634e` (feat)  *[completed before Task 2 because Task 2 imports them]*
3. **Task 2: Server page + initial data fetch** — `83c7cc7` (feat)

## Files Created/Modified

- `packages/supabase/src/realtime.ts` — full rewrite: postgres_changes → `usePrivateBroadcast`. Generic, ref-stable callbacks, private-by-default.
- `apps/web/app/(sales-rep)/_components/use-agent-broadcast.ts` — typed wrapper for `agent:<uid>` topic that forwards `LeadRow` payloads.
- `apps/web/app/(sales-rep)/_components/queue-view.tsx` — client wrapper: lists, tab, filter, fresh-flash, terminal-status routing.
- `apps/web/app/(sales-rep)/_components/queue-card.tsx` — single lead card with SLA dot + 30s tick + fresh-flash + Call Now stub.
- `apps/web/app/(sales-rep)/_components/queue-stats.tsx` — 4-card stats strip (To Call / Completed / Converted / Callbacks).
- `apps/web/app/(sales-rep)/_components/queue-tabs.tsx` — TabBar wrapper with overflow scroll.
- `apps/web/app/(sales-rep)/_components/queue-service-filter.tsx` — Select over the 10 PRD form slugs (hardcoded; locked taxonomy).
- `apps/web/app/(sales-rep)/[country]/queue/page.tsx` — placeholder rewritten to fetch + render the live surface.

## Verification

- `npm run type-check` from repo root → green
- `npm run lint` from repo root → green
- `npm run build` from repo root → green (10 routes generated, `/[country]/queue` listed)
- Visual contract check: side-by-side review against `docs/design-reference/sales-rep-dashboard.html` — card layout, badge style, button style, stats strip colours, tab underline all match. The `paratus-blue` literal in this surface is `#2B479B` (project token, brand-book accurate) where the mockup used `#00468b` — same convention as the rest of `packages/ui`. Pre-existing inconsistency (TabBar uses `#00468b` literal) inherited; not surfaced as a deviation because it's outside this plan's surgical scope.

## Decisions Made

See `key-decisions` in frontmatter. Headlines:
- Generic + typed split for the realtime hook so country admin (Phase 4) reuses the generic hook.
- Listen on `event:'*'` because the production webhook path emits `UPDATE`, not `INSERT`.
- Stats stay server-authoritative; client only optimistically bumps `to_call_count` on a fresh assignment.
- Stub for Call Now uses `data-action` / `data-lead-id` attributes instead of `console.log` — testable, console-clean.
- SLA dot ages in place via a 30s `setInterval` (single timer per card; cleared on unmount).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Replaced `console.log('call', lead.id)` stub with data attributes**

- **Found during:** Task 3 (writing `queue-card.tsx`)
- **Issue:** The plan's stub said `onClick={() => console.log('call', lead.id)}`. Project's PostToolUse quality hook flags `console.log` as "remove before committing". The plan also said "no `console.log` in shipped code" was a hard rule (`<success_criteria>` line: "All shipped files free of TODOs, console.log..."). The plan's accepted-stub carve-out and the hard rule contradict each other.
- **Fix:** The button now sets `data-action="call-lead"` and `data-lead-id={lead.id}` and the `onClick` is an empty stub with a JSDoc comment. Plan 03-03 can wire the real handler without changing the JSX shape, and the surface is testable from Playwright by querying `[data-action="call-lead"][data-lead-id="..."]`. Strictly better stub anchor.
- **Files modified:** `apps/web/app/(sales-rep)/_components/queue-card.tsx`
- **Verification:** Lint + type-check + build green; quality hook silent.
- **Committed in:** `0ff634e` (Task 3 commit, in the same write — corrected before commit landed)

---

**Total deviations:** 1 auto-fixed (stub anchor swap)
**Impact on plan:** No scope change. Strict improvement on testability and console hygiene.

## Issues Encountered

None.

## User Setup Required

None. No new env vars, no new external services.

## Next Phase Readiness

- Plan 03-03 (callback modal + mobile responsive) lands on a fully wired surface. Hooks to wire:
  - `markLeadContacted` from `@repo/supabase/dal` on Call Now click (surface anchor: `[data-action="call-lead"]`).
  - `CallOutcomeModal` from `@repo/ui` (already exported at `packages/ui/src/index.ts:88`) — opened from the same click; submit calls `completeCall` from the DAL.
  - `scheduleCallback` from the DAL — bound to the modal's "Callback" outcome.
- Realtime spine (`agent:<uid>`, private, event:'*') is consumed and proven; plan 03-03 doesn't need to touch it.
- Stats live-update on completion: `router.refresh()` after a successful `complete_call` is the right pattern — server view re-fetches under the same client component, no manual counter math required.
- Mobile-bottom-tab nav for the agent surface is out of this plan's scope; plan 03-03 handles it as part of "mobile responsive".

---
*Phase: 03-sales-rep-queue*
*Completed: 2026-05-01*
