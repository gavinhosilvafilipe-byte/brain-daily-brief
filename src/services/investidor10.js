'use strict';
// Fetch a PUBLIC investidor10 wallet via its wallet-app proxy API.
// Requires the public share hash (the ?h= token on the public wallet URL).
const config = require('../config');

const BASE = 'https://investidor10.com.br';

// investidor10 ticker_type → BRAIN asset_class
const TYPE_MAP = {
  Ticker:           'B3_STOCK',
  Fii:              'FII',
  Treasure:         'TESOURO',
  Stock:            'US_STOCK',
  EtfInternational: 'ETF_INTL',
};
const CATEGORY = {
  B3_STOCK: 'B3 Stocks', FII: 'FIIs', TESOURO: 'Tesouro',
  US_STOCK: 'US Stocks', ETF_INTL: 'ETFs Intl',
};

function headers(walletId, hash) {
  return {
    'User-Agent': 'Mozilla/5.0',
    'Referer': `${BASE}/wallet/public/${walletId}?h=${hash}`,
    'Accept': 'application/json',
    'x-requested-with': 'XMLHttpRequest',
    'h': hash,
  };
}

async function apiGet(path, walletId, hash) {
  const r = await fetch(`${BASE}/wallet/api/proxy/wallet-app/${path}`, { headers: headers(walletId, hash) });
  if (!r.ok) throw new Error(`investidor10 ${path} -> HTTP ${r.status}`);
  return r.json();
}

// Normalize one raw asset record into a BRAIN position row.
function normalize(a) {
  const cls   = TYPE_MAP[a.ticker_type] || a.ticker_type || 'OTHER';
  const qty   = a.quantity != null ? Number(a.quantity) : null;
  const mkt   = Number(a.equity_total ?? a.equity_brl ?? 0);
  const appr  = a.appreciation != null ? Number(a.appreciation) : null;   // total return %
  // Derive invested cost basis from current value + total return.
  const invested = appr != null && appr > -100 ? mkt / (1 + appr / 100) : mkt;
  const lastPrice = qty ? mkt / qty : null;
  return {
    ticker: (a.ticker || a.ticker_name || '').trim(),
    ticker_name: a.ticker_name || a.ticker || '',
    asset_class: cls,
    category: CATEGORY[cls] || cls,
    quantity: qty,
    market_value_brl: Math.round(mkt),
    invested_brl: Math.round(invested),
    last_price: lastPrice,
    return_pct: appr,
    percent_wallet: a.percent_wallet != null ? Number(a.percent_wallet) : null,
    percent_ideal:  a.percent_ideal  != null ? Number(a.percent_ideal)  : null,
    buy: a.buy || null,                        // "SIM" / "NÃO"
    rating: a.rating ?? null,
  };
}

// Returns { metrics:{equity,applied,profit,variation}, assets:[normalized...] }.
async function fetchWallet(walletId = config.investidor10.walletId, hash = config.investidor10.walletHash) {
  if (!walletId || !hash) throw new Error('INVESTIDOR10_WALLET_ID / INVESTIDOR10_WALLET_HASH not set');
  const [actives, metricsRaw] = await Promise.all([
    apiGet(`summary/actives/${walletId}/all?raw=1`, walletId, hash),
    apiGet(`summary/metrics/${walletId}?type=without-earnings&raw=1`, walletId, hash).catch(() => null),
  ]);
  const assets = (actives?.data || []).map(normalize).filter(a => a.ticker);
  const equity  = Number(metricsRaw?.equity  ?? assets.reduce((s, a) => s + a.market_value_brl, 0));
  const applied = Number(metricsRaw?.applied ?? assets.reduce((s, a) => s + a.invested_brl, 0));
  return {
    metrics: {
      equity, applied,
      profit: equity - applied,
      variation: metricsRaw?.variation != null ? Number(metricsRaw.variation) : null,
    },
    assets,
    count: actives?.total ?? assets.length,
  };
}

module.exports = { fetchWallet, TYPE_MAP, CATEGORY };
