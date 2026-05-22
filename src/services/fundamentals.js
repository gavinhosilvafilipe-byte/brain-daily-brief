'use strict';
const axios       = require('axios');
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
