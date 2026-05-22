'use strict';
require('dotenv').config({ override: true });
const { parsePortfolio }       = require('../services/portfolio_holdings');
const { fetchPrices }          = require('../services/portfolio');
const { getPrecoTeto, getPortfolioPositions, savePortfolioPositions } = require('../services/supabase');
const { syncPortfolio }        = require('../services/notion');
const { writeNote }            = require('../services/obsidian');

// Flatten preço-teto computed {stocks:{}, fiis:{}} → {TICKER:{status,teto,margin}}
function tetoMap(computed) {
  const out = {};
  for (const grp of [computed?.stocks, computed?.fiis]) {
    if (!grp) continue;
    for (const [tk, v] of Object.entries(grp)) out[tk] = { status: v.status, teto: v.teto, margin: v.margin };
  }
  return out;
}

const CAT = { B3_STOCK: 'B3 Stocks', FII: 'FIIs', CRYPTO: 'Crypto', TESOURO: 'Tesouro' };

// Reconstruct parser-shaped positions from Supabase rows (CI fallback when Portfolio.md absent).
function dbToPositions(rows) {
  return rows.map(r => ({
    ticker: r.ticker, asset_class: r.asset_class, category: CAT[r.asset_class] || r.asset_class,
    quantity: r.quantity, invested_brl: r.current_value_brl, avg_price: r.avg_price,
    avg_price_with_div: r.avg_price_with_div, pnl_ex: r.rendimento_sem_prov, pnl_inc: r.rendimento_com_prov,
    ret_ex: r.rentab_sem_prov, ret_inc: r.rentab_com_prov,
  }));
}

function marketValue(p, price, usdbrl) {
  if (p.asset_class === 'TESOURO') return p.invested_brl;          // no live feed → carry cost
  if (price == null) return p.invested_brl;                         // fetch miss → carry cost
  if (p.asset_class === 'CRYPTO') return (p.quantity || 0) * price * (usdbrl || 1);
  return (p.quantity || 0) * price;
}

const brl = n => n == null ? '—' : `R$${Number(n).toLocaleString('pt-BR', { maximumFractionDigits: 0 })}`;
const pct = n => n == null ? '—' : `${n >= 0 ? '+' : ''}${Number(n).toFixed(2)}%`;

function buildLiveNote(rows, date) {
  const totInv = rows.reduce((a, r) => a + (r.current_value_brl || 0), 0);
  const totMkt = rows.reduce((a, r) => a + (r.market_value_brl || 0), 0);
  const totPnl = rows.reduce((a, r) => a + (r.rendimento_com_prov || 0), 0);
  const movers = rows.filter(r => r.day_change_pct != null)
    .sort((a, b) => Math.abs(b.day_change_pct) - Math.abs(a.day_change_pct)).slice(0, 5);

  const head = `---
title: Filipe Portfolio — Live (auto)
updated: ${date}
source: brain-brief
note: Derived mirror. Source of truth = Portfolio.md. Do not edit by hand.
tags: [portfolio, live, brain-brief]
---

# Portfolio — Live Snapshot (${date})

> Auto-generated each pipeline run. Marks Portfolio.md holdings to market.

**Investido:** ${brl(totInv)}  •  **Valor de mercado:** ${brl(totMkt)}  •  **P&L (c/ div):** ${brl(totPnl)}

## Maiores movimentos do dia
${movers.length ? movers.map(m => `- **${m.ticker}** ${pct(m.day_change_pct)} → ${brl(m.market_value_brl)}`).join('\n') : '- Sem dados de variação hoje.'}

## Posições

| Ticker | Categoria | Qtd | Investido | Valor Atual | Δ Dia | P&L c/ div | Teto | Sinal |
|--------|-----------|-----|-----------|-------------|-------|-----------|------|-------|`;

  const body = rows.map(r =>
    `| ${r.ticker} | ${r.asset_class} | ${r.quantity ?? '—'} | ${brl(r.current_value_brl)} | ${brl(r.market_value_brl)} | ${pct(r.day_change_pct)} | ${brl(r.rendimento_com_prov)} | ${r.teto_price ?? '—'} | ${r.teto_status || '—'} |`
  ).join('\n');

  return `${head}\n${body}\n`;
}

async function run() {
  console.log('[portfolio-sync] start', new Date().toISOString());
  const today = new Date().toISOString().split('T')[0];

  let { positions, updated } = parsePortfolio();
  let source = `Portfolio.md (updated ${updated})`;
  if (!positions.length) {
    const db = await getPortfolioPositions().catch(() => []);
    positions = dbToPositions(db);
    source = 'Supabase (Portfolio.md unavailable — CI daily MTM off synced copy)';
  }
  if (!positions.length) { console.error('[portfolio-sync] no positions from Portfolio.md or Supabase — abort'); return; }
  console.log(`[portfolio-sync] ${positions.length} positions from ${source}`);

  const fetchList = [...new Set(positions.filter(p => p.asset_class !== 'TESOURO').map(p => p.ticker).concat('USDBRL'))];
  const [prices, teto, existing] = await Promise.all([
    fetchPrices(fetchList).catch(e => { console.error('[portfolio-sync] price fetch:', e.message); return {}; }),
    getPrecoTeto().catch(() => null),
    getPortfolioPositions().catch(() => []),
  ]);
  const usdbrl  = prices.USDBRL?.price || null;
  const tetos   = tetoMap(teto?.computed);
  const prevMkt = Object.fromEntries(existing.map(r => [r.ticker, r.market_value_brl]));

  const rows = positions.map(p => {
    const px  = prices[p.ticker]?.price ?? null;
    const mkt = marketValue(p, px, usdbrl);
    const t   = tetos[p.ticker] || {};
    return {
      ticker: p.ticker, asset_class: p.asset_class, quantity: p.quantity,
      current_value_brl: p.invested_brl,                // cost basis (canonical)
      avg_price: p.avg_price, avg_price_with_div: p.avg_price_with_div,
      rendimento_sem_prov: p.pnl_ex, rendimento_com_prov: p.pnl_inc,
      rentab_sem_prov: p.ret_ex, rentab_com_prov: p.ret_inc,
      market_value_brl: mkt != null ? Math.round(mkt) : null,
      prev_market_value_brl: prevMkt[p.ticker] ?? null,
      day_change_pct: prices[p.ticker]?.changePct ?? null,
      last_price: px,
      teto_status: t.status ?? null, teto_price: t.teto ?? null, teto_margin: t.margin ?? null,
      synced_at: new Date().toISOString(),
    };
  });

  await savePortfolioPositions(rows);
  console.log(`[portfolio-sync] Supabase upserted ${rows.length} rows`);

  try { await syncPortfolio(positions.map(p => ({ ...p }))); }
  catch (e) { console.error('[portfolio-sync] notion:', e.message); }

  writeNote('STOCK/Portfolio-Live.md', buildLiveNote(rows, today));
  console.log('[portfolio-sync] done');
  return { rows, today };
}

module.exports = { run };
if (require.main === module) run().catch(e => { console.error(e); process.exit(1); });
