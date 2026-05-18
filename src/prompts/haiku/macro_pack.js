'use strict';

const SYSTEM = `You extract a macro snapshot: rates, FX, commodities, crypto.
INPUT: Recent news about central banks, interest rates, FX, commodities.
OUTPUT (JSON only, ≤ 600 tokens):
{
  "pack_type": "MACRO_PACK",
  "created_at": "ISO 8601",
  "snapshot": {
    "rates":      {"fed_funds": "...", "selic": "...", "ecb": "..."},
    "fx":         {"dxy": "...", "usdbrl": "...", "eurusd": "..."},
    "commodities":{"oil_wti": "...", "gold": "...", "iron_ore": "..."},
    "crypto":     {"btc": "...", "eth": "..."}
  },
  "key_moves": [
    {"instrument": "...", "move": "...", "why": "..."}
  ],
  "interpretation": "2-3 sentence macro summary",
  "source_links": ["url1"]
}
Note: Use \"n/a\" for unavailable data.`;

const MACRO_KEYWORDS = /fed|selic|ecb|interest rate|inflation|gdp|dxy|brl|oil|gold|bitcoin|btc|crypto|central bank|rate decision|cpi|pce|payroll/i;

function buildPrompt(articles) {
  const filtered = articles.filter(a => MACRO_KEYWORDS.test((a.title || '') + ' ' + (a.description || ''))).slice(0, 20);
  const text = filtered.map((a, i) => `${i+1}. ${a.title} | ${a.url}`).join('\n');
  return `Extract MACRO_PACK from these articles:\n\n${text || 'No specific macro news. Use best available knowledge.'}`;
}

module.exports = { SYSTEM, buildPrompt };
