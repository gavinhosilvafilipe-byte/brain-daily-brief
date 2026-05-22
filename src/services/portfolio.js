'use strict';
const axios  = require('axios');
const config = require('../config');

const YAHOO_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
  'Accept': 'application/json',
  'Accept-Language': 'en-US,en;q=0.9',
  'Referer': 'https://finance.yahoo.com',
  'Origin': 'https://finance.yahoo.com',
};

// ── Source 1: Yahoo Finance v8/chart — B3 stocks (free, no key needed) ──
async function fetchB3(tickers) {
  const b3 = tickers.filter(t => !['BTC','USDBRL'].includes(t));
  if (!b3.length) return {};
  const out = {};
  // Parallel fetch per ticker (v8/chart is per-symbol)
  await Promise.allSettled(b3.map(async ticker => {
    const symbol = `${ticker}.SA`;
    const resp = await axios.get(`https://query1.finance.yahoo.com/v8/finance/chart/${symbol}`, {
      params: { interval: '1d', range: '2d' },
      headers: YAHOO_HEADERS,
      timeout: 12000,
    });
    const meta = resp.data?.chart?.result?.[0]?.meta;
    if (!meta) return;
    const prev = meta.chartPreviousClose ?? meta.previousClose ?? null;
    const price = meta.regularMarketPrice ?? null;
    const changePct = (price != null && prev) ? ((price - prev) / prev) * 100 : null;
    out[ticker] = {
      ticker, price, changePct, change: (price != null && prev) ? price - prev : null,
      prevClose: prev, volume: meta.regularMarketVolume ?? null,
      currency: meta.currency ?? 'BRL', timestamp: new Date().toISOString(),
    };
  }));
  return out;
}

// ── Source 2: CoinGecko — BTC + ETH in USD (free, no key) ───────────────
async function fetchCrypto(tickers) {
  const coinMap = { BTC: 'bitcoin', ETH: 'ethereum' };
  const ids = tickers.filter(t => coinMap[t]).map(t => coinMap[t]).join(',');
  if (!ids) return {};
  const resp = await axios.get('https://api.coingecko.com/api/v3/simple/price', {
    params: { ids, vs_currencies: 'usd', include_24hr_change: 'true' },
    timeout: 10000,
  });
  const out = {};
  for (const [ticker, coinId] of Object.entries(coinMap)) {
    if (!tickers.includes(ticker)) continue;
    const d = resp.data?.[coinId];
    if (!d) continue;
    out[ticker] = { ticker, price: d.usd ?? null, changePct: d.usd_24h_change ?? null,
      change: null, prevClose: null, volume: null, currency: 'USD', timestamp: new Date().toISOString() };
  }
  return out;
}

// ── Source 3: AwesomeAPI — USDBRL (free, no key) ────────────────────────
async function fetchUSDRBRL() {
  const resp = await axios.get('https://economia.awesomeapi.com.br/json/last/USD-BRL', { timeout: 10000 });
  const r = resp.data?.USDBRL;
  if (!r) return null;
  return { ticker: 'USDBRL', price: parseFloat(r.bid) ?? null,
    changePct: parseFloat(r.pctChange) ?? null, change: parseFloat(r.varBid) ?? null,
    prevClose: null, volume: null, currency: 'BRL', timestamp: new Date().toISOString() };
}

async function fetchPrices(tickers = config.portfolio.tickers) {
  const [stocks, crypto, fx] = await Promise.allSettled([
    fetchB3(tickers),
    fetchCrypto(tickers),
    tickers.includes('USDBRL') ? fetchUSDRBRL() : Promise.resolve(null),
  ]);
  const map = {};
  if (stocks.status === 'fulfilled') Object.assign(map, stocks.value);
  else console.error('[portfolio] B3 failed:', stocks.reason?.message);
  if (crypto.status === 'fulfilled') Object.assign(map, crypto.value);
  else console.error('[portfolio] crypto failed:', crypto.reason?.message);
  if (fx.status === 'fulfilled' && fx.value) map.USDBRL = fx.value;
  else if (fx.status === 'rejected') console.error('[portfolio] USDBRL failed:', fx.reason?.message);
  return map;
}

async function fetchPortfolioSnapshot(tickers = config.portfolio.tickers) {
  const prices    = await fetchPrices(tickers);
  const threshold = config.portfolio.bigMoveThreshold;
  const movers    = Object.values(prices)
    .filter(p => p.changePct !== null && Math.abs(p.changePct) >= threshold)
    .sort((a, b) => Math.abs(b.changePct) - Math.abs(a.changePct));
  return { prices, movers, threshold, fetchedAt: new Date().toISOString() };
}

function formatSnapshotForPrompt(snapshot) {
  if (!snapshot?.prices) return 'Portfolio prices unavailable.';
  const lines = Object.values(snapshot.prices).map(p => {
    const pct   = p.changePct != null ? `${p.changePct >= 0 ? '+' : ''}${p.changePct.toFixed(2)}%` : 'n/a';
    const price = p.price     != null ? p.price.toFixed(2) : 'n/a';
    return `${p.ticker}: ${price} ${p.currency} (${pct})`;
  });
  const moverLine = snapshot.movers.length
    ? `BIG MOVERS (>=${snapshot.threshold}%): ${snapshot.movers.map(m => `${m.ticker} ${m.changePct >= 0 ? '+' : ''}${m.changePct.toFixed(2)}%`).join(', ')}`
    : `No moves >= ${snapshot.threshold}%`;
  return `PORTFOLIO PRICES (${snapshot.fetchedAt.substring(0, 10)}):\n${lines.join('\n')}\n${moverLine}`;
}

module.exports = { fetchPrices, fetchPortfolioSnapshot, formatSnapshotForPrompt };
