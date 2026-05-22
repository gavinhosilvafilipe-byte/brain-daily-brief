'use strict';
require('dotenv').config({ override: true });
const { callSonnet }       = require('../services/anthropic');
const { getPacksForDate, getDailyAnalysis, getPriceSnapshot, getPrecoTeto } = require('../services/supabase');
const { logOutput }        = require('../services/notion');
const { sendBrief }        = require('../services/gmail');
const { DAILY_BRIEF_HTML_SYSTEM, buildDailyBriefPrompt } = require('../prompts/sonnet/daily_brief_html');
const { readNote }         = require('../services/obsidian');
const config = require('../config');

async function run() {
  console.log('[brief] start', new Date().toISOString());
  const today = new Date().toISOString().split('T')[0];

  const [packs, analysis, priceSnapshot] = await Promise.all([
    getPacksForDate(new Date()),
    getDailyAnalysis(today),
    getPriceSnapshot(today).catch(() => null),
  ]);

  const legacyVal = readNote('STOCK/valuations/_summary.md') || '';
  // Preço Teto: Supabase (CI, written by weekly local run.sh push) → vault note fallback (local).
  let tetoMd = '';
  try { tetoMd = (await getPrecoTeto())?.markdown || ''; } catch (e) { console.error('[brief] preco_teto read:', e.message); }
  if (!tetoMd) tetoMd = readNote('STOCK/preco-teto.md') || '';
  const tetoSlice = (() => {
    const i = tetoMd.indexOf('## §1');
    const j = tetoMd.indexOf('## §4');
    return i >= 0 && j > i ? tetoMd.slice(i, j).trim() : (tetoMd.trim());
  })();
  const valuationCache = [tetoSlice && `# PREÇO TETO (composite ceilings)\n${tetoSlice}`, legacyVal]
    .filter(Boolean).join('\n\n');
  const prompt = buildDailyBriefPrompt(packs, analysis, today, priceSnapshot, valuationCache);
  // cacheContent=true: packs cached at '---' boundary; maxTokens=3000 caps HTML output
  const result = await callSonnet(
    [{ role: 'user', content: prompt }],
    DAILY_BRIEF_HTML_SYSTEM, 'brief',
    { cacheContent: true, maxTokens: 3000 }
  );
  const html   = result.content;

  try {
    await sendBrief(`Daily Brief — ${today} | BRAIN Research`, html);
    console.log('[brief] email sent');
  } catch (e) {
    console.error('[brief] email failed:', e.message);
  }

  const sourcesUsed = packs.reduce((acc, p) => {
    const c = p.content;
    return acc + (c?.stories_kept || c?.stories?.length || c?.videos?.length || 1);
  }, 0);

  try {
    await logOutput({
      date: today, briefType: 'daily',
      tickersMentioned: config.portfolio.tickers,
      whyMovedCount: (analysis?.why_moved_payload?.why_moved || []).length,
      deepDivesRun: 0,
      costTokens: result.usage.input_tokens + result.usage.output_tokens,
      sourcesUsed,
      keyThemes: ['markets', 'macro', 'brazil', 'portfolio'],
      priceSnapshot,
      analysis,
    });
  } catch (e) {
    console.error('[brief] notion log failed:', e.message);
  }

  console.log(`[brief] complete. Cost: $${result.costUsd.toFixed(6)}`);
}

module.exports = { run };
if (require.main === module) run().catch(e => { console.error(e); process.exit(1); });
