'use strict';
require('dotenv').config({ override: true });
const { fetchPortfolioSnapshot }               = require('../services/portfolio');
const { savePriceSnapshot }                    = require('../services/supabase');
const config = require('../config');

async function run() {
  console.log('[prices] start', new Date().toISOString());
  const today = new Date().toISOString().split('T')[0];

  let snapshot;
  try {
    snapshot = await fetchPortfolioSnapshot(config.portfolio.tickers);
  } catch (e) {
    console.error('[prices] fetch failed (non-fatal):', e.message);
    return null;
  }

  await savePriceSnapshot(today, snapshot);

  const moversText = snapshot.movers.length
    ? snapshot.movers.map(m =>
        `${m.ticker} ${m.changePct >= 0 ? '+' : ''}${m.changePct.toFixed(2)}%`
      ).join(', ')
    : 'none';

  console.log(`[prices] saved ${Object.keys(snapshot.prices).length} tickers. Big movers: ${moversText}`);
  return snapshot;
}

module.exports = { run };
if (require.main === module) run().catch(e => { console.error(e); process.exit(1); });
