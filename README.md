# BRAIN Daily Brief

Autonomous daily research briefing system. Delivers an HTML email at 07:30 China time covering world news, US/Brazil markets, portfolio moves (WHY analysis), and permissioned deep dives.

## Architecture

```
GitHub Actions (cron) → ingest → analyze → brief → Gmail
                              ↓
                         Supabase (packs + cost_log)
                              ↓
                    Notion (queue + outputs + budget)
                              ↓
                  poll_approvals → deepdive → Obsidian
```

## Setup

### 1. Clone & install
```bash
git clone https://github.com/gavinhosilvafilipe-byte/brain-daily-brief
cd brain-daily-brief
npm install
cp .env.example .env
# Fill in .env with your credentials
```

### 2. Gmail OAuth (one-time)
```bash
npm run gmail-setup
# Follow the URL, paste the code, copy GMAIL_REFRESH_TOKEN to .env
```

### 3. Supabase schema
Run `supabase/migrations/001_initial.sql` in your Supabase SQL editor.

### 4. GitHub Actions secrets
Add all vars from `.env.example` as repository secrets in:
`Settings → Secrets → Actions`

### 5. Test run
```bash
npm run ingest    # fetch + pack data
npm run analyze   # score portfolio moves
npm run brief     # generate + send HTML brief
```

## Schedules

| Job | Cron | China time |
|-----|------|------------|
| Daily pipeline | 23:30 UTC daily | 07:30 |
| Weekly distill | 10:00 UTC Sunday | 18:00 |
| Poll approvals | Every 15 min | — |

## Cost estimate
~$14-16/month (Haiku packs + Sonnet briefs + 2-3 deep dives/week)

## Notion DBs (pre-created)
- ⚙️ System Settings
- 🔬 Deep Dive Queue  
- 📄 Research Outputs
- 💰 Budget Dashboard
