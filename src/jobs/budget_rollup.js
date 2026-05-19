'use strict';
require('dotenv').config({ override: true });
const { getDailyCosts, getMonthlyCosts } = require('../services/supabase');
const { logBudget } = require('../services/notion');

async function run() {
  const today      = new Date().toISOString().split('T')[0];
  const yearMonth  = today.substring(0, 7);
  const dayOfMonth = new Date().getDate();

  const [daily, monthly] = await Promise.all([
    getDailyCosts(today),
    getMonthlyCosts(yearMonth),
  ]);

  const agg = { haiku: { calls: 0, cost: 0 }, sonnet: { calls: 0, cost: 0 }, deepDives: 0 };
  for (const row of daily) {
    if (row.model.includes('haiku')) { agg.haiku.calls++; agg.haiku.cost += row.cost_usd; }
    else                             { agg.sonnet.calls++; agg.sonnet.cost += row.cost_usd; }
    if (row.job_type === 'deepdive') agg.deepDives++;
  }

  const monthlyTotal   = monthly.reduce((s, r) => s + r.cost_usd, 0);
  const monthProjected = dayOfMonth > 0 ? (monthlyTotal / dayOfMonth) * 30 : 0;

  await logBudget({
    date: today,
    haikuCalls: agg.haiku.calls,   haikuCost: agg.haiku.cost,
    sonnetCalls: agg.sonnet.calls, sonnetCost: agg.sonnet.cost,
    deepDivesRun: agg.deepDives,
    monthlyTotal, monthProjected, alertThreshold: 100,
  });

  const dailyTotal = agg.haiku.cost + agg.sonnet.cost;
  console.log(`[budget] daily: $${dailyTotal.toFixed(4)} | monthly projected: $${monthProjected.toFixed(2)}`);
  if (monthProjected > 100) console.warn(`[budget] ALERT: projected $${monthProjected.toFixed(2)} > $100`);
}

module.exports = { run };
if (require.main === module) run().catch(e => { console.error(e); process.exit(1); });
