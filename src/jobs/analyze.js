'use strict';
require('dotenv').config({ override: true });
const { callHaiku }                            = require('../services/anthropic');
const { getPacksForDate, saveDailyAnalysis, getPriceSnapshot } = require('../services/supabase');
const { addDeepDiveCandidate }                 = require('../services/notion');
const { formatSnapshotForPrompt }              = require('../services/portfolio');
const config = require('../config');

const SYSTEM = `You analyze news packs and portfolio holdings to find "why things moved" and identify deep dive candidates.
INPUT: News packs (JSON) + portfolio tickers + move threshold: ${config.portfolio.bigMoveThreshold}%
TASK:
1. For each portfolio ticker, score news impact 1-10
2. Identify top 5 "why moved" drivers with confidence (Low/Med/High)
3. Flag tickers for deep dive if: news_impact_score > 6 OR story mentions ticker directly
OUTPUT JSON (only):
{
  "date": "YYYY-MM-DD",
  "why_moved": [
    {
      "ticker": "...",
      "drivers": ["driver1"],
      "confidence": "Med",
      "news_impact_score": 7,
      "flag_for_deepdive": true,
      "deep_dive_reason": "..."
    }
  ],
  "top_5_drivers": ["...", "...", "...", "...", "..."]
}`;

async function run() {
  console.log('[analyze] start', new Date().toISOString());
  const today = new Date().toISOString().split('T')[0];

  const [packs, priceSnapshot] = await Promise.all([
    getPacksForDate(new Date()),
    getPriceSnapshot(today).catch(() => null),
  ]);

  if (!packs.length) { console.log('[analyze] no packs today, skipping'); return; }

  // Compact JSON (no pretty-print) saves ~30% tokens on pack payloads
  const packsText     = packs.map(p => `## ${p.pack_type}\n${JSON.stringify(p.content)}`).join('\n\n---\n\n');
  const pricesText    = formatSnapshotForPrompt(priceSnapshot);
  const portfolioText = `Portfolio: ${config.portfolio.tickers.join(', ')}`;

  const result = await callHaiku(
    [{ role: 'user', content: `${pricesText}\n\n${portfolioText}\n\n${packsText}` }],
    SYSTEM, 'analyze'
  );

  let parsed;
  try   { parsed = JSON.parse(result.content); }
  catch { parsed = { date: today, why_moved: [], parse_error: true, raw: result.content }; }

  await saveDailyAnalysis(today, parsed, { tickers: config.portfolio.tickers });
  console.log(`[analyze] flagged ${(parsed.why_moved || []).filter(w => w.flag_for_deepdive).length} tickers for deep dive`);

  for (const item of (parsed.why_moved || []).filter(w => w.flag_for_deepdive)) {
    try {
      await addDeepDiveCandidate({
        ticker: item.ticker,
        reason: item.deep_dive_reason,
        whatWeKnow: (item.drivers || []).join('; '),
        whatWeNeed: `Why did ${item.ticker} move? Confidence: ${item.confidence}`,
        confidence: (item.news_impact_score || 5) * 10,
      });
      console.log(`[analyze] queued deep dive: ${item.ticker}`);
    } catch (e) {
      console.error(`[analyze] notion queue failed for ${item.ticker}:`, e.message);
    }
  }
}

module.exports = { run };
if (require.main === module) run().catch(e => { console.error(e); process.exit(1); });
