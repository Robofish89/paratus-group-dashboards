# Country Admin — onboarding one-pager

**Audience:** the person responsible for one country's sales operation.
**Where you live:** `/<country>` — the country overview, plus drill-ins for Pipeline, Agents, Leads, and Audit.

## What this screen is for

The Overview is your daily readout for one country. The KPI strip across the top tells you how many leads landed today, how fast the team responded, what converted, and where the team sits against the 5-minute target. Below it, the funnel shows where leads are stuck, the leaderboard ranks your reps, and the speed-to-lead chart tracks the trend. From here you reassign leads, drill into individual reps, and pull a CSV when finance asks.

## First three things to do

1. Look at the **Avg Response Time** tile in the KPI strip. If the ring is red, the team is over the 5-minute target — open the Agents page and find the rep with the slowest median.
2. Open **Agents**. The leaderboard ranks every active rep by conversions and shows their speed-to-lead. Click a rep to see their queue and history.
3. Open **Leads** and use the search + filter bar to find a specific lead. Use **Reassign** on any row to move a lead between reps in this country (HQ moves leads across countries).

## Common questions

**Why does the "Converted" tile show a different number to the funnel?**
The KPI tile follows the date range picker; the funnel is always today. Set the range to Today and they will agree.

**Can I reassign a lead to a rep in another country?**
No. The Reassign dialog only lists reps in this country. Cross-country moves are HQ admin work — ping William (`william@brainstormprojects.co`) and they handle it from the HQ overview.

**The Agents page shows a rep with zero leads. Are they broken?**
They might be on leave, or the round-robin hasn't given them a lead today. Check the Audit page (filter by their name) — if they had leads earlier in the week and have been quiet today, that's a coverage problem worth raising with William.

**How do I get a CSV of today's leads?**
The Leads page has an **Export CSV** button (top-right). It exports whatever your filter set is showing — including search and date range — not the entire database.

**A lead is stuck in "New" — nobody has called it. What's wrong?**
Either no rep was online when it came in (round-robin needs an active assignee) or the assigned rep hasn't pressed Call yet. Reassign it to a rep you know is active.

**The Audit page is empty for a lead I'm sure was changed. Why?**
Audit only records changes made through the dashboard's write actions: Call, Outcome, Reassign, Callback, No-answer. Direct database edits don't appear (and shouldn't be happening).

**A rep tells me they pressed the wrong outcome. Can I undo it?**
No undo. Use the Audit page to record what they say happened and decide whether to re-create or reassign the lead.

## Who to ask for help

1. Use the in-app **?** link (bottom-left of the sidebar) to re-open this page.
2. Ping William @ Brainstorm Projects (`william@brainstormprojects.co`) for product questions, role changes, or new-rep onboarding.
3. DigimountAI (`gerhard@digimountai.com`) for outages or bugs.
4. For incidents, follow [`docs/RUNBOOK.md`](../RUNBOOK.md) section 3.

## Walkthroughs

- **First action (≤ 90 s):** _Recording will be added during pilot cutover_
- **Full flow (≤ 4 min):** _Recording will be added during pilot cutover_

Index of recorded walkthroughs: [`loom-links.md`](./loom-links.md)
