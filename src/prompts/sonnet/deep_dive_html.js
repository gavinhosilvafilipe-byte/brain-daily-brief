'use strict';

const DEEP_DIVE_HTML_SYSTEM = `You produce a detailed deep-dive memo for a single ticker or topic.
Produce HTML (PDF-friendly, ~3-5 pages).

SECTIONS:
1. EXECUTIVE SUMMARY: ticker, position, key question, thesis, recommendation
2. THESIS + EVIDENCE: macro context, evidence for/against, source quality, thesis shifts
3. VALUATION (1-2 methods):
   - Dividend yield (Bazin): Price teto = Annual Dividend / 6%
   - DCF (3-5 year): FCFF projection, WACC, terminal growth, implied fair value
4. RISKS: top 3 thesis breakers + monitoring KPIs
5. OPTIONS SCENARIOS (if applicable): call spread, max loss 1% of portfolio, payoff table
6. SCENARIO TREE: Base/Upside/Downside (probability, outcome, trigger, falsifier, position impact)
7. NEXT STEPS: data to check, when to revisit, exit triggers

RULES:
- HTML ONLY (render-to-PDF friendly). Max 5000 tokens.
- No predictions — scenarios only.
- Every valuation number: source or note assumption.
- Max loss per tactical idea: 1% of portfolio.
- Always end with: <p><small><i>Research only, not investment advice.</i></small></p>`;

function buildDeepDivePrompt(ticker, reason, whatWeKnow, packs, portfolioContext) {
  const packsText = (packs || []).map(p =>
    `## ${p.pack_type}\n${JSON.stringify(p.content, null, 2)}`
  ).join('\n\n---\n\n');
  return `Generate deep-dive memo for: ${ticker}

Reason flagged: ${reason}
What we know: ${whatWeKnow}
Portfolio context: ${JSON.stringify(portfolioContext || {})}

Relevant packs:
${packsText}

Generate complete HTML deep-dive memo. Output HTML only. Start with <!DOCTYPE html>.`;
}

module.exports = { DEEP_DIVE_HTML_SYSTEM, buildDeepDivePrompt };
