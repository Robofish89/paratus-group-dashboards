# Backup & Restore — Paratus Group Dashboards

**Last reviewed:** 2026-05-04 (plan 06-05)
**Supabase project:** `tgswsdfaszvztbpczfve` (eu-west-1)
**Supabase tier:** **Free** (verified via `mcp__supabase-paratusgroup__get_organization` on 2026-05-04 — `plan: "free"`)

---

## 1. Honest RTO / RPO

We are running on Supabase's free tier. The numbers below are not
aspirational — they are what we can actually deliver today.

| Metric | Value | Source |
|--------|-------|--------|
| **RTO** (Recovery Time Objective) | **Best-effort 1 hour** for a Supabase-side incident; longer if the incident requires a dump-then-restore loop | Free-tier ops have no formal SLA |
| **RPO** (Recovery Point Objective) | **≤ 24 hours** | Free tier provides daily logical backups; **no point-in-time recovery (PITR)**. Anything written between the last daily backup and the incident is lost. |

If the pilot graduates to production (or if William wants tighter numbers
for the v1 contract), upgrade the Supabase project to **Pro** (roughly
USD 25 / month / org). Pro adds:

- Daily backups retained for **7 days** (free is 7 days too, but…)
- **PITR (point-in-time recovery)** to within ≤ 5 minutes
- **Database branches** for restore drills against production data without
  spinning up a separate project

The upgrade is a single click in the Supabase dashboard. RPO drops from
24 hours to 5 minutes the moment PITR turns on; RTO stays best-effort
1 hour but the recovery is in-place rather than via dump+restore.

---

## 2. Manual backup procedure

The Supabase CLI's `db dump` command is the supported path for one-off
backups. Run from the repo root with the project linked:

```bash
# First-time link (interactive auth):
npx supabase login
npx supabase link --project-ref tgswsdfaszvztbpczfve

# Take a backup (public + auth schemas)
mkdir -p backups
npx supabase db dump --schema public,auth -f "backups/$(date +%F).sql" --linked

# The dump file contains PII (lead emails, phones). It is gitignored —
# verify with:
grep -E '^backups/' .gitignore
```

Storage location for the resulting `.sql` files: pick one of the below and
write it down somewhere a non-DigimountAI human can find.

- **DigimountAI primary**: a private Google Drive folder under
  `para.group.n8n@gmail.com`, retained for 30 days then rotated.
- **William's archive**: he can hold a quarterly snapshot if he wants one;
  this is not the primary location.

`.gitignore` already includes `backups/` (added in plan 06-05); do not
remove that entry.

---

## 3. Automated backup — what's available today

The free tier runs **daily logical backups automatically**. They land in
the Supabase Dashboard → Project Settings → Database → Backups, retained
for 7 days. There is no per-table cadence configuration on free.

