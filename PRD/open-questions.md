# Open Questions

Items that need a decision from William / Paratus before locking. Each has a default we'll proceed with if not answered.

## High priority — answer before phase 2

| # | Question | Default if unanswered |
|---|----------|------------------------|
| 1 | **Lead ingestion path** — can paratus.africa forms POST directly to our webhook, or do we need to bridge from Google Sheets via n8n? | Build n8n bridge first (lower coordination cost), keep webhook endpoint ready |
| 2 | **Pilot country** — which country goes live first? | Mozambique (mid-volume, English-friendly admin contact, multiple form types) |
| 3 | **Coming-soon countries (Lesotho, Malawi, Zimbabwe)** — when does Paratus expect each to activate? Affects retainer scoping. | Seed as `coming_soon` at v1; flip individually via retainer when Paratus signals ready |
| 4 | **Existing leadsheet backfill** — do we import historical leads on day 1 or start fresh? | Start fresh; offer CSV import as a self-serve tool |
| 5 | **Auth** — magic link, password, or both? | Email + password, with admin-issued invites |

## Medium priority — answer before phase 5

| # | Question | Default if unanswered |
|---|----------|------------------------|
| 6 | **HQ role scope** — should HQ users be able to write (e.g. reassign across countries) or read-only? | Read-only on country data, write only on `users`/`countries`/`forms` reference data |
| 7 | **SLA target** — confirm 5 minutes is the target, or different per country / per service? | 5 minutes group-wide |
| 8 | **Lost reasons** — predefined list or free text? | Predefined list (unreachable, not-interested, price, competitor, no-budget, other+text) |
| 9 | **Reporting cadence** — does HQ want a weekly PDF emailed, or just live dashboard? | Live only for v1; PDF as a phase 7 add-on if requested |
| 10 | **Languages** — French / Portuguese for francophone / lusophone country admins? | English only for v1 |

## Low priority — answer before phase 7

| # | Question | Default if unanswered |
|---|----------|------------------------|
| 11 | **Domain** — subdomain on paratus.africa (e.g. `dashboards.paratus.africa`) or DigimountAI-hosted? | DigimountAI-hosted on temp domain until client provisions DNS |
| 12 | **SSO** — does Paratus use Google Workspace or Microsoft 365 for staff? Worth wiring SSO? | Defer; email + password sufficient for v1 |
| 13 | **Data retention** — how long do we keep lead data? | Indefinite for v1; revisit when GDPR/POPIA review happens |
| 14 | **Phone numbers** — capture + click-to-call for sales reps? Africa-wide formats? | Capture + `tel:` links; no integrated dialler |
| 15 | **Currency / value per lead** — track expected deal size for ROI calc? | Defer; not in v1 |

## To verify with William when meeting

- Confirm pricing terms (R30,000 build + R2,500/mo retainer) are signed
- Confirm pilot country, expected go-live date
- Confirm contact channel for blockers (Slack / WhatsApp / email)
- Confirm who at Paratus owns the relationship (sales director? CTO?)
- Confirm legal: NDA, data processing terms, hosting jurisdiction
- Confirm dedicated Google account email + handover plan (this account becomes the master for Supabase / Vercel / n8n / GitHub etc. and transfers to Paratus at completion)
