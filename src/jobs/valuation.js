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
  const vEmoji = verdictEmoji(r.verdict);
  const calloutType = { COMPRA_FORTE: 'success', COMPRA: 'success', NEUTRO: 'warning', CARO: 'danger', EVITE: 'danger', SEM_DADOS: 'info' }[r.verdict] || 'info';

  return `---
ticker: ${r.ticker}
updated: ${date}
price: ${r.price}
precoteto: ${r.precoTeto ?? 'null'}
composite: ${r.composite ?? 'null'}
discount: ${r.discount ?? 'null'}
verdict: ${r.verdict}
tags: [valuation, b3, stock]
---
# ${r.ticker} — Valuation

> [!${calloutType}] ${vEmoji} ${r.verdict}
> **Preço Teto:** ${r.precoTeto ? 'R$' + r.precoTeto : 'N/A'} | **Desconto:** ${r.discount !== null ? r.discount + '%' : 'N/A'} | **Updated:** ${date}

## 📊 Fair Value Summary

| | |
|---|---|
| **Preço Atual** | R$${r.price} |
| **Composite Fair Value** | ${r.composite ? 'R$' + r.composite : 'N/A'} |
| **Preço Teto (−20% MoS)** | ${r.precoTeto ? '**R$' + r.precoTeto + '**' : 'N/A'} |
| **Desconto ao Teto** | ${r.discount !== null ? r.discount + '%' : 'N/A'} |

## 🧮 Methods

| Método | Valor Justo |
|--------|------------|
| Bazin (DPS÷6%) | ${m.bazin ? 'R$' + m.bazin : '—'} |
| Graham Clássico | ${m.grahamClassico ? 'R$' + m.grahamClassico : '—'} |
| Graham Moderno | ${m.grahamModerno ? 'R$' + m.grahamModerno : '—'} |
| Múltiplos P/L | ${m.multiplosPL ? 'R$' + m.multiplosPL : '—'} |
| P/VP | ${m.multiplosPVP ? 'R$' + m.multiplosPVP : '—'} |

## 📋 Fundamentals Used

| | |
|---|---|
| LPA | ${r.fundamentals?.lpa ?? '—'} |
| VPA | ${r.fundamentals?.vpa ?? '—'} |
| DPS 12M | ${r.fundamentals?.dps12m ?? '—'} |
`;
}

function buildSummaryNote(results, date) {
  const sorted = results
    .filter(r => r && r.precoTeto)
    .sort((a, b) => (b.discount ?? -999) - (a.discount ?? -999));

  const tableRows = sorted
    .map(r => `| [[${r.ticker}\\|${r.ticker}]] | R$${r.price} | R$${r.precoTeto} | ${r.discount !== null ? r.discount + '%' : 'N/A'} | ${verdictEmoji(r.verdict)} ${r.verdict} |`)
    .join('\n');

  const opportunities = sorted.filter(r => (r.discount ?? 0) >= 15);
  const oppBlock = opportunities.length
    ? opportunities.map(r => `> - **${r.ticker}** — ${r.discount}% abaixo do teto (R$${r.price} vs R$${r.precoTeto})`).join('\n')
    : '> Nenhuma oportunidade com desconto ≥ 15% esta semana.';

  return `---
updated: ${date}
tags: [valuation, portfolio, summary]
---
# 💼 Portfolio Valuation Summary

> [!info] Last Update
> Valuation runs every Saturday 5am CST. Next run: automatically via cron.

## 📊 All Holdings

| Ticker | Preço | Preço Teto | Desconto | Sinal |
|--------|-------|-----------|---------|-------|
${tableRows || '| — | — | — | — | — |'}

## 🟢 Top Opportunities

> [!tip] Tickers trading ≥15% below preço teto
${oppBlock}
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
