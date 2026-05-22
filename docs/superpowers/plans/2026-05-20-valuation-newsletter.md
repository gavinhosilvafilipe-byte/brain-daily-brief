# Valuation Engine + Morning Brew Newsletter Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a weekly stock/FII valuation engine that saves preço teto to Obsidian, and redesign the daily newsletter to Morning Brew style with a daily "Oportunidades" section.

**Architecture:** Yahoo Finance `/v10/finance/quoteSummary` fetches fundamentals; Haiku fallback searches Investidor10 for B3 data when Yahoo returns nulls. Valuation runs weekly (Friday 21:00 UTC = Saturday 5am CST), writes to Obsidian vault. Daily brief reads the cached `_summary.md` table and passes it to a redesigned Sonnet prompt.

**Tech Stack:** Node.js, Anthropic SDK (Haiku fallback), Yahoo Finance v10 API (free/no-key), `fs` module for Obsidian writes, node-cron, axios

---

## File Map

| File | Action | Responsibility |
|------|--------|---------------|
| `src/services/fundamentals.js` | CREATE | Fetch LPA/VPA/DPS from Yahoo Finance; Haiku fallback for B3 |
| `src/services/obsidian.js` | CREATE | Read/write markdown files to Obsidian vault path |
| `src/jobs/valuation.js` | CREATE | Weekly batch: run 5 valuation methods, save to Obsidian |
| `src/config.js` | MODIFY | Add `fiiTickers`, `sectorMultiples`, `ntnbYield` |
| `src/jobs/brief.js` | MODIFY | Load valuation cache before calling Sonnet |
| `src/prompts/sonnet/daily_brief_html.js` | MODIFY | Morning Brew style + Oportunidades section |
| `worker.js` | MODIFY | Add Friday 21:00 UTC valuation cron |
| `package.json` | MODIFY | Add `"valuation"` npm script |

---

## Task 1: Add config values for valuation

**Files:**
- Modify: `src/config.js`

- [ ] **Step 1: Add fiiTickers, sectorMultiples, ntnbYield to the portfolio block**

Replace the `portfolio:` block in `src/config.js` with:

```js
portfolio: {
  tickers: (process.env.PORTFOLIO_TICKERS || 'BBAS3,VALE3,PETR4,BTC,USDBRL').split(','),
  fiiTickers: (process.env.FII_TICKERS || '').split(',').filter(Boolean),
  bigMoveThreshold: parseFloat(process.env.BIG_MOVE_THRESHOLD || '3.0'),
  ntnbYield: parseFloat(process.env.NTNB_YIELD || '6.5'), // NTN-B real yield % used as Y in Graham Moderno
  sectorMultiples: {
    BBAS3:   { fairPL: 7,  fairPVP: 1.2 },
    ABCB4:   { fairPL: 8,  fairPVP: 1.3 },
    VALE3:   { fairPL: 6,  fairPVP: 1.5 },
    PETR4:   { fairPL: 7,  fairPVP: 1.5 },
    AURE3:   { fairPL: 14, fairPVP: 1.0 },
    CSMG3:   { fairPL: 12, fairPVP: 1.2 },
    DEFAULT: { fairPL: 10, fairPVP: 1.0 },
    FII:     { fairPL: null, fairPVP: 1.0 },
  },
},
```

- [ ] **Step 2: Verify no existing code breaks**

```bash
node -e "const c = require('./src/config'); console.log(c.portfolio.sectorMultiples);"
```

Expected: prints the multiples object with no errors.

- [ ] **Step 3: Commit**

```bash
git add src/config.js
git commit -m "feat(config): add fiiTickers, sectorMultiples, ntnbYield for valuation engine"
```

---

## Task 2: Create `src/services/obsidian.js`

**Files:**
- Create: `src/services/obsidian.js`

- [ ] **Step 1: Create the file**

```js
'use strict';
const fs   = require('fs');
const path = require('path');
const config = require('../config');

function vaultPath(relativePath) {
  return path.join(config.obsidian.vaultPath, 'BRAIN', relativePath);
}

function writeNote(relativePath, markdown) {
  const fullPath = vaultPath(relativePath);
  fs.mkdirSync(path.dirname(fullPath), { recursive: true });
  fs.writeFileSync(fullPath, markdown, 'utf8');
  console.log(`[obsidian] wrote: ${fullPath}`);
}

function readNote(relativePath) {
  const fullPath = vaultPath(relativePath);
  try {
    return fs.readFileSync(fullPath, 'utf8');
  } catch {
    return null;
  }
}

module.exports = { writeNote, readNote };
```

