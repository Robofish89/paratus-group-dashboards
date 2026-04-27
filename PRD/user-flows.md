# User Flows

Golden paths only. Edge cases live in implementation tickets.

## Flow A — Sales rep handles a new lead (the speed-to-lead loop)

Actor: Mozambique sales rep, Sarah.

1. A prospect submits the Starlink form on paratus.africa
2. Webhook ingests → `leads` row inserted with `country_code='MZ'`, `status='new'`, auto-assigned to Sarah by round-robin
3. Sarah's queue updates in realtime — new row at top, dot is green (just arrived)
4. After 2 minutes the dot turns amber; after 5 it turns red and admin gets an SLA breach alert
5. Sarah clicks the row → detail panel shows name, phone, message, Starlink interest level
6. Sarah clicks "Call now" → status flips to `contacted`, `first_contacted_at` stamped
7. Call ends → outcome modal: she selects "Qualified", adds note, presses Save
8. `lead_events` row inserted (`type='call'`, `outcome='qualified'`); `leads.status='qualified'`
9. Lead disappears from active queue, appears in her "Today" stats strip

## Flow B — Country admin reviews the day

Actor: Namibia country admin, Pedro.

1. Logs in → routed to `(country-admin)/NA`
2. KPI strip shows today's numbers vs. yesterday — conversion is down 15%
3. Sees agent performance table — one agent has 0 calls in 4 hours
4. Drills into that agent's queue (read-only) → sees 6 leads sitting in red
5. Reassigns those leads to a different rep with one click
6. Reviews speed-to-lead chart — yesterday breached target 3 times; clicks date to see which leads
7. Exports the week's lead list to CSV for a regional sales meeting

## Flow C — HQ executive does the Monday review

Actor: Paratus group sales director, Lwazi.

1. Logs in → routed to `(hq)`
2. Country leaderboard sorted by conversion — Botswana #1 (12.4% green), DRC last (3.1% red)
3. Group speed-to-lead trend shows improvement WoW
4. Clicks DRC → opens DRC's country admin dashboard read-only
5. Sees DRC has high lead volume but slow first-response — calls the DRC admin to coach
6. Back to HQ → service mix shows Starlink driving 40% of qualified leads — flags for marketing budget reallocation

## Flow D — New rep onboarded

Actor: Country admin (Pedro again).

1. From admin dashboard → Settings → Team → "Invite rep"
2. Enters name + email + role (`agent`)
3. Supabase invite email sent; on accept, JWT custom hook stamps `role='agent'`, `country_code='NA'`
4. Rep logs in → middleware routes to `(sales-rep)/NA/queue`
5. Round-robin assignment picks them up on the next lead

## Flow E — Lead falls through (the lost-reason loop)

1. Sarah calls a lead three times over two days, no answer each time
2. After third no-answer, she marks "Lost: unreachable"
3. `lead_events` records the three call attempts; `leads.status='lost'`, `lost_reason='unreachable'`
4. Country admin's Lost-reason chart updates → "unreachable" is the #1 cause this week
5. HQ rolls that up → group-wide "unreachable" trend; surface as a coaching opportunity

## Flow F — Realtime new-lead notification (mobile)

1. Sarah is on her phone, queue open
2. Lead arrives via webhook → Supabase realtime channel pushes `INSERT` event
3. Queue prepends new row with subtle highlight animation (slide-in)
4. Browser tab title updates to `(1) Paratus | Queue`
5. If push notifications enabled → optional native notification (phase 3+)
