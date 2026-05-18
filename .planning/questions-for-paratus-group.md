# Open questions for Paratus Group (via William / Shannon)

## Q1 — Three forms with no dashboard queue (raised 2026-05-18)

During form-side ingestion wiring we found three live Elementor forms that don't
map to any of the 10 agreed service types / agent queues:

- **Business Enquire Form** (`71e30c8`)
- **Cloud Services** (`4216a7c`)
- **Business connectivity** (`897e124`)

**Decision for now:** left **un-wired** — these forms keep working exactly as
today (their existing email/collect actions are untouched); their leads simply
do not flow into the new dashboard yet. No data lost, no behaviour changed.

**Need from Paratus Group:**
1. Are these in scope for the dashboard at all, or intentionally separate
   (e.g. handled by a different team / CRM)?
2. If in scope: should each get its own service queue (cloud-services /
   business-connectivity / business-enquiry), or fold into General Contact?
3. Who works these leads today, so we route to the right people?

---

## Q3 — "Paratus Africa Group (Head Office)" leads — who works them? (raised 2026-05-18)

The General Contact form's country dropdown **defaults to "Paratus Africa Group
(Head Office)"** (pre-selected → likely the most common submitted value). It is
not a country. **Decision:** we are adding an **HQ / Group queue** (pseudo-tenant)
so these leads are captured and routed group-level rather than lost or
mis-assigned to a country.

**Need from Paratus Group:**
1. Who should work HQ / Group-level General Contact leads (names + emails)?
2. Should "Head Office" stay the form default, or should the default be "—
   select —" to force a real country choice? (Changing the default reduces HQ
   volume; their call — we will not change their form without sign-off.)

---

## OBS-1 — Paratus's own Elementor Webhook action is broken (observed 2026-05-18)

While wiring our ingestion we observed that the **existing native Elementor
"Webhook" action** on the live forms returns "Webhook error" on submit (admin-
only notice; invisible to visitors). This affects **all** submissions, not just
our tests, and **predates our work** — we never added/edited any Webhook action
(our ingestion is a separate `new_record` hook).

Impact: no lead loss on Paratus's side — Collect Submissions still stores every
entry and the Email notification still fires. But whatever downstream that
Webhook action feeds (CRM / automation?) has likely been **missing leads for
some time**. Flag to William/Shannon: (a) where is that Webhook supposed to
deliver, (b) has anyone noticed missing leads there, (c) do they want it fixed
or is our dashboard now the system of record. Not blocking our integration.

---

## Q2 — Full user list per country (carried over, still outstanding)

Names + emails + roles per country (Mozambique first) for `provision-users.ts`.
Unblocks dashboard user provisioning. (Independent of the form wiring above.)