- [ ] **Step 2: Smoke-test write and read**

```bash
node -e "
const { writeNote, readNote } = require('./src/services/obsidian');
writeNote('STOCK/valuations/_test.md', '# test\nworks');
const r = readNote('STOCK/valuations/_test.md');
console.log('READ:', r);
require('fs').unlinkSync(require('path').join(require('./src/config').obsidian.vaultPath, 'BRAIN', 'STOCK/valuations/_test.md'));
console.log('cleanup done');
"
```

Expected:
```
[obsidian] wrote: .../BRAIN/STOCK/valuations/_test.md
READ: # test
works
cleanup done
```

- [ ] **Step 3: Commit**

```bash
git add src/services/obsidian.js
git commit -m "feat(obsidian): writeNote/readNote service for vault file I/O"
```

---

## Task 3: Create `src/services/fundamentals.js`

**Files:**
- Create: `src/services/fundamentals.js`

Fetches LPA (EPS), VPA (BVPS), DPS12M (annual dividends/share) per B3 ticker.
Strategy: Yahoo Finance `/v10/finance/quoteSummary` → Haiku fallback if data sparse.

- [ ] **Step 1: Create the file**

```js
'use strict';
const axios   = require('axios');
const { callHaiku } = require('./anthropic');

const YAHOO_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
  'Accept': 'application/json',
  'Referer': 'https://finance.yahoo.com',
};

const MODULES = 'financialData,summaryDetail,defaultKeyStatistics';

async function fetchFromYahoo(ticker) {
  const isCrypto = ['BTC', 'ETH'].includes(ticker);
  const isFX     = ticker === 'USDBRL';
  if (isCrypto || isFX) return null;

  const symbol = `${ticker}.SA`;
  try {
    const resp = await axios.get(
      `https://query2.finance.yahoo.com/v10/finance/quoteSummary/${symbol}`,
      { params: { modules: MODULES }, headers: YAHOO_HEADERS, timeout: 12000 }
    );
    const result = resp.data?.quoteSummary?.result?.[0];
    if (!result) return null;

    const sum  = result.summaryDetail          || {};
    const keys = result.defaultKeyStatistics   || {};

    return {
      ticker,
      isFII:  ticker.endsWith('11'),
      lpa:    keys.trailingEps?.raw   ?? null,
      vpa:    keys.bookValue?.raw     ?? null,
      dps12m: sum.dividendRate?.raw   ?? null,
      pL:     sum.trailingPE?.raw     ?? null,
      pVp:    keys.priceToBook?.raw   ?? null,
      dy:     sum.dividendYield?.raw  ?? null,
    };
  } catch (e) {
    console.warn(`[fundamentals] Yahoo failed for ${ticker}:`, e.message);
    return null;
  }
}

const HAIKU_SYSTEM = `You are a financial data extractor for Brazilian stocks (B3).
Extract: LPA (earnings per share BRL), VPA (book value per share BRL), DPS_12M (total dividends per share last 12 months BRL).
Return ONLY valid JSON: {"lpa": number_or_null, "vpa": number_or_null, "dps12m": number_or_null}
No markdown, no explanation. If not found, set to null.`;

async function fetchFromHaiku(ticker) {
  const prompt = `Ticker: ${ticker} (B3 Brazilian stock exchange)
Search investidor10.com.br and statusinvest.com.br for the latest annual values:
- LPA (Lucro por Ação)
- VPA (Valor Patrimonial por Ação)
- Dividendos pagos por ação nos últimos 12 meses (DPS 12M)
Return JSON only.`;

  try {
    const result = await callHaiku(
      [{ role: 'user', content: prompt }],
      HAIKU_SYSTEM, 'valuation_fundamentals'
    );
    const data = JSON.parse(result.content.trim());
    console.log(`[fundamentals] Haiku result for ${ticker}:`, data);
    return {
      ticker, isFII: ticker.endsWith('11'),
      lpa: data.lpa ?? null, vpa: data.vpa ?? null, dps12m: data.dps12m ?? null,
      pL: null, pVp: null, dy: null,
    };
  } catch (e) {
    console.warn(`[fundamentals] Haiku failed for ${ticker}:`, e.message);
    return null;
  }
}

