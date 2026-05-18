# Elementor form inventory — captured 2026-05-18 from live WP Submissions

Source: `paratus.africa/wp-admin` → Elementor → Submissions → "All Forms" dropdown.
Account: Shannon's, Administrator. Code Snippets plugin present (install target for the signing snippet).

## Distinct Elementor form IDs (11) and the named contexts they appear as (17)

| Form ID   | Appears as (Submissions label)                                  | Maps to our slug (proposed)        |
|-----------|------------------------------------------------------------------|------------------------------------|
| `e9ad77c` | General Contact us                                               | `general-contact`                  |
| `06095a5` | Contact us                                                       | `general-contact`                  |
| `727b039` | General Contact us                                               | `general-contact`                  |
| `1449b78` | Data Center Services                                             | `data-centers`                     |
| `cda1b37` | Carrier services enquiry / Oneweb Satellite Service / Starlink   | `carrier-services` / `oneweb` / `starlink` — **by page URL** |
| `2c5fd13` | Starlink Satellite for Schools / Connect2Care / Paratus Essential Access | `starlink-for-schools` / `connect2care` / `essential-access` — **by page URL** |
| `ec2bdd9` | Data Center Services / Broadband Services / Satellite services    | `data-centers` / `broadband` / `satellite` — **by page URL** |
| `0613ec5` | Satellite services                                               | `satellite`                        |
| `71e30c8` | Business Enquire Form                                             | **UNMAPPED — no seeded slug**      |
| `4216a7c` | Cloud Services                                                   | **UNMAPPED — no seeded slug**      |
| `897e124` | Business connectivity                                             | **UNMAPPED — no seeded slug**      |

## Our 10 seeded slugs (the only values `/api/leads/ingest` accepts)

`general-contact, carrier-services, satellite, data-centers, broadband, oneweb,
starlink, essential-access, connect2care, starlink-for-schools`

## DESIGN CORRECTION (2026-05-18) — do not use the request_args filter / Webhook action

The handoff plan (add an Elementor "Webhook" action + rewrite it via the
`elementor_pro/forms/webhooks/request_args` filter) is **abandoned**. Reason:
General Contact (`e9ad77c`) **already has a Webhook action** (Actions After
Submit = Collect Submissions, Email, Webhook, Popup). Elementor allows one
Webhook action per form; the filter is global, so rewriting it would corrupt
the payload of Paratus's *existing* webhook integration = breaking their system.

**New approach:** one Code-Snippets PHP snippet hooking
`elementor_pro/forms/new_record` ( `function($record,$handler)` ). It fires
server-side after validation, independent of all Actions After Submit. The
snippet: guards to our 8 in-scope form IDs → reshapes fields → computes
HMAC-SHA256 with `PARATUS_INGEST_SECRET` → `wp_remote_post` to
`https://dashboards.paratus.africa/api/leads/ingest`. **Zero changes to any
form's actions. Existing Webhook/Email/Collect/Popup untouched.**

## Field detection (validated on e9ad77c)

Detect by field role, not hardcoded IDs: email field → `email`, tel/phone →
`phone`, textarea/"message" → `message`, full-name field → `name`. Whole raw
field set also passed as `raw_payload`.

## country_code resolution

- General Contact `e9ad77c`: from the **"Country or Group Site"** dropdown.
  Options map 1:1 to ISO: Angola→AO, Botswana→BW, DRC→CD, Eswatini→SZ,
  Kenya→KE, Malawi→MW, Mozambique→MZ, Namibia→NA, Rwanda→RW, South Africa→ZA,
  Tanzania→TZ, Uganda→UG, Zambia→ZM.
  - **DEFAULT = "Paratus Africa Group (Head Office)"** → maps to new **`HQ`**
    pseudo-tenant (decision 2026-05-18; flagged to Paratus, questions Q3).
  - Note: "Country code*" is a SEPARATE field (phone dialing code) — not geo.
- Service-page forms (`cda1b37`,`2c5fd13`,`ec2bdd9` etc.): country source TBD —
  inspect each; expect page-URL path segment (`/botswana/` → `BW`) where no
  country dropdown exists.

`form_slug` resolved by **(form_id, page-URL keyword)** since `cda1b37`,
`2c5fd13`, `ec2bdd9` are each reused across 3 service types.

## Open decision — RESOLVED 2026-05-18

`71e30c8` Business Enquire Form, `4216a7c` Cloud Services, `897e124` Business
connectivity → **left UN-WIRED** (out of pilot scope). They keep working as
today; not added to the dashboard. Logged for Paratus Group in
`.planning/questions-for-paratus-group.md` (Q1). Does not block the 8 mapped forms.

## RESOLVER SPEC (derived from CSV export, 2026-05-18) — this is the snippet contract

### form_slug — by (form_id, referrer path keyword)

| form_id  | rule |
|----------|------|
| `e9ad77c`,`06095a5` | `general-contact` |
| `727b039` | `general-contact` (only seen on `/form-test` — internal test form; pilot target) |
| `1449b78` | `data-centers` |
| `0613ec5` | `satellite` |
| `cda1b37` | referrer has `starlink`→`starlink`; `oneweb`→`oneweb`; `carrier`→`carrier-services` |
| `2c5fd13` | `paratus-essential-access`→`essential-access`; `starlink-for-schools`→`starlink-for-schools`; `starlink-for-clinics`→`connect2care` |
| `ec2bdd9` | `broadband`→`broadband`; `data-center`→`data-centers`; `satellite`→`satellite` |
| `71e30c8`,`4216a7c`,`897e124` | **NOT wired** (out of scope — Paratus Q1) |

### country_code — priority order

1. The form's country/recipient-email field value (titles: "Country or Group
   Site*", "Select Country", "Select Country*"). Its value is a **paratus email**;
   country is encoded in it:
   - `(?:info|starlink|sales)\.([a-z]{2})@paratus\.africa` → that 2-letter code uppercased
   - domain map: `paratus.ke`→KE · `paratus.co.rw`→RW · `paratus.co.sz`→SZ · `fast-congo.cd`→CD
   - `info@paratus.africa` / `sales@paratus.africa` / blank → **fall through to step 2/3**
2. Referrer path: first `/xx/` or `/<countryname>/` segment (e.g. `/namibia/`→NA).
   Build a name→ISO table for the 15 seeded countries.
3. Default → **`HQ`** (group pseudo-tenant, task #7).

Validate the resolved code is one of the 15 seeded ISO codes (+`HQ`); anything
else → `HQ` and log (don't drop the lead).

### field detection (by Elementor field type/title, not hardcoded ids)

- `name`  ← title contains "name" (full name / your name), not "company/organisation"
- `email` ← field type `email` (the lead's own email, NOT the recipient dropdown)
- `phone` ← field type `tel` OR title "phone number" (exclude "country code")
- `message` ← field type `textarea` OR title "message"
- everything → `raw_payload`

### existing Actions After Submit (e9ad77c, observed)

Collect Submissions, Email, **Webhook**, Popup — all left **untouched**.
Confirms the `new_record` approach (do NOT add/modify a Webhook action).
