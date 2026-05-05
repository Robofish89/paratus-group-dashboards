# Sales Rep — onboarding one-pager

**Audience:** sales reps working a single country's queue.
**Where you live:** `/<country>/queue` — the page you land on after signing in.

## What this screen is for

This is the page where the day's leads land. New form submissions appear in **My Leads → To Call** within seconds. You work each lead by clicking **Call**, then recording what happened. The page tracks how fast you get to a lead, how many you finish, and how many you convert — those numbers feed the country admin's dashboard, so the only thing you need to do is keep working the cards in front of you.

## First three things to do

1. Open **My Leads** (the default tab) and look at the top card under **To Call**. That's the lead with the most time on the clock. Click **Call** to ring the contact.
2. After the call, pick the outcome on the same card: **Converted**, **Lost**, **Callback**, or **No answer**. The card disappears from To Call and the counters update.
3. Open the **Follow-ups** tab. Anything you couldn't reach the first time sits here so you can chase it later. The Date range picker (top-right) controls only the stat tiles — your queue always shows everything outstanding.

## Common questions

**Why did a lead disappear from my queue?**
You marked it Converted or Lost, or another rep was assigned to it (rare — usually only when an admin reassigns). Look in the **Done** tab for finished work and the **Follow-ups** tab for anything you marked No answer or Callback.

**What does Follow-ups mean?**
A lead lands in Follow-ups when you press No answer or Callback. It stays there forever until you reach the contact and finish the call (Converted or Lost). The system never auto-closes a follow-up — you keep the lead.

**The counters at the top show different totals than my tab counts. Why?**
The four tiles use the date range selector. The tabs always show your live queue (today + outstanding). If you set the range to "This week" the tiles widen, but the tabs don't move.

**A lead's phone number is wrong. What do I do?**
Mark the lead as **Lost** and pick "Bad data" as the reason. The country admin sees that in the Lost reasons breakdown and chases the form-side fix.

**I called and nobody picked up. Should I press Lost?**
No — press **No answer**. The lead moves to Follow-ups. After three No-answer attempts the lead stays in Follow-ups but is flagged so the admin can decide whether to retire it.

**Can I change my mind about an outcome?**
No. Outcomes are final and the audit log records who pressed what. If you fat-fingered, message your country admin.

**I see a red ribbon on a card. What does it mean?**
The first response is overdue (over 5 minutes since the form landed). Take it next.

## Who to ask for help

1. Use the in-app **?** link (bottom-left of the sidebar) to re-open this page.
2. Ping your country admin — they can reassign, audit a lead, or escalate.
3. Country admin escalates to William @ Brainstorm Projects (`william@brainstormprojects.co`) for product questions, and to DigimountAI support (`support@digimountai.com`) for outages or bugs.
4. If the dashboard is fully down, your country admin opens [`docs/RUNBOOK.md`](../RUNBOOK.md) and follows section 3.

## Walkthroughs

- **First action (≤ 90 s):** _Recording will be added during pilot cutover_
- **Full flow (≤ 4 min):** _Recording will be added during pilot cutover_

Index of recorded walkthroughs: [`loom-links.md`](./loom-links.md)
