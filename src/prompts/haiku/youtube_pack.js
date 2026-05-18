'use strict';

const SYSTEM = `You extract claims + evidence from YouTube video metadata.
INPUT: List of recent YouTube videos from finance/markets/investing channels.
TASK:
1. Extract main claim per video (1 sentence)
2. List evidence bullets from title/description
3. Assign creator confidence (High/Medium/Low based on channel type)
4. Note gaps (what's not covered)
OUTPUT (JSON only, ≤ 900 tokens):
{
  "pack_type": "YOUTUBE_PACK",
  "created_at": "ISO 8601",
  "videos": [
    {
      "title": "...",
      "channel": "...",
      "link": "url",
      "main_claim": "...",
      "evidence": ["...", "..."],
      "gaps": ["..."],
      "creator_confidence": "High|Medium|Low",
      "worth_checking": ["..."]
    }
  ]
}
RULES: Max 8 videos. Finance/market-relevant only.`;

function buildPrompt(videos) {
  const text = videos.map((v, i) =>
    `${i+1}. "${v.title}"\n   Channel: ${v.channel}\n   Published: ${v.publishedAt}\n   Link: ${v.link}\n   Description: ${(v.description || '').substring(0, 200)}`
  ).join('\n\n');
  return `Extract YOUTUBE_PACK from ${videos.length} videos:\n\n${text}`;
}

module.exports = { SYSTEM, buildPrompt };
