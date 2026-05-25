'use strict';

const PORTFOLIO_TICKERS = [
  'BBAS3','BBSE3','BBDC4','CSMG3','CMIG4','VALE3','ITSA4','POMO4','ITUB4','KLBN11',
  'SAPR4','AURE3','TAEE11','ITUB3',
  'HSML11','XPML11','BTLG11','CPTS11','HSLG11','HGBS11','MXRF11','HGLG11','ALZR11',
  'BTC','ETH','USDBRL',
];

const SECTOR_MAP = `
Iron ore / steel / mining → VALE3
Oil / energy → sector proxy (macro relevance)
Brazilian banks / credit / Selic → BBAS3 BBDC4 ITUB4
USD/BRL / Brazil macro / EM / Fed rates → USDBRL BBAS3
Bitcoin / crypto → BTC ETH
Real estate / REITs / property → HSML11 XPML11 BTLG11 HGBS11 HGLG11 ALZR11 CPTS11
Logistics / warehousing → HSLG11 BTLG11
Utilities / energy / power grid → AURE3 TAEE11 CSMG3 CMIG4
Pulp / paper / fiber → KLBN11
Sanitation / water → SAPR4 CSMG3
Auto / industrial → POMO4
`;

const SYSTEM = `You extract claims + evidence from YouTube video metadata for a Brazilian investor.
INPUT: List of recent YouTube videos from finance/markets/investing channels.
TASK:
1. Extract main claim per video (1 sentence)
2. List evidence bullets from title/description
3. Assign creator confidence (High/Medium/Low based on channel type)
4. Note gaps (what's not covered)
5. Map video topics to BRL portfolio tickers using the sector map — tag EVERY video touching macro, Fed, EM, commodities, crypto, or sectors with relevant portfolio tickers even if the ticker name is never mentioned.

PORTFOLIO TICKERS: ${PORTFOLIO_TICKERS.join(', ')}
SECTOR → TICKER MAP:${SECTOR_MAP}

OUTPUT (JSON only, ≤ 2500 tokens):
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
      "worth_checking": ["..."],
      "related_tickers": ["VALE3", "USDBRL"]
    }
  ]
}
RULES: Max 20 videos. Finance/market-relevant only. Videos with zero finance relevance get related_tickers [].`;

function buildPrompt(videos) {
  const text = videos.map((v, i) =>
    `${i+1}. "${v.title}"\n   Channel: ${v.channel}\n   Published: ${v.publishedAt}\n   Link: ${v.link}\n   Description: ${(v.description || '').substring(0, 200)}`
  ).join('\n\n');
  return `Extract YOUTUBE_PACK from ${videos.length} videos:\n\n${text}`;
}

module.exports = { SYSTEM, buildPrompt };
