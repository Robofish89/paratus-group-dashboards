# Overview

> Standalone product for **Paratus Group**. Not Paratus Namibia, not AMA / AMA Care. Visual design is inherited for brand congruence; data, infra, auth, and ownership are independent and live under a dedicated Paratus Group Google account.

## One-line Pitch
Turn Paratus Group's 47-hour average lead response into minutes by giving every country a real-time call queue, every country admin a live conversion dashboard, and HQ a single pane of glass across all active markets.

## Markets

**Active for leads (v1 launch — 12 countries):**
Angola · Botswana · DRC · Eswatini · Kenya · Mozambique · Namibia · Rwanda · South Africa · Tanzania · Uganda · Zambia

**Coming soon (data model + flag ready, dashboards activated when Paratus is ready):**
Lesotho · Malawi · Zimbabwe

The HQ Overview is the 13th surface — a group-wide view across all active markets that expands automatically as coming-soon countries flip on.

## Problem

Today, leads from 10+ form types across paratus.africa land in 7+ Google Sheets, manually distributed by email to country sales teams. There is:

- **No unified view** — HQ has no idea how many leads came in yesterday, which country is converting, or where leads are stuck
- **No speed-to-lead tracking** — industry research: responding within 5 mins = 10× conversion vs. responding in an hour. Paratus's current average is ~47 hours
- **No prioritised call queue** — sales reps work from a sheet, no concept of urgency, no callback scheduling, no outcome capture
- **No accountability loop** — when a lead is lost, there's no record of why; when a country underperforms, no data to coach against

## Vision

A single, multi-tenant dashboard system where:
- A new lead from any of 10 form types on paratus.africa lands in the right country's queue within seconds
- Sales reps see a colour-coded queue: red = SLA breach (>5 min), amber = approaching, green = comfortable
- Every call captures an outcome (Connected / No-answer / Callback scheduled / Qualified / Won / Lost-with-reason)
- Country admins see live conversion funnels and agent leaderboards
- HQ sees a country leaderboard, group-wide pipeline, speed-to-lead trend, and where leads are leaking

## Audience

Three user types — same brand, same design language, very different jobs:

| Role | Where they live in the app | Primary job-to-be-done |
|------|----------------------------|------------------------|
| **Sales Rep / Agent** | `(sales-rep)/[country]/queue` | "Tell me who to call next, and capture what happened." |
| **Country Admin** | `(country-admin)/[country]` | "How is my country performing today, and which agents need help?" |
| **HQ Executive** | `(hq)/...` (no country scoping) | "Which countries are winning, where is conversion broken, and is speed-to-lead improving group-wide?" |

## Success Metrics

These are what the system should be optimised to improve — and what we'll track in the dashboards themselves.

| Metric | Baseline | Target (90 days post-launch) |
|--------|----------|------------------------------|
| Median time-to-first-contact | ~47 hrs | < 30 min |
| % of leads responded within 5 min | unknown | > 60% |
| Lead-to-qualified conversion | unknown | measured + benchmarked across countries |
| % of calls with outcome captured | 0% | > 90% |
| Active countries on the dashboard | 0 | 12 (15 once Lesotho / Malawi / Zimbabwe activate) |

## Value Proposition

For Paratus: 10× pipeline efficiency without hiring more sales staff, group-wide visibility for the first time.
For DigimountAI: R30,000 build + R2,500/mo retainer; foundation for follow-on work (gamification, AI lead scoring, WhatsApp follow-up agent).

## Out of Scope (this engagement)
- Agent gamification / leaderboards beyond simple ranking — flagged as future enhancement
- AI lead scoring / routing — future
- WhatsApp / SMS automated follow-up — future (but data model leaves room)
- CRM-style account/contact management — this is a lead pipeline, not a CRM
- Customer-facing portal — internal only
