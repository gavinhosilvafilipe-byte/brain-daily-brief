# Prettier Outputs Report

**Date:** 2026-05-20  
**Scope:** Obsidian templates + Notion Research Outputs database improvements

---

## Summary

Three Obsidian note templates and one improved Notion logOutput function were created. No existing code was modified.

---

## Templates Created

### 1. `docs/obsidian-templates/valuation-ticker.md`
Per-ticker valuation note. Written by `src/jobs/valuation.js` → `STOCK/valuations/{{TICKER}}.md`.

Key features:
- YAML frontmatter with all valuation fields (ticker, price, precoteto, composite, discount, verdict)
- Methods table: Bazin, Graham Clássico, Graham Moderno, Múltiplos P/L, P/VP, Composite, Preço Teto
- Fundamentals section: LPA, VPA, DPS 12M, P/L, P/VP, DY
- Verdict callouts using Obsidian callout syntax:
  - `> [!success]` → COMPRA_FORTE
  - `> [!tip]` → COMPRA
  - `> [!warning]` → NEUTRO
  - `> [!caution]` → CARO
  - `> [!danger]` → EVITE
  - `> [!note]` → SEM_DADOS

Placeholders: `{{TICKER}}`, `{{DATE}}`, `{{PRICE}}`, `{{PRECOTETO}}`, `{{COMPOSITE}}`, `{{DISCOUNT}}`, `{{VERDICT}}`, `{{LPA}}`, `{{VPA}}`, `{{DPS12M}}`, `{{BAZIN}}`, `{{GRAHAM_CLASSICO}}`, `{{GRAHAM_MODERNO}}`, `{{MULTIPLOS_PL}}`, `{{MULTIPLOS_PVP}}`

---

### 2. `docs/obsidian-templates/valuation-summary.md`
Portfolio-wide summary dashboard. Written by `src/jobs/valuation.js` → `STOCK/valuations/_summary.md`.

Key features:
- Status table: all tickers sorted by discount descending, with emoji verdict column
- `> [!success]` Top Opportunities callout: tickers with discount ≥ 15%
- `> [!danger]` Avoid Zone callout: tickers with discount < −5%
- `> [!note]` Methodology callout explaining all 5 methods
- Links to individual ticker notes

Placeholders: `{{DATE}}`, `{{ROW_N}}`, `{{PRICE_N}}`, `{{TETO_N}}`, `{{DISC_N}}`, `{{EMOJI_N}}`, `{{VERDICT_N}}`, `{{OPPORTUNITIES_LIST}}`, `{{AVOID_LIST}}`, `{{TICKER_LINKS}}`

---

### 3. `docs/obsidian-templates/weekly-distill.md`
Improved weekly distillation. Written by `src/jobs/distill_weekly.js` → `03-OUTPUT/WEEKLY_DISTILLS/week-N-YYYY-MM-distill.md`.

Key features:
- `> [!info]` header callout with week ending date, monthly cost, tickers
- Portfolio moves markdown table (Ticker | Move% | Reason)
- `> [!important]` Key Decisions Made callout
- `> [!warning]` Surprises callout
- Watch Next Week as a Obsidian task checklist (`- [ ]`)

Placeholders: `{{WEEK_NUM}}`, `{{YEAR_MONTH}}`, `{{DATE_END}}`, `{{MONTHLY_COST_USD}}`, `{{TICKERS}}`, `{{MARKET_THEMES_LIST}}`, `{{THESIS_SHIFTS}}`, `{{DECISIONS_LIST}}`, `{{SURPRISES_LIST}}`, `{{WATCH_1..3}}`

---

## Notion Database Fields to Add

Target database: **Research Outputs** (`NOTION_OUTPUTS_DB_ID`)

| # | Field Name | Type | Options / Format |
|---|-----------|------|-----------------|
| 1 | Status | Select | ✅ Complete (green), ⚠️ Partial (yellow), ❌ Failed (red) |
| 2 | Cost Tier | Select | 💚 Cheap (green), 💛 Normal (yellow), 🔴 Expensive (red) |
| 3 | Quality Score | Number | Format: Number (range 0–100) |

The improved `logOutput` is in `docs/notion-improvements/logOutput-v2.js`.

Logic:
- **Status**: `✅ Complete` if `sourcesUsed > 0`, else `⚠️ Partial`. Set `❌ Failed` manually in catch blocks.
- **Cost Tier**: uses `costUsd` if passed (recommended), else estimates from `costTokens` at $1.50/1M blended rate. Cheap < $0.01 · Normal $0.01–0.05 · Expensive > $0.05.
- **Quality Score**: `min(100, round((sourcesUsed/10)*50 + (whyMovedCount/5)*50))`. Max score at 10+ sources + 5+ why-moved candidates.

---

## How to Add Fields in Notion UI (Step by Step)

1. Open Notion → navigate to the **Research Outputs** database.
2. Click **+** (the last column header in table view) to add a new property.
3. **Add "Status" field:**
   - Name: `Status`
   - Type: Select
   - Add options: `✅ Complete` (color: Green), `⚠️ Partial` (color: Yellow), `❌ Failed` (color: Red)
   - Click Confirm.
4. **Add "Cost Tier" field:**
   - Click **+** again
   - Name: `Cost Tier`
   - Type: Select
   - Add options: `💚 Cheap` (Green), `💛 Normal` (Yellow), `🔴 Expensive` (Red)
   - Click Confirm.
5. **Add "Quality Score" field:**
   - Click **+** again
   - Name: `Quality Score`
   - Type: Number
   - Format: Number (default)
   - Click Confirm.
6. **Deploy the code:**
   - Copy the `logOutput` function body from `docs/notion-improvements/logOutput-v2.js`
   - Paste it into `src/services/notion.js`, replacing the existing `logOutput` function (currently lines 63–82)
   - Pass `costUsd: result.costUsd` in the `logOutput` call in `src/jobs/brief.js` (optional but improves CostTier accuracy)
7. **Test:** Run `npm run distill` (no email risk). Check Notion Research Outputs — new entry should show Status, Cost Tier, Quality Score populated.

---

## Integration Notes

- **valuation.js** already builds ticker notes and summary via `buildTickerNote` / `buildSummaryNote`. The templates in this folder are reference formats — update those functions to match if you want prettier output.
- **distill_weekly.js** writes raw LLM output. To use the weekly-distill template, update the `SYSTEM` prompt in `distill_weekly.js` to instruct Haiku to use callout syntax (`> [!important]`, `> [!warning]`), and add the YAML frontmatter block.
- Templates use `{{PLACEHOLDER}}` syntax — not wired to any template engine. They are reference designs for manual or code-driven population.