async function getFundamentals(ticker) {
  const isCrypto = ['BTC', 'ETH'].includes(ticker);
  const isFX     = ticker === 'USDBRL';
  if (isCrypto || isFX) return null;

  const yahoo = await fetchFromYahoo(ticker);
  if (yahoo && (yahoo.lpa !== null || yahoo.vpa !== null || yahoo.dps12m !== null)) {
    return yahoo;
  }
  console.log(`[fundamentals] Yahoo data sparse for ${ticker}, falling back to Haiku`);
  return fetchFromHaiku(ticker);
}

module.exports = { getFundamentals };
```

- [ ] **Step 2: Smoke-test Yahoo path**

```bash
node -e "
const { getFundamentals } = require('./src/services/fundamentals');
getFundamentals('BBAS3').then(d => console.log(JSON.stringify(d, null, 2)));
"
```

Expected: JSON object. At least some non-null values. If all null for every field, Haiku triggers automatically.

- [ ] **Step 3: Commit**

```bash
git add src/services/fundamentals.js
git commit -m "feat(fundamentals): Yahoo Finance + Haiku fallback for LPA/VPA/DPS"
```

---

## Task 4: Create `src/jobs/valuation.js`

**Files:**
- Create: `src/jobs/valuation.js`

- [ ] **Step 1: Create the file**

```js
'use strict';
require('dotenv').config({ override: true });
const config              = require('../config');
const { fetchPrices }     = require('../services/portfolio');
const { getFundamentals } = require('../services/fundamentals');
const { writeNote }       = require('../services/obsidian');

// ── Valuation methods ──────────────────────────────────────────────────

function bazin(dps12m) {
  if (!dps12m || dps12m <= 0) return null;
  return dps12m / 0.06;
}

function grahamClassico(lpa, vpa) {
  if (!lpa || !vpa || lpa <= 0 || vpa <= 0) return null;
  return Math.sqrt(22.5 * lpa * vpa);
}

function grahamModerno(lpa, g, Y) {
  if (!lpa || lpa <= 0 || !Y) return null;
  return (lpa * (8.5 + 2 * g) * 4.4) / Y;
}

function multiplosPL(lpa, fairPL) {
  if (!lpa || lpa <= 0 || !fairPL) return null;
  return lpa * fairPL;
}

function multiplosPVP(vpa, fairPVP) {
  if (!vpa || vpa <= 0 || !fairPVP) return null;
  return vpa * fairPVP;
}

function weightedComposite(methods) {
  const vals = Object.values(methods).filter(v => v !== null && v > 0);
  if (!vals.length) return null;
  return vals.reduce((s, v) => s + v, 0) / vals.length;
}

function verdict(discount) {
  if (discount === null) return 'SEM_DADOS';
  if (discount >= 30)  return 'COMPRA_FORTE';
  if (discount >= 15)  return 'COMPRA';
  if (discount >= -5)  return 'NEUTRO';
  if (discount >= -20) return 'CARO';
  return 'EVITE';
}

function verdictEmoji(v) {
  return { COMPRA_FORTE: '🟢', COMPRA: '🟢', NEUTRO: '🟡', CARO: '🔴', EVITE: '🔴', SEM_DADOS: '⚪' }[v] || '⚪';
}

// ── Single ticker ──────────────────────────────────────────────────────

async function valuateTicker(ticker, price) {
  if (!price) return null;
  const fund = await getFundamentals(ticker);
  const sm   = config.portfolio.sectorMultiples;
  const mult = ticker.endsWith('11') ? sm.FII : (sm[ticker] || sm.DEFAULT);
  const Y    = config.portfolio.ntnbYield;
  const g    = 5;

  const methods = {
    bazin:          bazin(fund?.dps12m),
    grahamClassico: grahamClassico(fund?.lpa, fund?.vpa),
    grahamModerno:  grahamModerno(fund?.lpa, g, Y),
    multiplosPL:    multiplosPL(fund?.lpa, mult?.fairPL),
    multiplosPVP:   multiplosPVP(fund?.vpa, mult?.fairPVP),
  };

  const composite = weightedComposite(methods);
  const precoTeto = composite ? +(composite * 0.80).toFixed(2) : null;
  const discount  = (precoTeto && price) ? +((precoTeto - price) / price * 100).toFixed(1) : null;

  return {
    ticker,
    price:      +price.toFixed(2),
    composite:  composite ? +composite.toFixed(2) : null,
    precoTeto,
    discount,
    verdict:    verdict(discount),
    methods:    Object.fromEntries(Object.entries(methods).map(([k, v]) => [k, v ? +v.toFixed(2) : null])),
    fundamentals: fund ? { lpa: fund.lpa, vpa: fund.vpa, dps12m: fund.dps12m } : null,
  };
}

