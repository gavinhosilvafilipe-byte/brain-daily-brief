# CLAUDE.md — brain-daily-brief
> Project-specific rules. Parent `BRAIN/CLAUDE.md` loads first (master token rules + plugin routing).
> This file adds pipeline-specific context.

---

## WHAT THIS REPO IS

BRAIN Daily Brief — autonomous research + briefing pipeline.
`GitHub Actions (cron) → ingest → analyze → brief → Gmail (07:30 CST daily)`
Storage: Supabase (`packs` table, `cost_log`).
Workflow: Notion (Deep Dive Queue · Research Outputs · Budget Dashboard).
Output: Obsidian vault (approved deep dives).
Cost target: ~$14–16/month. Haiku for packing/scoring. Sonnet for briefs + deep dives.

---

## npm SCRIPTS — INTENT-TO-COMMAND MAP

Never ask which script to run. Infer from context.

| Intent | Command | Notes |
|--------|---------|-------|
| "fetch" / "ingest" / "get new data" / "refresh sources" | `npm run ingest` | src/jobs/ingest.js |
| "analyze" / "portfolio" / "WHY analysis" / "score moves" | `npm run analyze` | src/jobs/analyze.js |
| "send brief" / "daily brief" / "run the pipeline" | `npm run brief` | ⚠️ sends real email — confirm first |
| "deep dive on X" / "research X in depth" | `npm run deepdive` | src/jobs/deepdive.js — uses Sonnet |
| "weekly" / "distill" / "summarize week" | `npm run distill` | src/jobs/distill_weekly.js |
| "check approvals" / "any topics approved?" / "poll" | `npm run poll` | src/jobs/poll_approvals.js |
| "triage email" / "check inbox" / "what did I miss" | `npm run triage` | src/jobs/triage.js — reads unread, labels, logs |
| "budget" / "how much spent" / "cost" | `npm run budget` | src/jobs/budget_rollup.js |
| "start server" / "run worker" | `npm run start` | worker.js (Express) |
| Full pipeline (manual test run) | `npm run ingest && npm run analyze && npm run brief` | ⚠️ sends email |
| Gmail auth broken (one-time fix) | `npm run gmail-setup` | scripts/gmail-oauth-setup.js |

---

## FILE MAP

```
src/jobs/
  ingest.js           ← fetch + pack all sources → Supabase packs table
  analyze.js          ← score portfolio moves (WHY analysis, Haiku)
  brief.js            ← generate HTML email (Sonnet) → Gmail
  deepdive.js         ← Sonnet deep research on approved topic → Obsidian
  distill_weekly.js   ← weekly pack synthesis
  poll_approvals.js   ← poll Notion Deep Dive Queue for approved items
  budget_rollup.js    ← cost_log → Notion Budget Dashboard
  triage.js           ← read unread Gmail → Haiku categorize → label + Obsidian daily note + Notion 📥 Inbox Triage + Mac push + STATE/missed.json

src/services/
  gmail_read.js       ← googleapis Gmail read + label (full mail.google.com scope)
src/hooks/
  session_digest.js   ← SessionStart hook: prints STATE/missed.json digest into every new Claude chat
scripts/
  run-triage.sh       ← launchd wrapper for triage (3x daily)
STATE/
  missed.json/.md     ← latest inbox digest (read by SessionStart hook)
  triaged_ids.json    ← processed message IDs (dedup, last 2000)

scripts/
  gmail-oauth-setup.js  ← one-time OAuth

worker.js             ← Express server / manual job runner
.github/workflows/    ← cron triggers
supabase/migrations/  ← DB schema (run once in Supabase SQL editor)
```

---

## GITHUB ACTIONS SCHEDULES

| Job | Cron (UTC) | CST | File |
|-----|-----------|-----|------|
| Daily pipeline | `30 23 * * *` | 07:30 | `.github/workflows/` |
| Weekly distill | `0 10 * * 0` | 18:00 Sun | `.github/workflows/` |
| Poll approvals | `*/15 * * * *` | Every 15 min | `.github/workflows/` |
| Inbox triage | 08:00 · 13:00 · 20:00 local | Asia/Shanghai | `~/Library/LaunchAgents/com.filipe.brain-triage.plist` (launchd, local Mac) |

To test without waiting for cron: `npm run <script>` directly.

---

## ENV VARS

```
ANTHROPIC_API_KEY
NOTION_TOKEN
NOTION_SETTINGS_DB_ID
NOTION_DEEPDIVE_DB_ID
NOTION_OUTPUTS_DB_ID
NOTION_BUDGET_DB_ID
SUPABASE_URL
SUPABASE_KEY
GMAIL_CLIENT_ID
GMAIL_CLIENT_SECRET
GMAIL_REFRESH_TOKEN
```

Local: `.env` file. CI: GitHub Secrets → Settings → Secrets → Actions.

---

## ARCHITECTURE DECISION RULES

When suggesting changes — trace the full data flow first:
`ingest → Supabase packs → analyze → Notion → brief → Gmail`

- New data source → modify `ingest.js` + add column to `packs` table
- Notion schema change → update all relevant DB IDs in `.env`
- Cost change → update `cost_log` writes + `budget_rollup.js`
- Model change → Haiku for packing/scoring only. Sonnet = brief + deepdive only.

---

## DEBUGGING PROTOCOL

Order of investigation (always follow this):
1. Check `.env` for missing/wrong vars — most common cause
2. Check Supabase schema matches what the code expects
3. Check GitHub Actions logs for CI failures
4. Read the failing job file
5. Only then touch code

---

## COMMON PATTERNS

**Add ingest source:**
```js
// src/jobs/ingest.js — append to sources array:
{ name: 'source-name', fetch: async () => { /* return string */ } }
```

**Check recent costs:**
```js
const { data } = await supabase
  .from('cost_log')
  .select('*')
  .order('created_at', { ascending: false })
  .limit(10)
```

**Push to Deep Dive Queue:**
```js
await notion.pages.create({
  parent: { database_id: process.env.NOTION_DEEPDIVE_DB_ID },
  properties: {
    Topic: { title: [{ text: { content: topicName } }] },
    Status: { select: { name: 'pending' } }
  }
})
```

**Obsidian deep dive output format:**
```yaml
---
type: research
source: brain-brief
topic: [topic name]
date: YYYY-MM-DD
cost_usd: 0.XX
status: done
tags: [research, brain-brief]
---
```

---

## SAFETY RULES

- `npm run brief` → confirm before running (sends real email to gavinho.silva.filipe@gmail.com)
- `npm run deepdive` → confirm topic + cost estimate before running (Sonnet = ~$0.05–0.20/run)
- Never commit `.env` — it's in `.gitignore`
- Never modify Obsidian files directly — they're outputs from `deepdive.js`, read-only

---

*Parent: BRAIN/CLAUDE.md | Repo: gavinhosilvafilipe-byte/brain-daily-brief | Updated: 2026-05-20*
