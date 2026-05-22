'use strict';
require('dotenv').config({ override: true });
const { callHaiku, parseJsonLoose }            = require('../services/anthropic');
const { getPacksForDate, saveDailyAnalysis, getPriceSnapshot } = require('../services/supabase');
const { addDeepDiveCandidate }                 = require('../services/notion');
const { formatSnapshotForPrompt }              = require('../services/portfolio');
const { saveSnippet, getContext }              = require('../services/stock_news');
const config = require('../config');

const SYSTEM = `You analyze news packs and portfolio holdings to find "why things moved" and identify deep dive candidates.
INPUT: News packs (JSON) + portfolio tickers + move threshold: ${config.portfolio.bigMoveThreshold}%
If EXISTING STOCK MEMORY is provided, use it to deepen the WHY explanation — connect today's move to the historical catalyst (e.g. "VALE3 +5% today is continuation of the Carajás expansion announced 2026-04-10: steel demand thesis playing out ahead of 2028 ramp"). Always state the transmission mechanism. Never just say "same driver as yesterday" — explain WHY that driver is still moving the price.
TASK:
1. For each portfolio ticker, score news impact 1-10
2. Identify top 5 "why moved" drivers with confidence (Low/Med/High)
3. Flag tickers for deep dive if: news_impact_score > 6 OR story mentions ticker directly
4. For any news with multi-month or multi-year price relevance (new project, acquisition, regulatory shift, long-horizon catalyst), extract a memory snippet to save — be selective, 1-3 snippets max per day
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
  "top_5_drivers": ["...", "...", "...", "...", "..."],
  "memory_snippets": [
    {
      "ticker": "VALE3",
      "headline": "Vale announces R$12B Carajás expansion",
      "summary": "2-sentence factual summary. Why this matters long-term for the stock price.",
      "horizon": "2028"
    }
  ]
}`;

async function run() {
  console.log('[analyze] start', new Date().toISOString());
  const today = new Date().toISOString().split('T')[0];

  const [packs, priceSnapshot] = await Promise.all([
    getPacksForDate(new Date()),
    getPriceSnapshot(today).catch(() => null),
  ]);

  if (!packs.length) { console.log('[analyze] no packs today, skipping'); return; }

  // Skip packs whose Haiku output failed to parse — don't feed corrupted data downstream
  const goodPacks = packs.filter(p => !p?.content?.parse_error);
  if (goodPacks.length < packs.length) console.warn(`[analyze] skipped ${packs.length - goodPacks.length} parse_error pack(s)`);
  if (!goodPacks.length) { console.log('[analyze] all packs corrupted, skipping'); return; }

  // Compact JSON (no pretty-print) saves ~30% tokens on pack payloads
  const packsText     = goodPacks.map(p => `## ${p.pack_type}\n${JSON.stringify(p.content)}`).join('\n\n---\n\n');
  const pricesText    = formatSnapshotForPrompt(priceSnapshot);
  const portfolioText = `Portfolio: ${config.portfolio.tickers.join(', ')}`;

  // Load existing news memory per ticker — lets Haiku reuse cached context on follow-on moves
  const memoryParts = config.portfolio.tickers
    .map(t => ({ t, ctx: getContext(t) }))
    .filter(({ ctx }) => ctx)
    .map(({ t, ctx }) => `### EXISTING STOCK MEMORY — ${t}\n${ctx}`);
  const memoryText = memoryParts.length ? `\n\nEXISTING STOCK MEMORY:\n${memoryParts.join('\n\n')}` : '';

  const result = await callHaiku(
    [{ role: 'user', content: `${pricesText}\n\n${portfolioText}\n\n${packsText}${memoryText}` }],
    SYSTEM, 'analyze'
  );

  const parsed = parseJsonLoose(result.content) ?? { date: today, why_moved: [], parse_error: true, raw: result.content };

  await saveDailyAnalysis(today, parsed, { tickers: config.portfolio.tickers });
  console.log(`[analyze] flagged ${(parsed.why_moved || []).filter(w => w.flag_for_deepdive).length} tickers for deep dive`);

  // Persist long-horizon news snippets to Obsidian for future cost-saving context reuse
  for (const snip of (parsed.memory_snippets || [])) {
    try {
      if (snip.ticker && snip.headline && snip.summary) {
        saveSnippet(snip.ticker, { date: today, headline: snip.headline, summary: snip.summary, horizon: snip.horizon || 'unknown' });
      }
    } catch (e) {
      console.error(`[analyze] news-memory save failed for ${snip?.ticker}:`, e.message);
    }
  }

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