// ── Note builders ──────────────────────────────────────────────────────

function buildTickerNote(r, date) {
  const m = r.methods;
  return `---
ticker: ${r.ticker}
updated: ${date}
price: ${r.price}
precoteto: ${r.precoTeto ?? 'null'}
composite: ${r.composite ?? 'null'}
discount: ${r.discount ?? 'null'}
verdict: ${r.verdict}
---
# ${r.ticker} — Valuation

**Updated:** ${date}
**Price:** R$${r.price}
**Preço Teto:** ${r.precoTeto ? 'R$' + r.precoTeto : 'N/A'}
**Composite Fair Value:** ${r.composite ? 'R$' + r.composite : 'N/A'}
**Discount to Teto:** ${r.discount !== null ? r.discount + '%' : 'N/A'}
**Verdict:** ${verdictEmoji(r.verdict)} ${r.verdict}

## Fundamentals Used
- LPA: ${r.fundamentals?.lpa ?? 'N/A'}
- VPA: ${r.fundamentals?.vpa ?? 'N/A'}
- DPS 12M: ${r.fundamentals?.dps12m ?? 'N/A'}

## Methods
| Method | Fair Value |
|--------|-----------|
| Bazin (DPS÷6%) | ${m.bazin ? 'R$' + m.bazin : 'N/A'} |
| Graham Clássico | ${m.grahamClassico ? 'R$' + m.grahamClassico : 'N/A'} |
| Graham Moderno | ${m.grahamModerno ? 'R$' + m.grahamModerno : 'N/A'} |
| Múltiplos P/L | ${m.multiplosPL ? 'R$' + m.multiplosPL : 'N/A'} |
| P/VP | ${m.multiplosPVP ? 'R$' + m.multiplosPVP : 'N/A'} |
| **Composite** | ${r.composite ? '**R$' + r.composite + '**' : 'N/A'} |
| **Preço Teto (−20% MoS)** | ${r.precoTeto ? '**R$' + r.precoTeto + '**' : 'N/A'} |
`;
}

function buildSummaryNote(results, date) {
  const rows = results
    .filter(r => r && r.precoTeto)
    .sort((a, b) => (b.discount ?? -999) - (a.discount ?? -999))
    .map(r =>
      `| ${r.ticker} | R$${r.price} | R$${r.precoTeto} | ${r.discount !== null ? r.discount + '%' : 'N/A'} | ${verdictEmoji(r.verdict)} ${r.verdict} |`
    )
    .join('\n');

  return `---
updated: ${date}
---
# Portfolio Valuation Summary

**Updated:** ${date}

| Ticker | Preço | Preço Teto | Desconto | Sinal |
|--------|-------|-----------|---------|-------|
${rows || '| — | — | — | — | — |'}
`;
}

// ── Main ───────────────────────────────────────────────────────────────

async function run() {
  console.log('[valuation] start', new Date().toISOString());
  const date = new Date().toISOString().split('T')[0];

  const allTickers = [
    ...config.portfolio.tickers.filter(t => !['BTC', 'USDBRL'].includes(t)),
    ...config.portfolio.fiiTickers,
  ];

  const prices = await fetchPrices(allTickers);
  const results = [];

  for (const ticker of allTickers) {
    const price = prices[ticker]?.price ?? null;
    console.log(`[valuation] ${ticker} @ R$${price}`);
    try {
      const r = await valuateTicker(ticker, price);
      if (r) {
        results.push(r);
        writeNote(`STOCK/valuations/${ticker}.md`, buildTickerNote(r, date));
      }
    } catch (e) {
      console.error(`[valuation] ${ticker} failed:`, e.message);
    }
  }

  writeNote('STOCK/valuations/_summary.md', buildSummaryNote(results, date));
  console.log(`[valuation] complete. ${results.length} tickers valued.`);
}

