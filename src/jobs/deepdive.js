'use strict';
require('dotenv').config({ override: true });
const fs   = require('fs');
const path = require('path');
const { callSonnet, callOpus } = require('../services/anthropic');
const { getPacksForDate }      = require('../services/supabase');
const { logOutput }            = require('../services/notion');
const { DEEP_DIVE_HTML_SYSTEM, buildDeepDivePrompt } = require('../prompts/sonnet/deep_dive_html');
const { selectDeepDiveModel, MODELS } = require('../services/model_router');
const config = require('../config');

async function run(candidate) {
  const { ticker, reason, whatWeKnow, confidence = 70 } = candidate;
  console.log(`[deepdive] start: ${ticker}`);
  const today = new Date().toISOString().split('T')[0];
  const packs = await getPacksForDate(new Date());

  const model   = selectDeepDiveModel(reason, confidence);
  const callFn  = model === MODELS.OPUS ? callOpus : callSonnet;
  const prompt  = buildDeepDivePrompt(ticker, reason, whatWeKnow, packs, {
    tickers: config.portfolio.tickers,
    bigMoveThreshold: config.portfolio.bigMoveThreshold,
  });

  const result = await callFn(
    [{ role: 'user', content: prompt }],
    DEEP_DIVE_HTML_SYSTEM, 'deepdive',
    { cacheContent: true, maxTokens: 5000 }
  );

  const filename  = `${today}-${ticker.toLowerCase().replace(/[^a-z0-9]/g, '-')}-deepdive.html`;
  const outputDir = path.join(config.obsidian.vaultPath, '03-OUTPUT', 'DEEPDIVES');
  const outputPath = path.join(outputDir, filename);

  try {
    fs.mkdirSync(outputDir, { recursive: true });
    fs.writeFileSync(outputPath, result.content, 'utf8');
    console.log(`[deepdive] saved: ${outputPath}`);
  } catch (e) {
    console.error('[deepdive] Obsidian save failed:', e.message);
  }

  await logOutput({
    date: today, briefType: 'deepdive',
    tickersMentioned: [ticker], deepDivesRun: 1,
    costTokens: result.usage.input_tokens + result.usage.output_tokens,
    sourcesUsed: packs.length, keyThemes: [ticker.toLowerCase()],
  }).catch(e => console.error('[deepdive] notion log failed:', e.message));

  console.log(`[deepdive] complete: ${ticker}. Cost: $${result.costUsd.toFixed(6)}`);
  return `obsidian://open?vault=BRAIN&file=03-OUTPUT/DEEPDIVES/${encodeURIComponent(filename)}`;
}

module.exports = { run };
if (require.main === module) {
  const candidate = {
    ticker:     process.env.TICKER     || 'BBAS3',
    reason:     process.env.REASON     || 'Manual run',
    whatWeKnow: process.env.WHAT_WE_KNOW || 'Recent price movement',
    confidence: parseInt(process.env.CONFIDENCE || '70'),
  };
  run(candidate).catch(e => { console.error(e); process.exit(1); });
}
