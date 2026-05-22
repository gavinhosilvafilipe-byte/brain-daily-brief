'use strict';
// Drop-in replacement for logOutput in src/services/notion.js
// Adds: Status select, CostTier select, QualityScore number
// All existing fields preserved exactly — no schema breakage.
//
// USAGE: Copy this function body into src/services/notion.js,
// replacing the existing logOutput function (lines 63–82).

async function logOutput({
  date,
  briefType,
  tickersMentioned,
  whyMovedCount,
  deepDivesRun,
  costTokens,
  sourcesUsed,
  keyThemes,
  briefLink,
  priceSnapshot,
  analysis,
  costUsd, // NEW optional — pass result.costUsd from brief.js for accurate CostTier
}) {
  // ── Derived fields ────────────────────────────────────────────────────

  // Status: Complete if we used at least 1 source, Partial if 0 sources but ran,
  // Failed reserved for catch blocks (pass status:'failed' explicitly if needed).
  const status = (sourcesUsed > 0)
    ? '✅ Complete'
    : '⚠️ Partial';

  // CostTier: based on costUsd if provided, otherwise estimate from tokens.
  // Rough token→USD: Haiku ~$0.25/1M input, Sonnet ~$3/1M input (blended ~$1/1M).
  const effectiveCost = (costUsd != null)
    ? costUsd
    : (costTokens || 0) / 1_000_000 * 1.5; // conservative blended estimate

  const costTier = (effectiveCost < 0.01)
    ? '💚 Cheap'
    : (effectiveCost <= 0.05)
      ? '💛 Normal'
      : '🔴 Expensive';

  // QualityScore: 0–100.
  // 50 pts from sourcesUsed (max at 10 sources), 50 pts from whyMovedCount (max at 5).
  const qualityScore = Math.min(
    100,
    Math.round(
      ((sourcesUsed || 0) / 10) * 50 +
      ((whyMovedCount || 0) / 5) * 50
    )
  );

  // ── Build page blocks (unchanged from original) ───────────────────────
  const children = buildBriefPageBlocks({
    date, briefType, tickersMentioned, whyMovedCount,
    costTokens, sourcesUsed, keyThemes, priceSnapshot, analysis,
  });

  return notion.pages.create({
    parent: { database_id: DBS.outputs },
    properties: {
      // ── Existing fields (UNCHANGED) ───────────────────────────────────
      'Date':                 { title:     [{ text: { content: date } }] },
      'Brief Type':           { select:    { name: briefType } },
      'Tickers Mentioned':    { rich_text: [{ text: { content: (tickersMentioned || []).join(', ') } }] },
      'Why Moved Candidates': { number: whyMovedCount || 0 },
      'Deep Dives Run Today': { number: deepDivesRun  || 0 },
      'Cost Tokens':          { number: costTokens    || 0 },
      'Sources Used':         { number: sourcesUsed   || 0 },
      'Key Themes':           { rich_text: [{ text: { content: (keyThemes || []).join(', ') } }] },
      ...(briefLink ? { 'Brief HTML Link': { url: briefLink } } : {}),

      // ── NEW fields (add these 3 columns in Notion UI first) ───────────
      'Status':         { select: { name: status } },
      'Cost Tier':      { select: { name: costTier } },
      'Quality Score':  { number: qualityScore },
    },
    children,
  });
}

// ── NOTION UI SETUP INSTRUCTIONS ─────────────────────────────────────────
//
// Before deploying, add these 3 properties to the Research Outputs database:
//
// 1. "Status" — Type: Select
//    Options: ✅ Complete (green), ⚠️ Partial (yellow), ❌ Failed (red)
//
// 2. "Cost Tier" — Type: Select
//    Options: 💚 Cheap (green), 💛 Normal (yellow), 🔴 Expensive (red)
//
// 3. "Quality Score" — Type: Number
//    Format: Number (0–100). No options needed.
//
// ─────────────────────────────────────────────────────────────────────────

module.exports = { logOutput };