module.exports = { run };
if (require.main === module) run().catch(e => { console.error(e); process.exit(1); });
```

- [ ] **Step 2: Run valuation manually**

```bash
node src/jobs/valuation.js
```

Expected:
```
[valuation] start 2026-05-20T...
[valuation] BBAS3 @ R$24.XX
[obsidian] wrote: .../STOCK/valuations/BBAS3.md
...
[valuation] complete. N tickers valued.
```

- [ ] **Step 3: Verify Obsidian files created**

```bash
ls ~/Desktop/BRAIN/BRAIN/STOCK/valuations/
cat ~/Desktop/BRAIN/BRAIN/STOCK/valuations/_summary.md
```

Expected: `_summary.md` exists with markdown table rows.

- [ ] **Step 4: Commit**

```bash
git add src/jobs/valuation.js
git commit -m "feat(valuation): weekly 5-method preço teto engine → Obsidian vault"
```

---

## Task 5: Add npm script + worker cron

**Files:**
- Modify: `package.json`
- Modify: `worker.js`

- [ ] **Step 1: Add valuation to package.json scripts**

In `package.json`, add to `"scripts"`:
```json
"valuation": "node src/jobs/valuation.js",
```

- [ ] **Step 2: Add valuation to JOB_MAP and cron in worker.js**

In `worker.js`, add to `JOB_MAP`:
```js
valuation: './src/jobs/valuation',
```

After the existing Sunday distill cron line, add:
```js
// Friday 21:00 UTC = Saturday 05:00 CST — weekly valuation → Obsidian
cron.schedule('0 21 * * 5',  () => runJob('valuation', './src/jobs/valuation'));
```

Update the startup log:
```js
console.log('[worker] cron active (UTC): ingest=21:30 prices=22:00 analyze=22:10 brief=22:30 budget=22:50 poll=*/20 distill=Sun20:00 valuation=Fri21:00');
```

- [ ] **Step 3: Verify script**

```bash
npm run valuation
```

Expected: same output as Task 4 Step 2.

- [ ] **Step 4: Commit**

```bash
git add package.json worker.js
git commit -m "feat(worker): add valuation npm script + Friday 21:00 UTC cron"
```

---

## Task 6: Wire valuation cache into `brief.js`

**Files:**
- Modify: `src/jobs/brief.js`

- [ ] **Step 1: Import obsidian and load cache in run()**

At the top of `src/jobs/brief.js`, add after the existing requires:
```js
const { readNote } = require('../services/obsidian');
```

In the `run()` function, after the `const [packs, analysis, priceSnapshot]` Promise.all block, add:
```js
const valuationCache = readNote('STOCK/valuations/_summary.md') || '';
```

Then update the `buildDailyBriefPrompt` call:
```js
const prompt = buildDailyBriefPrompt(packs, analysis, today, priceSnapshot, valuationCache);
```

- [ ] **Step 2: Verify the require works**

```bash
node -e "const b = require('./src/jobs/brief'); console.log(typeof b.run);"
```

Expected: `function`

- [ ] **Step 3: Commit**

```bash
git add src/jobs/brief.js
git commit -m "feat(brief): load Obsidian valuation cache and pass to daily brief prompt"
```

---

## Task 7: Redesign newsletter prompt (Morning Brew style)

**Files:**
- Modify: `src/prompts/sonnet/daily_brief_html.js`

- [ ] **Step 1: Replace DAILY_BRIEF_HTML_SYSTEM**

Replace the entire `DAILY_BRIEF_HTML_SYSTEM` constant (the template literal from `const DAILY_BRIEF_HTML_SYSTEM = \`` through its closing backtick) with:

```js
const DAILY_BRIEF_HTML_SYSTEM = `You are BRAIN — a sharp, witty daily briefing editor. Think Morning Brew meets buy-side analyst.
Produce ONE complete HTML email. NO markdown, NO code fences. Start with <!DOCTYPE html>.

GLOBAL RULES (NON-NEGOTIABLE):
1. Output: Complete HTML document only. Start with <!DOCTYPE html>.
2. Story cards: max 4 lines each. No walls of text. Personality is mandatory.
3. Evidence: link every major claim or mark "(uncited)".
4. No generic filler ("markets are uncertain", "investors are watching").
5. HTML must render in Gmail (inline styles only, no <style> block, no CSS classes).
6. Token efficient: use packs as given; do NOT expand or re-fetch.
7. Deduplicate: consolidate repeating stories into 1 entry.