This is the source of the 24-hour RPO statement above. Any custom backup
strategy on top (cron'd `db dump` to a Vercel-side blob, S3 bucket, etc.)
is out of scope for v1; revisit on Pro upgrade where PITR makes most of
this redundant anyway.

---

## 4. Restore drill — quarterly cadence

A backup that has never been restored is not a backup. **Run this drill
once before pilot kickoff and quarterly thereafter.**

### 4.1 Drill on Pro tier (with branches)

```bash
# 1. Spin a branch off the current schema
npx supabase branches create test-restore --linked
# 2. Apply yesterday's dump to the branch (replace YYYY-MM-DD)
psql "$BRANCH_DB_URL" < backups/YYYY-MM-DD.sql
# 3. Verify a known lead row exists post-restore
psql "$BRANCH_DB_URL" -c "SELECT id, country_code, status FROM leads ORDER BY created_at DESC LIMIT 5;"
# 4. Time the restore — record the start-to-verify duration in 4.3 below.
# 5. Tear the branch down
npx supabase branches delete test-restore
```

### 4.2 Drill on free tier (alternative — no branches available)

Branches are a Pro feature. On free, the realistic alternatives are:

1. **Spin up a separate Supabase project** named `paratus-group-restore-drill`
   (small free instance), apply yesterday's dump, run the verification
   query, delete the project. Slower than branches; cleaner than touching
   prod.
2. **Spin up a local stack via the CLI** (`npx supabase start` against a
   throwaway directory), `psql` the dump in, run the verification query,
   `npx supabase stop`. Doesn't exercise the cloud restore path but does
   prove the dump file is valid.

Option 2 is the **one we run quarterly**. Option 1 is the dress-rehearsal
we'd do before a real incident.

```bash
# Option 2 — local sanity-restore
mkdir /tmp/restore-drill && cd /tmp/restore-drill
npx supabase init
npx supabase start
psql "$(npx supabase status -o json | jq -r .DB_URL)" \
  < /Users/gerhardvandenheever/Projects/paratus-group-dashboards/backups/YYYY-MM-DD.sql
psql "$(npx supabase status -o json | jq -r .DB_URL)" \
  -c "SELECT count(*) FROM leads; SELECT count(*) FROM auth.users;"
npx supabase stop --no-backup
```

### 4.3 Drill log

Update this table after every drill. **Empty rows mean the drill has
never been exercised** — that is unacceptable for a soak-graduating
project.

| Date | Drill type (4.1 / 4.2-1 / 4.2-2) | Duration (start → verify) | Anomalies |
|------|----------------------------------|---------------------------|-----------|
| 2026-05-04 | Pre-pilot drill — pending | – | Pre-pilot drill must run before T+0 of the 48 h soak. Block on this. |

---

## 5. Disaster scenarios

### 5.1 Schema drift / failed migration

If a migration corrupts the schema and a rollback isn't enough:

1. Take a fresh dump immediately (preserves any post-incident writes).
2. Open the most recent good migration in `packages/supabase/migrations/`.
3. Restore the previous-good schema by replaying migrations 00001..N-1.
4. If user data is intact, you're done. If not → 5.2.

### 5.2 Data loss (single table)

```sql
-- 1. Identify the affected table + time window
-- 2. Restore that table only from the most recent daily backup:
psql "$PROD_DB_URL" -c "TRUNCATE leads CASCADE;"
psql "$PROD_DB_URL" < <(grep -A 999999 'COPY public.leads' backups/YYYY-MM-DD.sql | head -N)
-- 3. Verify count + sanity-check a few rows
-- 4. Document the RPO actually paid (time of last backup → time of restore)
```

### 5.3 Full project loss

Worst case: the Supabase project itself is gone (rare; usually means
billing event or accidental project delete).

1. Create a fresh Supabase project under `para.group.n8n@gmail.com`.
2. Replay every migration from `packages/supabase/migrations/00001_*.sql`
   onwards via the Dashboard SQL Editor or `supabase db push --linked`.
3. Apply the most recent daily backup's data section (skip the schema
   section — already created by step 2):

   ```bash
   psql "$NEW_DB_URL" -c '\copy ...'   # see backup file's COPY statements
   ```

4. Update Vercel env vars to point at the new project ref.
5. Re-trigger the Custom Access Token Hook in the new project's
   Authentication → Hooks settings (manual step from migration 00001).
6. Re-trigger the Resend domain verification (DNS records re-verify
   automatically; usually no action needed unless DNS changed too).
7. Smoke test: `/api/health` should return 200; one webhook ingest should
   land; one country-admin login should work.

Estimated RTO for this scenario: **4–6 hours**, dominated by waiting for
DNS / domain verification rather than the data restore itself.

---

## 6. Pre-pilot drill checklist

Run this once before T+0 of the 48 h pilot soak:

- [ ] `npx supabase login` + `npx supabase link --project-ref tgswsdfaszvztbpczfve` succeed
- [ ] `npx supabase db dump --schema public,auth -f backups/$(date +%F).sql --linked` produces a dump file > 100 KB
- [ ] The dump contains a known recent lead row (`grep -i 'INSERT INTO public.leads' backups/<file>.sql | head`)
- [ ] Drill section 4.2-2 (local sanity restore) completes inside 10 minutes
- [ ] Drill log row for today is filled in section 4.3

Any failure here blocks the pilot. Fix the gap first.

---

## 7. Post-pilot review

After the 48 h soak, take a fresh dump and snapshot it as
`backups/post-pilot-YYYY-MM-DD.sql`. Keep the snapshot for 90 days as the
"known good" baseline; it's invaluable when investigating a regression
two months later.

When the project moves to Pro tier (post-pilot), revisit:

- Increase backup retention if Supabase Pro's 7 days isn't enough for the
  client's audit needs.
- Stand up a real branched restore-drill cadence (section 4.1) replacing
  the local-stack drill (section 4.2-2).
- Update the RTO/RPO table in section 1 to reflect Pro PITR.
