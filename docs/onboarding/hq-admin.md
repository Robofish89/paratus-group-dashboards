# HQ Admin — onboarding one-pager

**Audience:** Paratus Group HQ — the team responsible for sales performance across every active country.
**Where you live:** `/` — the group overview, plus drill-ins for each country.

## What this screen is for

The HQ overview shows you the whole group on one screen: every active country in the leaderboard, the group-wide KPIs at the top, and the speed-to-lead trend below. Use the country leaderboard's status dots to spot the country in trouble, click the country name to drop into that country's admin view, and use the same KPI vocabulary the country admins see so the conversation upstream and downstream is consistent.

## First three things to do

1. Read the **country leaderboard**. The dot next to each country's response time tells you the story: green is on target, amber is slipping, red is over the 5-minute mark. Sort by what you care about today — usually conversion rate or speed to lead.
2. Click into the worst-performing country (red dot). You land on that country's admin overview with full read access — drill into Agents to see which rep is dragging the median.
3. Open the speed-to-lead trend chart at the bottom. The red dashed line at 5 minutes is the target. Look for the country line that's been above it for more than a day — that's a structural problem, not a bad shift.

## Common questions

**Why is the "Avg Speed to Lead" tile green when half the leaderboard is red?**
The tile is a group average — large countries (high lead volume, fast response) drag the mean toward green. The leaderboard is the truth. Always look at the leaderboard before declaring victory.

**How is the status dot calculated?**
Below 5 minutes (300 seconds) median response time is green. Between 5 and 8 minutes (300–480s) is amber. Above 8 minutes — or no responses at all — is red. The exact thresholds live alongside the speed-to-lead reference line on the chart so the same numbers drive both visuals.

**A country is missing from the leaderboard. Where is it?**
Only countries marked **active** appear. Lesotho, Malawi, and Zimbabwe are seeded as **coming soon** and will appear automatically when their dashboards activate (no migration required).

**Can I reassign a lead between countries?**
Yes — only HQ can. Drill into the source country's Leads page and use Reassign; the dialog will let you pick any rep in any country. The audit log records the cross-country move and both country admins (source and target) see it in their audit trails.

**Where are the per-country drill-ins for "Service mix" and "Settings"?**
The sidebar has placeholders for those surfaces. They land in the post-pilot retainer scope — the Overview page covers everything in v1. Don't promise the link to anyone yet.

**My click on a country name dropped me into a country admin view. Did I lose my HQ session?**
No. Hit Overview in the sidebar to come back. HQ admins can view every country admin surface.

## Who to ask for help

1. Use the in-app **?** link (bottom-left of the sidebar) to re-open this page.
2. Ping William @ Brainstorm Projects (`william@brainstormprojects.co`) for product questions or country activations.
3. DigimountAI (`gerhard@digimountai.com`) for outages, bugs, or anything in [`docs/RUNBOOK.md`](../RUNBOOK.md).
4. For backup or restore questions, see [`docs/BACKUP_RESTORE.md`](../BACKUP_RESTORE.md).

## Walkthroughs

- **First action (≤ 90 s):** _Recording will be added during pilot cutover_
- **Full flow (≤ 4 min):** _Recording will be added during pilot cutover_

Index of recorded walkthroughs: [`loom-links.md`](./loom-links.md)