TONE: Smart and direct. One-sentence personality opener per section (not robotic). Dry wit OK.

OUTPUT SECTIONS (EXACT ORDER):

A) HEADER BANNER
   Title: "BRAIN Daily Brief" | Date (Asia/Shanghai) | "5-min read"

B) MARKETS FLASH — compact inline chips:
   Ibovespa | VALE3 | PETR4 | BTC | BRL/USD
   Each chip: name + price + colored arrow (↑ green / ↓ red / → gray) + change%

C) EXECUTIVE TL;DR — max 5 bullets. One line each. Bold the key signal word.

D) 🌍 MUNDO — 3 story cards. Each card format:
   [Emoji] **HEADLINE**
   What happened: 1 sentence.
   Why it matters: 1 sentence.
   What's next: 1 sentence.
   [source tag]

E) 🇧🇷 BRASIL — 3 story cards, same format as MUNDO.

F) 📊 PORTFOLIO — compact table: Ticker | Price (BRL) | Change% | Notes
   Color change%: green positive, red negative. Flag big movers (≥3%) in amber.

G) 💰 OPORTUNIDADES — use VALUATION CACHE data:
   If cache has data: table with Ticker | Preço | Preço Teto | Desconto | Sinal
   Sort by discount descending. Only show tickers with precoTeto set.
   Add 1-line macro note about Tesouro Direto / SELIC if relevant.
   If no cache: "Valuation update runs every Saturday — check Obsidian STOCK/valuations/"

H) 📅 AGENDA — 3-5 upcoming events as compact bullets with dates.

I) FOOTER — "Generated by BRAIN | Data: Yahoo Finance, NewsAPI | " + timestamp

DESIGN SYSTEM (INLINE STYLES — Gmail compatible):
bg:#f8f9fa | cards:#ffffff | text:#1a1a2e | secondary:#6c757d
green:#198754 | red:#dc3545 | amber:#fd7e14 | border:#e9ecef | accent:#0d6efd

