# Roadmap

Seven phases. Maps 1:1 to `PRD/milestones.md`. Each phase produces a verifiable outcome before moving on.

| # | Phase | Duration | Outcome (verifiable) |
|---|-------|----------|----------------------|
| 1 | Foundation | ~1 week | Three placeholder pages render, branded sidebar, three test users land on the right page after login, deployed to Vercel |
| 2 | Data Model & Ingestion | ~1 week | POST to `/api/leads/ingest` creates a lead, fires events, realtime emits to assigned agent, cross-country RLS read returns 0 |
| 3 | Sales Rep Queue | ~1 week | Synthetic lead arrives → agent calls → outcome captured → lead exits queue → stats update — all without refresh, mobile works |
| 4 | Country Admin Dashboard | ~1 week | Country admin sees live KPIs, drills into agent, reassigns a stuck lead, exports CSV — matches mockup |
| 5 | HQ Overview | ~3-4 days | HQ sees country leaderboard, drills into worst country, returns — matches mockup |
| 6 | Production Hardening | ~3-4 days | Pilot country runs 48h with real leads, no incidents, security checklist passes |
| 7 | Rollout | ~3-4 days | All 12 active countries provisioned and live; 3 coming-soon countries seeded with flag; onboarding docs delivered; handover (Google account, repo, runbook) to client |

**Total:** ~5 weeks at solo-builder pace, fits within the 4–6 week quote commitment.

## Phase Gates — Boil the Ocean Standard

A phase is **complete** only when every one of these is true. There is no "phase N lite" — default is the complete phase.

- [ ] **Code shipped:** every checkbox in the phase's milestone done. No TODOs, no half-wired UI, no mock data on production paths, no `any` shortcuts, no `console.log` in shipped code.
- [ ] **Tests green:**
  - `npm run type-check` — no errors
  - `npm run lint` — clean
  - `npm run build` — production build succeeds
  - Phase-specific tests written **before or alongside** the feature (not after as cleanup): unit / integration / E2E as the phase calls for. RLS phases include explicit cross-tenant tests from the client SDK.
- [ ] **Docs updated:**
  - `PRD/` — if behaviour changed, the PRD reflects it
  - `STYLE_GUIDE.md` — if a UI primitive changed
  - `SECURITY_CHECKLIST.md` — if RLS / auth / secrets surface changed
  - `CREDENTIALS.md` — if a new integration was added
  - `.planning/PROJECT.md` "Validated" section gets the phase's bullet
  - `README.md` — if dev / build / deploy commands changed
- [ ] **Demo:** working flow runnable on `npm run dev`; short Loom-style walkthrough recorded for William
- [ ] **Security checklist re-run:** every applicable item in `SECURITY_CHECKLIST.md` passes
- [ ] **Visual fidelity check:** side-by-side vs. `docs/design-reference/` mockups for any dashboard-touching phase. Drift = not done.
- [ ] **Commit & tag:** `git tag phase-N-complete` on `main`
- [ ] **No dangling threads:** any five-minute tidy-up surfaced during the phase is closed before the tag — naming, formatting, missing types, half-finished JSDoc, dead imports.

The bar for "phase done" is the user's reaction — "holy shit, that's done." If the response is "yeah, looks fine," the phase isn't done; iterate until it is.

## Critical Path

Phases 1 → 2 → 3 are strictly sequential (each depends on the prior).
Phases 4 and 5 can partially parallelise — both depend on Phase 2/3 data, but the dashboards themselves are independent surfaces. If we have spare cycles in week 4, start Phase 5 design while Phase 4 is finishing.
Phase 6 must follow 4 + 5 (security review needs the full surface).
Phase 7 follows Phase 6 (no rollout without a hardened pilot).

## Risk Register

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| paratus.africa form webhooks blocked / inaccessible | Medium | High | Build n8n bridge as default Path 2 (see PRD/lead-ingestion.md); webhook is preferred but not required to ship |
| RLS bug leaks cross-country data | Low | Critical | Phase 2 ends with explicit two-tenant test from client SDK; CI smoke test on every deploy |
| Visual drift from approved mockups | Medium | Medium | Mockups committed to `docs/design-reference/`; Phase 1 + each dashboard phase ends with a side-by-side check |
| Country admin / agent invitations bottleneck | Medium | Medium | Build invite flow in Phase 6, test with 2 countries before Phase 7 rollout |
| Coming-soon country activation timing slips | Low | Low | Seeded as `coming_soon` at launch; activation is a single flag flip + invite flow, well-rehearsed by Phase 7 |
| Google master account not ready by Phase 1 | Medium | High | Phase 1 blocks on the Google account being created; flag immediately if not ready when work starts |
| Round-robin breaks at edge cases (no active agents) | Low | Medium | Fallback to country admin assignment + warning log; tested in Phase 2 |

## Next Action

Phases 1, 2, and 3 shipped (tags `phase-1-complete`, `phase-2-complete` staged, `phase-3-complete` staged). Per-phase shipping status tracked in `.planning/STATE.md`.

Run `/gsd:plan-phase 4` to produce `.planning/phases/04-country-admin-dashboard/PLAN.md`.
