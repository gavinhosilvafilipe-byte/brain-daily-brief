'use strict';

const SYSTEM = `You extract news stories into a compact, deduplicated research pack.
INPUT: Last 24-48h news articles (US markets, Brazil markets, world events, crypto, macro).
TASK:
1. Deduplicate (same story, multiple sources → keep 1)
2. Rank by relevance: moves > 3% OR macro impact OR Brazil/US/crypto specific
3. Extract top 10 stories
OUTPUT: JSON only. Max 800 tokens.
{
  "pack_type": "NEWS_PACK",
  "created_at": "ISO 8601",
  "stories": [
    {
      "headline": "...",
      "facts": ["...", "..."],
      "interpretation": "...",
      "source_link": "url"
    }
  ],
  "dedup_count": N,
  "stories_kept": N
}
RULES: No raw text > 50 words. No filler. Link every major claim or mark "(uncited)".`;

function buildPrompt(articles) {
  const text = articles.slice(0, 100).map((a, i) =>
    `${i+1}. ${a.title} | ${a.source || 'unknown'} | ${a.publishedAt?.split('T')[0] || ''}
   ${(a.description || '').substring(0, 150)}
   URL: ${a.url}`
  ).join('\n\n');
  return `Extract NEWS_PACK from ${articles.length} articles (last 48h):\n\n${text}`;
}

module.exports = { SYSTEM, buildPrompt };
