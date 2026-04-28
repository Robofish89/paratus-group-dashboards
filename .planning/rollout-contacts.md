# Paratus Group — User Provisioning Contacts

Reference list of people to provision as `country_admin` / `agent` / `hq_admin` users in production. Sourced from William @ Brainstorm Projects. Used in Phase 7 (Rollout) for user creation + role assignment.

> **Status as of 2026-04-28:** 2 of 12 active countries provided. 10 active countries + 3 coming-soon countries still pending. Group Sales / HQ contacts received as **names only** — emails still needed.

## Active countries

### Eswatini (SZ)
| Person | Email | Role |
|---|---|---|
| Sandile Masuku | sandile.masuku@paratus.co.sz | `agent` (also flagged as Sales Manager — confirm whether also `country_admin`) |
| Anele Dlamini | anele.dlamini@paratus.co.sz | `agent` + `country_admin` (William listed under both Sales contacts and Admin) |
| Sandile Dlamini | sandile.dlamini@paratus.co.sz | `agent` |

### Kenya (KE)
| Person | Email | Role |
|---|---|---|
| Joyce Gachuhi | joyce.gachuhi@paratus.ke | `agent` + `country_admin` (Sales Manager + listed as Admin) |
| Emmaculate Mulinge | Emmaculate.mulinge@paratus.ke | `agent` |
| Vitalis Odhiambo | vitalis.odhiambo@paratus.ke | `agent` |

### Still pending from William

10 active countries — no contacts received yet:

- [ ] Angola (AO)
- [ ] Botswana (BW)
- [ ] DRC (CD)
- [ ] Mozambique (MZ) — **pilot country**, urgent
- [ ] Namibia (NA)
- [ ] Rwanda (RW)
- [ ] South Africa (ZA)
- [ ] Tanzania (TZ)
- [ ] Uganda (UG)
- [ ] Zambia (ZM)

3 coming-soon countries — staged but not user-provisioned at v1 launch:

- [ ] Lesotho (LS)
- [ ] Malawi (MW)
- [ ] Zimbabwe (ZW)

## Group-level

### Group Sales (cross-country sales view? — confirm with William)
| Person | Email | Role |
|---|---|---|
| Martin Cox | _email pending_ | `agent` + `country_admin` (listed under Sales contacts and Admin) |
| Thas Pillay | _email pending_ | `agent` |
| Stephen Petersen | _email pending_ | `agent` |

### HQ Contacts → `hq_admin`
| Person | Email | Role |
|---|---|---|
| Miles October | _email pending_ | `hq_admin` |
| Deborah Matthews | _email pending_ | `hq_admin` |
| Faren van Rooyen | _email pending_ | `hq_admin` |
| Martin Cox | _email pending_ | `hq_admin` (also appears in Group Sales — same person, both roles?) |

## Open questions for William

1. **Eswatini admin** — Anele Dlamini listed as both sales contact AND admin. Confirm intent: dual role (`agent` + `country_admin`) or admin-only?
2. **Kenya admin** — same pattern, Joyce Gachuhi as both. Confirm.
3. **"Group Sales"** — is this a separate role, or are these three people HQ-level sales managers? Our schema has `hq_admin` / `country_admin` / `agent`. If they need cross-country sales-rep visibility (queue across multiple countries), the schema may need a 4th role or a `country_code = 'GROUP'` convention.
4. **Emails for Group + HQ contacts** — please send.
5. **Mozambique (pilot)** — need contacts ASAP since MZ is the pilot country for Phase 6 UAT.
6. **10 missing active countries** — full sales + admin contact list per country.
7. **Martin Cox** — appears in both Group Sales (admin) and HQ Contacts. Single user with both `country_admin` (or whatever group-level becomes) AND `hq_admin`? Schema currently allows only one `user_role` per user — needs design decision.

## Provisioning notes (for Phase 7)

- Country admin per country has both `country_admin` role AND access to call queue (so they can demo the agent flow). Schema decision: a `country_admin` user can read all leads in their country; whether they appear in the agent queue rotation is a Phase 2/7 decision.
- No login emails should be sent at provisioning time — we'll batch invite via Supabase Auth admin API once Phase 7 cutover is scheduled with William.
- Emails listed are corporate (`@paratus.co.sz`, `@paratus.ke`) — confirm Paratus's IT can receive password-reset emails on these domains, or whether we need to use a separate notifications-only email per user.
