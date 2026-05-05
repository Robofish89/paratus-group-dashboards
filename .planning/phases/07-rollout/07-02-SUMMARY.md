# Plan 07-02 — Onboarding docs + cutover checklist + in-app Help link — SUMMARY

**Status:** shipped 2026-05-05
**Commits:**
- `d86c3d3` — docs(07-02): three role onboarding one-pagers + Loom-links index
- `eb7c61c` — docs(07-02): per-country cutover checklist (CUTOVER.md)
- `b4eb103` — feat(07-02): in-app sidebar Help link wired through all three role shells

## What landed

### Docs

```
docs/
├── CUTOVER.md                    NEW — preamble + 12 country sections + rollback procedure
└── onboarding/
    ├── agent.md                  NEW — sales rep one-pager (590 words)
    ├── country-admin.md          NEW — country admin one-pager (580 words)
    ├── hq-admin.md               NEW — HQ admin one-pager (586 words)
    └── loom-links.md             NEW — index skeleton, six rows pending plan 07-04
```

### Code

```
packages/ui/src/
├── onboarding-urls.ts            NEW — ONBOARDING_BASE_URL constant
├── index.ts                      MOD — export ONBOARDING_BASE_URL
└── layouts/dashboard-layout.tsx  MOD — helpHref prop + conditional `?` link

apps/web/app/
├── (sales-rep)/_components/sales-rep-shell.tsx       MOD — helpHref to agent.md
├── (country-admin)/_components/country-admin-shell.tsx  MOD — helpHref to country-admin.md
└── (hq)/_components/hq-shell.tsx                     MOD — helpHref to hq-admin.md
```

## Verification (against the plan's checks)

| Check | Expected | Observed |
|-------|----------|----------|
| `wc -w docs/onboarding/*.md` (per-file ≤ 600) | ≤ 600 | 590 / 580 / 586 ✓ |
| `git grep -nE 'qualified\|lead_events\|outcome.*won' docs/onboarding/` | empty | empty ✓ |
| `git grep -nE 'TODO\|FIXME\|XXX' docs/onboarding/` | empty | empty ✓ |
| `grep -c '^## ' docs/CUTOVER.md` | 13 | 13 ✓ |
| `grep -c '^- \[ \]' docs/CUTOVER.md` | 132 | 132 ✓ |
| `grep -c '\[PILOT\]' docs/CUTOVER.md` | 1 (Mozambique) | 1 ✓ |
| `git grep -n 'helpHref' packages/ui apps/web` | 1 prop + 1 destructure + 1 render + 1 href + 3 wirings | 7 hits ✓ |
| `git grep -n 'ONBOARDING_BASE_URL' packages/ui apps/web` | 1 export + 3 imports + 3 usages | 7 hits ✓ (constant defn untracked at `packages/ui/src/onboarding-urls.ts` until staged) |
| `npm --workspace=apps/web run type-check` | green | green ✓ |
| `npm --workspace=apps/web run build` | green | green ✓ (proxy + 24 routes) |
| `npm --workspace=apps/web run lint` | green | green ✓ |

## Decisions made

### `ONBOARDING_BASE_URL` value

Locked to `https://github.com/Robofish89/paratus-group-dashboards/blob/main`. Rationale: GitHub renders the markdown one-pagers natively without auth (repo is private, but Paratus IT will be added during the Phase 7 handover; until then the repo is accessible to the build team). Single constant means a future repo transfer (e.g. to a `paratusgroup` GitHub org) is a one-line change. Compile-time constant rather than env var because the URL is public, never rotates, and no Vercel-config burden adds value.

### Voice + length

All three one-pagers stay strictly within the agent-copy memory voice: past-tense verbs, UI labels only ("My Leads" / "Called" / "Follow-ups"), no internal terminology (`qualified`, `lead_events`, `outcome='won'` never appear). Length trimmed below the 600-word budget by collapsing the lowest-value Q&A in each draft after the first wc -w check.

### Loom slot semantics

The two slots per role render explicit prose ("Recording will be added during pilot cutover"), not `TODO:` markers. This makes the slot self-explanatory for William reading the markdown today, and gives plan 07-04 a clean placeholder to find/replace. The in-app `?` link points at the markdown one-pager (not at a Loom URL), so re-recording a Loom never breaks the in-app link. This is documented in `loom-links.md`'s "How to update" footer.

### CUTOVER.md per-country structure

Same 11-item checklist for every country — duplicated literally rather than templated, because Mozambique gets ticked through during plan 07-03 while the other 11 stay un-ticked until plan 07-04. A single template + 12 country headers would have made plan 07-03's diff harder to review (which boxes did 07-03 actually tick?). Verbose duplication is the right call here. The rollback procedure lives once at the bottom of the file because it applies identically to every country.

### Minor file-path divergence from the plan template

The plan listed:
- `apps/web/app/(sales-rep)/[country]/queue/_components/queue-shell.tsx`
- `apps/web/app/(country-admin)/[country]/_components/country-admin-shell.tsx`
- `apps/web/app/(hq)/_components/hq-shell.tsx`

Actual paths in the repo are:
- `apps/web/app/(sales-rep)/_components/sales-rep-shell.tsx` (named `SalesRepShell`, not `QueueShell`)
- `apps/web/app/(country-admin)/_components/country-admin-shell.tsx` (one level higher than the plan)
- `apps/web/app/(hq)/_components/hq-shell.tsx` ✓

Wired the actual files. Same intent — three role shells get the help link.

## Carry-overs

### Plan 07-04

- Populate the six rows in `docs/onboarding/loom-links.md` with real Loom URLs after the recordings exist. Find/replace anchor: `_pending — added in plan 07-04_`.
- Tick through the 11 boxes for the other eleven countries in `docs/CUTOVER.md` as each cutover happens.

### CREDENTIALS.md (small surface)

The role one-pagers use these escalation contacts as the canonical v1 entries. Add to `CREDENTIALS.md` if not already there:
- William @ Brainstorm Projects: `william@brainstormprojects.co`
- DigimountAI support: `support@digimountai.com`

These are used in all three onboarding one-pagers' "Who to ask for help" sections.

### Retainer scope (deferred — out of v1)

- Add screenshots to the onboarding one-pagers once production data lands. Screenshots taken pre-rollout would need re-taking once real volume + real countries are visible.
- An in-app invite UI (the manual `provision-users.ts` script in plan 07-01 covers v1; UI is for ongoing onboarding cadence).

## Boil-the-Ocean checks

- [x] No `TODO` / `FIXME` / `XXX` markers anywhere in docs or code shipped by this plan
- [x] All shipped paths build, type-check, and lint clean
- [x] Voice matches the agent-copy memory note (past-tense, UI labels only)
- [x] Plan-level acceptance criteria all green
- [x] No half-wired buttons (helpHref renders only when truthy; all three shells set it)
- [x] Each task atomically committed
