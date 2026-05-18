'use strict';
require('dotenv').config();
const fs   = require('fs');
const path = require('path');
const { callHaiku }       = require('../services/anthropic');
const { getMonthlyCosts } = require('../services/supabase');
const { logOutput }       = require('../services/notion');
const config = require('../config');

const SYSTEM = `You create a weekly thesis summary for archiving in Obsidian.
INPUT: Summary of the week's major market events and portfolio moves.
OUTPUT (Markdown, ≤ 2000 tokens):
# Weekly Distillation — [Week] [Year]

## Market themes
- [Theme 1]: [Summary]

## Portfolio moves
- [Ticker]: +/- X%, reason: [...]

## Thesis shifts
- [If any]: [What changed and why]

## Key decisions made
- [Decision + Rationale]

## Surprises
- [What you didn't expect]

## Watch next week
- [Event + Why it matters]`;

async function run() {
  console.log('[distill] start', new Date().toISOString());
  const today     = new Date().toISOString().split('T')[0];
  const yearMonth = today.substring(0, 7);
  const weekNum   = Math.ceil(new Date().getDate() / 7);

  const monthlyCosts = await getMonthlyCosts(yearMonth);
  const totalCost    = monthlyCosts.reduce((s, r) => s + r.cost_usd, 0);

  const prompt = `Generate the weekly distillation for week ending ${today}.
Portfolio: ${config.portfolio.tickers.join(', ')}
Month-to-date AI cost: $${totalCost.toFixed(2)}
Note: No live pack data available for weekly summary — generate based on general weekly market themes.`;

  const result = await callHaiku([{ role: 'user', content: prompt }], SYSTEM, 'distill_weekly');

  const filename   = `week-${weekNum}-${yearMonth}-distill.md`;
  const outputDir  = path.join(config.obsidian.vaultPath, '03-OUTPUT', 'WEEKLY_DISTILLS');
  const outputPath = path.join(outputDir, filename);

  try {
    fs.mkdirSync(outputDir, { recursive: true });
    fs.writeFileSync(outputPath, result.content, 'utf8');
    console.log(`[distill] saved: ${outputPath}`);
  } catch (e) {
    console.error('[distill] save failed:', e.message);
  }

  await logOutput({
    date: today, briefType: 'weekly_distill',
    tickersMentioned: config.portfolio.tickers,
    costTokens: result.usage.input_tokens + result.usage.output_tokens,
    keyThemes: ['weekly', 'distillation'],
  }).catch(e => console.error('[distill] notion log failed:', e.message));

  console.log(`[distill] complete. Cost: $${result.costUsd.toFixed(6)}`);
}

module.exports = { run };
if (require.main === module) run().catch(e => { console.error(e); process.exit(1); });
