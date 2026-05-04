# Playwright E2E suite

Phase 3 + Phase 4 golden-path tests that drive the live dev server over real
HTTP. Local-dev only for v1; CI wiring deferred to Phase 6.

## Prereqs

- `npm run dev` must be running on **port 3012** (the apps/web `dev` script
  pins this — `next dev --turbopack -p 3012`).
- `apps/web/.env.local` must include `E2E_AUTH_ENABLED=true` so the
  `/api/e2e-login` bridge accepts requests. The bridge is hard-gated behind
  this flag AND `NODE_ENV !== 'production'`, so production never exposes
  it.
- The seeded test users live in the live Supabase project (see
  `test-support/helpers.ts` — `TEST_USERS`).
- `SUPABASE_SERVICE_ROLE_KEY` and `PARATUS_INGEST_SECRET` must be in
  `.env.local` for fixture seeding / teardown.

## Run

From `apps/web/`:

```sh
# All specs:
npm run e2e

# A single spec (recommended while iterating):
npx playwright test e2e/country-admin-golden-path.spec.ts

# A single test inside a spec:
npx playwright test e2e/country-admin-golden-path.spec.ts -g "CSV export"
```

Playwright runs with `workers: 1` and `fullyParallel: false` because the
specs share the live dev server — see `apps/web/playwright.config.ts`.

## Specs

- `sales-rep-golden-path.spec.ts` — Phase 3 plan 03-04: tab labels,
  converted golden path, no-answer x3 → Follow-ups tab.
- `country-admin-golden-path.spec.ts` — Phase 4 plan 04-04: overview
  render, range URL contract, reassign + audit, CSV export, cross-tenant
  defensive.
