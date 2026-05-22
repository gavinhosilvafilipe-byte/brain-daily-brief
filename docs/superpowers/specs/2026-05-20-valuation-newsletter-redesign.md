# BRAIN — Valuation Engine + Newsletter Redesign

**Date:** 2026-05-20  
**Status:** Approved  
**Scope:** Weekly stock/FII valuation → Obsidian vault + Morning Brew style daily newsletter + Investment Opportunities section

---

## Context

Current daily brief is technically correct but visually heavy (walls of text) and lacks equity valuation. Filipe wants:
1. Weekly automated preço teto calculation for all portfolio holdings (stocks + FIIs), saved to Obsidian
2. Daily newsletter redesigned to be Morning Brew style — visual, personality, concise story cards
3. New "Oportunidades" section every day showing portfolio items + market instruments trading at a discount vs fair value

---

## Architecture

```
Friday 21:00 UTC (Saturday 5am CST):
  valuation.js
    → fetch prices (existing portfolio.js)
    → fetch fundamentals: Yahoo Finance key-stats scrape → Haiku fallback (Investidor10, B3)
    → compute: Bazin + Graham Classic + P/L multiples + P/VP
    → preço teto = weighted composite × 0.80 (20% margin of safety)
    → save to Obsidian: STOCK/valuations/TICKER.md + _summary.md

Daily 22:30 UTC (6:30am CST):
  brief.js
    → read valuation cache from Obsidian _summary.md
    → pass discount table to Morning Brew prompt
    → send redesigned email with Oportunidades section
```

---

## Components

### 1. `src/services/fundamentals.js` (NEW)
Fetches LPA, VPA, dividends per ticker.

**Strategy:**
1. Yahoo Finance `/v10/finance/quoteSummary/{TICKER}.SA` — `financialData`, `summaryDetail`, `defaultKeyStatistics` modules
2. If data missing/null → Haiku call: search `{TICKER} site:investidor10.com.br LPA VPA dividendos` + extract numbers
3. Returns: `{ lpa, vpa, dps12m, pAtual, pL, pVp, dy }` per ticker

**FII detection:** tickers ending in `11` → use `p_vp` and `dividend_yield` (P/FFO not available from free sources, skip EPV)

### 2. `src/jobs/valuation.js` (NEW)
Weekly batch valuation.

**Methods per ticker:**
| Method | Formula | Weight | Skip if |
|--------|---------|--------|---------|
| Bazin | DPS12M / 0.06 | 25% | DPS = 0 |
| Graham Clássico | √(22.5 × LPA × VPA) | 20% | LPA or VPA ≤ 0 |
| P/L Múltiplos | LPA × sector_fair_pe | 20% | LPA ≤ 0 |
| P/VP | VPA × sector_fair_pvp | 20% | VPA ≤ 0 |
| Graham Moderno | (LPA × (8.5 + 2×g) × 4.4) / Y | 15% | Missing g or Y |

Sector fair multiples hardcoded in config (banks: P/L=8, P/VP=1.5; utilities: P/L=12; FIIs: P/VP=1.0).  
`Y` = NTN-B real yield fetched via Haiku (fallback: 6.5%).  
`g` = 5% default (conservative).

**Output per ticker:**
```
Verdict: COMPRA_FORTE / COMPRA / NEUTRO / CARO / EVITE
Composite fair value: R$X.XX
Preço teto: R$X.XX (= composite × 0.80)
Current price: R$X.XX  
Discount: +X% below teto (or -X% above teto)
Methods used: Bazin R$X, Graham R$X, ...
```

### 3. `src/services/obsidian.js` (NEW)
File-system writer to vault at `OBSIDIAN_VAULT_PATH` (from config).

```js
writeNote(relativePath, markdown)   // writes to vault/relativePath
readNote(relativePath)              // reads from vault, returns string or null
```

Saves to: `STOCK/valuations/{TICKER}.md` and `STOCK/valuations/_summary.md`  
`_summary.md` = compact markdown table used by daily brief (≤200 lines).

### 4. `src/prompts/sonnet/daily_brief_html.js` (MODIFY)
Full Morning Brew style redesign.

**New email structure:**
```
A) HEADER — "BRAIN Daily Brief" banner, date, "5-min read"
B) MARKETS FLASH — compact row: Nasdaq | S&P | Ibovespa | BTC | BRL/USD (green/red emoji arrows)
C) EXECUTIVE TL;DR — max 5 bullets (was 8), punchy
D) 🌍 MUNDO — 3 story cards: emoji headline + What happened · Why it matters · What's next (3 lines each)
E) 🇧🇷 BRASIL — 3 story cards same format
F) 📊 PORTFOLIO — price table with change%, big movers flagged in amber/red
G) 💰 OPORTUNIDADES — table: Ticker | Preço Atual | Preço Teto | Desconto% | Sinal (🟢🟡🔴)
H) 📅 AGENDA — 3-5 upcoming catalysts
I) FOOTER — timestamp + data quality note
```

**Visual:** Same navy/white card system but shorter cards. Story items: left colored border per region. Market row: inline-block chips. Personality in section openers (1 line).

### 5. `src/jobs/brief.js` (MODIFY)
Load `STOCK/valuations/_summary.md` from Obsidian before calling Sonnet. Pass as `valuationSection` string into the prompt builder.

### 6. `worker.js` (MODIFY)
Add cron: Friday 21:00 UTC (Saturday 5am CST) → `valuation` job.

### 7. `src/config.js` (MODIFY)
Add `fiiTickers`, `sectorMultiples` to portfolio config block.

---

## Obsidian Note Format

**`STOCK/valuations/_summary.md`** (read by brief.js daily):
```markdown
---
updated: YYYY-MM-DD
---
| Ticker | Preço | Preço Teto | Desconto | Sinal |
|--------|-------|-----------|---------|-------|
| BBAS3  | 24.50 | 31.20     | +21.5%  | 🟢    |
```

**`STOCK/valuations/{TICKER}.md`** (full detail, for chat analysis):
```markdown
---
ticker: TICKER
updated: YYYY-MM-DD
price: 0.00
precoteto: 0.00
composite: 0.00
discount: 0.0
verdict: NEUTRO
---
# TICKER — Company Name
[table of all methods with inputs/outputs]
```

---

## Verification

1. `npm run valuation` → check `~/Desktop/BRAIN/BRAIN/STOCK/valuations/` populated
2. `npm run brief` → check email has Oportunidades section, Morning Brew cards
3. Haiku fallback test: set a ticker's Yahoo data to null → confirm Haiku searches Investidor10
4. Cron smoke test: confirm worker.js Saturday 5am CST slot present
