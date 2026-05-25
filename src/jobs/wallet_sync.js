'use strict';
require('dotenv').config({ override: true });
const { fetchWallet }   = require('../services/investidor10');
const { getPrecoTeto, getPortfolioPositions, savePortfolioPositions, deletePositionsNotIn } = require('../services/supabase');
const { syncPortfolio } = require('../services/notion');
const { writeNote }     = require('../services/obsidian');
const config            = require('../config');

// Flatten preço-teto computed {stocks:{}, fiis:{}} → {TICKER:{status,teto,margin}}
function tetoMap(computed) {
  const out = {};
  for (const grp of [computed?.stocks, computed?.fiis]) {
    if (!grp) continue;
    for (const [tk, v] of Object.entries(grp)) out[tk] = { status: v.status, teto: v.teto, margin: v.margin };
  }
  return out;
}

const brl = n => n == null ? '—' : `R$${Number(n).toLocaleString('pt-BR', { maximumFractionDigits: 0 })}`;
const pct = n => n == null ? '—' : `${n >= 0 ? '+' : ''}${Number(n).toFixed(2)}%`;

function buildLiveNote(rows, m, date) {
  const head = `---
title: Filipe Portfolio — Live (investidor10 mirror)
updated: ${date}
source: brain-brief
note: Auto-mirrored from investidor10 public wallet. Do not edit by hand.
tags: [portfolio, live, wallet, brain-brief]
---

# Carteira — Espelho investidor10 (${date})

**Patrimônio:** ${brl(m.equity)}  •  **Investido:** ${brl(m.applied)}  •  **Lucro:** ${brl(m.profit)} (${pct(m.variation)})

| Ticker | Classe | Qtd | Valor | Retorno | % Carteira | % Ideal | Comprar | Teto |
|--------|--------|-----|-------|---------|-----------|---------|---------|------|`;
  const body = rows.map(r => {
    const n = r._wallet || {};
    return `| ${r.ticker} | ${r.asset_class} | ${r.quantity ?? '—'} | ${brl(r.market_value_brl)} | ${pct(r.rentab_com_prov)} | ${n.percent_wallet != null ? n.percent_wallet.toFixed(2) + '%' : '—'} | ${n.percent_ideal != null ? n.percent_ideal.toFixed(2) + '%' : '—'} | ${n.buy || '—'} | ${r.teto_status || '—'} |`;
  }).join('\n');
  return `${head}\n${body}\n`;
}

async function run() {
  console.log('[wallet-sync] start', new Date().toISOString());
  const today = new Date().toISOString().split('T')[0];

  const wallet = await fetchWallet();
  console.log(`[wallet-sync] fetched ${wallet.count} assets · equity ${brl(wallet.metrics.equity)}`);

  // Hide excluded asset classes (e.g. CRYPTO). Reversible via EXCLUDE_ASSET_CLASSES.
  const excluded = config.portfolio.excludeAssetClasses || [];
  let assets = wallet.assets;
  if (excluded.length) {
    const before = assets.length;
    assets = assets.filter(a => !excluded.includes((a.asset_class || '').toUpperCase()));
    if (assets.length < before) console.log(`[wallet-sync] excluded ${before - assets.length} position(s) of class [${excluded.join(', ')}]`);
  }

  const [teto, existing] = await Promise.all([
    getPrecoTeto().catch(() => null),
    getPortfolioPositions().catch(() => []),
  ]);
  const tetos   = tetoMap(teto?.computed);
  const prevMkt = Object.fromEntries(existing.map(r => [r.ticker, r.market_value_brl]));

  const rows = assets.map(a => {
    const t       = tetos[a.ticker] || {};
    const invested = a.invested_brl;
    const mkt      = a.market_value_brl;
    const pnl      = mkt - invested;
    const prev     = prevMkt[a.ticker] ?? null;
    const dayChg   = prev != null && prev > 0 ? ((mkt - prev) / prev) * 100 : null;
    return {
      ticker: a.ticker, asset_class: a.asset_class, quantity: a.quantity,
      current_value_brl: invested,
      avg_price: a.quantity ? invested / a.quantity : null,
      avg_price_with_div: null,
      rendimento_sem_prov: pnl, rendimento_com_prov: pnl,
      rentab_sem_prov: a.return_pct, rentab_com_prov: a.return_pct,
      market_value_brl: mkt, prev_market_value_brl: prev,
      day_change_pct: dayChg,
      last_price: a.last_price,
      teto_status: t.status ?? null, teto_price: t.teto ?? null, teto_margin: t.margin ?? null,
      notes: `w:${a.percent_wallet?.toFixed(2) ?? '?'}|ideal:${a.percent_ideal?.toFixed(2) ?? '?'}|buy:${a.buy ?? '?'}`,
      synced_at: new Date().toISOString(),
      _wallet: a,   // transient, for note rendering
    };
  });

  const dbRows = rows.map(({ _wallet, ...r }) => r);
  await savePortfolioPositions(dbRows);
  // Reconcile: drop any positions no longer in the wallet (sold/renamed/excluded).
  const keep = dbRows.map(r => r.ticker);
  const removed = await deletePositionsNotIn(keep).catch(e => { console.error('[wallet-sync] reconcile:', e.message); return 0; });
  console.log(`[wallet-sync] Supabase upserted ${dbRows.length} rows, removed ${removed} stale`);

  // Notion mirror (upsert by ticker into portfolio DB)
  try {
    await syncPortfolio(assets.map(a => ({
      ticker: a.ticker, category: a.category, quantity: a.quantity,
      invested_brl: a.invested_brl, avg_price: a.quantity ? a.invested_brl / a.quantity : null,
      avg_price_with_div: null,
      pnl_ex: a.market_value_brl - a.invested_brl, pnl_inc: a.market_value_brl - a.invested_brl,
      ret_ex: a.return_pct, ret_inc: a.return_pct,
    })));
  } catch (e) { console.error('[wallet-sync] notion:', e.message); }

  writeNote('STOCK/Portfolio-Live.md', buildLiveNote(rows, wallet.metrics, today));
  console.log('[wallet-sync] done');
  return { rows: dbRows, metrics: wallet.metrics, today };
}

module.exports = { run };
if (require.main === module) run().catch(e => { console.error(e); process.exit(1); });
