'use strict';

const SYSTEM = `You extract geopolitics, energy, trade, and systemic risk stories.
INPUT: Last 48h world news (wars, embargoes, trade deals, credit events, disasters).
TASK: Select 5-8 major stories with real market/economic mechanisms.
OUTPUT (JSON only, ≤ 800 tokens):
{
  "pack_type": "WORLD_PACK",
  "created_at": "ISO 8601",
  "stories": [
    {
      "headline": "...",
      "facts": ["...", "..."],
      "channels": ["energy", "trade"],
      "second_order_effects": ["..."],
      "scenarios": {
        "base_case": {"outcome": "...", "confidence": "Med", "trigger": "...", "falsifier": "..."},
        "upside":    {"outcome": "...", "confidence": "Low", "trigger": "...", "falsifier": "..."},
        "downside":  {"outcome": "...", "confidence": "Med", "trigger": "...", "falsifier": "..."}
      },
      "source_link": "url"
    }
  ]
}
RULES: Only stories with real mechanism. No filler. No duplicates.`;

const WORLD_KEYWORDS = /war|sanction|trade|energy|oil|geopolit|china|russia|middle east|embargo|tariff|supply chain|conflict|invasion|nato|un security|coup/i;

function buildPrompt(articles) {
  const filtered = articles.filter(a => WORLD_KEYWORDS.test((a.title || '') + ' ' + (a.description || ''))).slice(0, 30);
  const text = filtered.map((a, i) =>
    `${i+1}. ${a.title} | ${a.source || ''}\n   ${(a.description || '').substring(0, 150)}\n   ${a.url}`
  ).join('\n\n');
  return `Extract WORLD_PACK from these geopolitical/macro news items:\n\n${text || 'No specific geopolitical news in feed today. Generate based on major ongoing global events.'}`;
}

module.exports = { SYSTEM, buildPrompt };