body: background-color:#f8f9fa; margin:0; padding:20px 0; font-family:'Helvetica Neue',Arial,sans-serif
container: max-width:640px; margin:0 auto; background:#ffffff; border-radius:12px; overflow:hidden; box-shadow:0 2px 12px rgba(0,0,0,0.08)
header: background:linear-gradient(135deg,#1a1a2e 0%,#16213e 100%); padding:28px; color:white
content: padding:0 24px

SECTION HEADERS: background:#1a1a2e; color:#fff; padding:9px 14px; border-radius:8px; font-size:14px; font-weight:600; text-transform:uppercase; letter-spacing:1px; margin:24px 0 12px

STORY CARDS: background:#f8f9fa; border-radius:8px; padding:12px 14px; margin:6px 0; border-left:4px solid #0d6efd
  Brasil cards: border-left-color:#009c3b | Important: border-left-color:#dc3545
  Source tag: background:#e9ecef; color:#6c757d; font-size:11px; padding:2px 7px; border-radius:10px

MARKET CHIPS: display:inline-block; background:#f0f4ff; border:1px solid #e2e8f0; border-radius:20px; padding:4px 12px; margin:3px; font-size:13px; font-weight:600

TABLES: width:100%; border-collapse:collapse; font-size:13px; margin:10px 0
  th: background:#1a1a2e; color:#fff; padding:9px 11px; text-align:left; font-size:11px; text-transform:uppercase
  td: padding:9px 11px; border-bottom:1px solid #e9ecef
  positive: color:#198754; font-weight:600 | negative: color:#dc3545; font-weight:600

Keep total output under 3000 tokens. Prioritize visual density and personality.`;
```

- [ ] **Step 2: Update `buildDailyBriefPrompt` to accept `valuationCache`**

Replace the `buildDailyBriefPrompt` function with:

```js
function buildDailyBriefPrompt(packs, analysis, date, priceSnapshot = null, valuationCache = '') {
  const packText = (packs || []).map(p =>
    `## ${p.pack_type}\n${JSON.stringify(p.content)}`
  ).join('\n\n---\n\n');

  const whyMoved = analysis?.why_moved_payload?.why_moved || [];
  const analysisText = whyMoved.length > 0
    ? `## WHY_MOVED_PAYLOAD\n${JSON.stringify(whyMoved)}`
    : '## WHY_MOVED_PAYLOAD\nNo significant moves flagged today.';

  const pricesText = formatSnapshotForPrompt(priceSnapshot);

  const valuationSection = valuationCache
    ? `## VALUATION CACHE (use for OPORTUNIDADES section)\n${valuationCache}`
    : '## VALUATION CACHE\nNo cache yet — valuation runs every Saturday.';

  return `Generate BRAIN Daily Brief for ${date} (Asia/Shanghai timezone).

${pricesText}

---

${valuationSection}

---

${packText}

---

${analysisText}

---

Portfolio: ${config.portfolio.tickers.join(', ')}

Generate the complete Morning Brew style HTML email now. Follow the design system exactly. Output HTML only, start with <!DOCTYPE html>.`;
}
```

- [ ] **Step 3: Verify exports unchanged**

```bash
node -e "const m = require('./src/prompts/sonnet/daily_brief_html'); console.log(Object.keys(m));"
```

Expected: `[ 'DAILY_BRIEF_HTML_SYSTEM', 'buildDailyBriefPrompt' ]`

- [ ] **Step 4: Commit**

```bash
git add src/prompts/sonnet/daily_brief_html.js
git commit -m "feat(newsletter): Morning Brew style redesign + Oportunidades section"
```

---

## Task 8: End-to-end verification

- [ ] **Step 1: Dry-run prompt builder (no email sent)**

```bash
node -e "
require('dotenv').config();
const { getPacksForDate, getDailyAnalysis, getPriceSnapshot } = require('./src/services/supabase');
const { readNote } = require('./src/services/obsidian');
const { buildDailyBriefPrompt, DAILY_BRIEF_HTML_SYSTEM } = require('./src/prompts/sonnet/daily_brief_html');
const today = new Date().toISOString().split('T')[0];
Promise.all([
  getPacksForDate(new Date()).catch(() => []),
  getDailyAnalysis(today).catch(() => null),
  getPriceSnapshot(today).catch(() => null),
]).then(([packs, analysis, snap]) => {
  const cache = readNote('STOCK/valuations/_summary.md') || '';
  const prompt = buildDailyBriefPrompt(packs, analysis, today, snap, cache);
  console.log('PROMPT LENGTH:', prompt.length);
  console.log('CACHE INCLUDED:', cache.length > 0);
  console.log('--- FIRST 600 CHARS ---');
  console.log(prompt.slice(0, 600));
});
"
```

Expected: `CACHE INCLUDED: true` (after running `npm run valuation` first).

- [ ] **Step 2: Send the full brief (⚠️ sends real email)**

Only run after confirming Step 1 looks correct:
```bash
npm run brief
```

Check email in inbox for: Markets Flash chips, story cards with What/Why/Next format, Oportunidades table.

- [ ] **Step 3: Final commit**

```bash
git add -A
git commit -m "feat: valuation engine + Morning Brew newsletter + Oportunidades complete"
```

---

## Self-Review Checklist

**Spec coverage:**
- ✅ Weekly valuation → Obsidian: Tasks 2, 3, 4, 5
- ✅ 5-method valuation (Bazin, Graham Classic, Graham Modern, P/L, P/VP): Task 4
- ✅ 20% margin of safety → preço teto (`composite * 0.80`): Task 4
- ✅ FII detection (`ticker.endsWith('11')`): Tasks 3, 4
- ✅ Yahoo Finance primary + Haiku fallback (Investidor10): Task 3
- ✅ Morning Brew style newsletter: Task 7
- ✅ Oportunidades section with valuation cache: Tasks 6, 7
- ✅ All saves go to Obsidian vault: Tasks 2, 4
- ✅ Friday 21:00 UTC cron (Saturday 5am CST): Task 5
- ✅ `npm run valuation` script: Task 5
- ✅ valuationCache wired: Obsidian → brief.js → prompt: Tasks 6, 7

**Type consistency:**
- `getFundamentals(ticker)` → `{ ticker, isFII, lpa, vpa, dps12m, pL, pVp, dy }` — consistent Tasks 3 & 4
- `fetchPrices(tickers)` → `{ [ticker]: { price, ... } }` — existing signature, used correctly Task 4
- `writeNote(relativePath, markdown)` / `readNote(relativePath)` — consistent Tasks 2, 4, 6
- `buildDailyBriefPrompt(packs, analysis, date, priceSnapshot, valuationCache)` — Task 6 passes matches Task 7 signature

**No placeholders:** All code blocks complete. No TBD/TODO.
