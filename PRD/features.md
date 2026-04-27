# Features

Three dashboards. Each section uses MoSCoW: **M** = must-have for launch, **S** = should-have, **C** = could-have, **W** = won't-have-this-engagement.

## 1. Sales Rep Call Queue (`(sales-rep)/[country]/queue`)

The simplest, highest-leverage screen. One job: tell the rep who to call next.

| Feature | Priority | Notes |
|---------|----------|-------|
| Prioritised call queue | M | Sorted by SLA risk first, then age. Colour-coded: red >5min, amber 2-5min, green <2min, grey contacted |
| Lead detail panel | M | Click row → contact, source form, country, message, timestamp, "Call now" button |
| Call outcome capture | M | After "Call now": modal with Connected / No-answer / Callback / Qualified / Won / Lost (+ reason). Reuse `CallOutcomeModal` from AMA |
| Schedule callback | M | Date+time picker; lead reappears in queue at that time |
| Filter by service | S | Dropdown: General Contact, Starlink, Broadband, etc. |
| Today's stats strip | S | "You: 14 called · 3 qualified · avg response 4m12s" |
| Bulk actions | C | Select multiple → assign to me, mark unreachable |
| Voice notes per call | W | Future |

## 2. Country Admin Dashboard (`(country-admin)/[country]`)

For the in-country sales manager. Live view of their team and pipeline.

| Feature | Priority | Notes |
|---------|----------|-------|
| KPI strip (top) | M | Total leads (today / week / month), avg response time, qualified count, conversion %, lost count. `MetricCard` from AMA |
| Lead pipeline (funnel) | M | New → Contacted → Qualified → Converted → Lost. `StatusPipeline` |
| Speed-to-lead chart | M | Last 30 days trend, area chart. Highlight days breaching 5-min target |
| Agent performance table | M | Rep, leads handled, avg response, qualified, conversion %. Striped kiosk table |
| Lead source breakdown | M | Horizontal bar chart by form type. `HorizontalBarChart` |
| Lead list (all, filterable) | M | Search, filter by status / source / agent / date. Same striped kiosk table |
| Lead reassignment | S | Admin can move a lead from one rep to another |
| Export CSV | S | Filtered list → download |
| SLA breach alerts | S | Email or in-app alert when lead unanswered >5 min |
| Goal setting per agent | C | Manual targets, progress shown |
| Audit log | C | Who did what when |

## 3. HQ Overview Dashboard (`(hq)/`)

For Paratus Group leadership. Single pane across all active countries (12 at v1, expanding to 15 as coming-soon countries activate).

| Feature | Priority | Notes |
|---------|----------|-------|
| Group KPI strip | M | Total leads (today / week / month), group avg response, group conversion, total qualified |
| Country leaderboard | M | Sorted by conversion or volume; green/amber/red status dot. `HorizontalBarChart` + sparkline per row |
| Group pipeline chart | M | Aggregated funnel across all countries |
| Group speed-to-lead trend | M | Area chart, last 30 days, group avg with country band |
| Lead-source mix | M | Which forms are driving volume across the group |
| Country detail drill-in | M | Click a country → its admin dashboard (read-only for HQ) |
| Service performance | S | Conversion by service type group-wide (Starlink vs. Broadband vs. Carrier) |
| Date range picker | S | Compare today / 7d / 30d / 90d, with WoW / MoM deltas |
| Export PDF report | C | Weekly / monthly snapshot for board reports — defer unless asked |
| Anomaly highlights | C | "Mozambique conversion dropped 40% this week" — defer |

## Cross-Cutting Features

| Feature | Priority | Notes |
|---------|----------|-------|
| Auth (email + password, magic-link optional) | M | Supabase Auth. Country admins assigned country in JWT |
| Role-based routing | M | Middleware redirects based on `app_metadata.role` and `app_metadata.country_code` |
| Realtime updates | M | New lead appears in agent queue without page refresh (Supabase realtime) |
| Mobile responsive | M | Sales rep queue must work on phone — agents are mobile-first |
| Dark mode | C | Tokens already support it; default is light per AMA precedent |
| i18n (FR / PT for francophone / lusophone countries) | C | Defer; English-first for launch |
| Audit log of admin actions | S | Reassignments, role changes |

## Future Enhancements (out of scope this engagement, captured for the retainer)
- Agent gamification (badges, weekly leaderboards, streaks)
- AI lead scoring (probability-of-conversion at lead arrival)
- WhatsApp / SMS auto-acknowledgement on lead arrival
- AI summarisation of call notes into structured outcomes
- New funnel onboarding self-serve (admin can add a new form type without dev work)
