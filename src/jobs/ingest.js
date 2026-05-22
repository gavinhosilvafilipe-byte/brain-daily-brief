'use strict';
require('dotenv').config({ override: true });
const { callHaiku, parseJsonLoose } = require('../services/anthropic');
const { insertPack, checkPackExists } = require('../services/supabase');
const { fetchMarketNews }    = require('../services/newsapi');
const { getRecentVideos }    = require('../services/youtube');
const newsPrompt   = require('../prompts/haiku/news_pack');
const ytPrompt     = require('../prompts/haiku/youtube_pack');
const worldPrompt  = require('../prompts/haiku/world_pack');
const macroPrompt  = require('../prompts/haiku/macro_pack');
const config = require('../config');

async function generatePack(packType, userMessage, systemPrompt, cacheKey) {
  const exists = await checkPackExists(cacheKey);
  if (exists) { console.log(`[ingest] ${packType}: cache hit`); return null; }
  console.log(`[ingest] generating ${packType}...`);
  const result = await callHaiku([{ role: 'user', content: userMessage }], systemPrompt, 'ingest');
  let parsed;
  parsed = parseJsonLoose(result.content) ?? { pack_type: packType, raw: result.content, parse_error: true };
  await insertPack(packType, parsed, cacheKey);
  console.log(`[ingest] ${packType} done. Cost: $${result.costUsd.toFixed(6)}`);
  return parsed;
}

async function run() {
  console.log('[ingest] start', new Date().toISOString());
  const today = new Date().toISOString().split('T')[0];

  const [articles, videos] = await Promise.all([
    fetchMarketNews().catch(e => { console.error('[ingest] news fetch error:', e.message); return []; }),
    getRecentVideos(config.youtube.channels, config.youtube.lookbackHours)
      .catch(e => { console.error('[ingest] youtube error:', e.message); return []; }),
  ]);

  console.log(`[ingest] fetched ${articles.length} articles, ${videos.length} videos`);

  await Promise.allSettled([
    generatePack('NEWS_PACK',  newsPrompt.buildPrompt(articles),  newsPrompt.SYSTEM,  `news_${today}`),
    generatePack('WORLD_PACK', worldPrompt.buildPrompt(articles), worldPrompt.SYSTEM, `world_${today}`),
    generatePack('MACRO_PACK', macroPrompt.buildPrompt(articles), macroPrompt.SYSTEM, `macro_${today}`),
    videos.length > 0
      ? generatePack('YOUTUBE_PACK', ytPrompt.buildPrompt(videos), ytPrompt.SYSTEM, `youtube_${today}`)
      : Promise.resolve(null),
  ]);

  console.log('[ingest] complete', new Date().toISOString());
}

module.exports = { run };
if (require.main === module) run().catch(e => { console.error(e); process.exit(1); });
