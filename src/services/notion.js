'use strict';
const { Client } = require('@notionhq/client');
const config = require('../config');

const notion = new Client({ auth: config.notion.token });
const DBS = config.notion.dbs;

async function addDeepDiveCandidate({ ticker, reason, whatWeKnow, whatWeNeed, confidence }) {
  const now     = new Date();
  const expires = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000);
  return notion.pages.create({
    parent: { database_id: DBS.queue },
    properties: {
      'Ticker':          { title:     [{ text: { content: ticker } }] },
      'Reason':          { rich_text: [{ text: { content: reason || '' } }] },
      'What We Know':    { rich_text: [{ text: { content: whatWeKnow || '' } }] },
      'What We Need':    { rich_text: [{ text: { content: whatWeNeed || '' } }] },
      'Confidence %':    { number: confidence || 50 },
      'Created At':      { date: { start: now.toISOString() } },
      'Expires At':      { date: { start: expires.toISOString() } },
      'Status':          { select: { name: 'pending' } },
    },
  });
}

async function getApprovedDeepDives() {
  const resp = await notion.databases.query({
    database_id: DBS.queue,
    filter: {
      and: [
        { property: 'Approve Deep Dive', checkbox: { equals: true } },
        { property: 'Run Now',           checkbox: { equals: true } },
        { property: 'Status',            select:   { equals: 'pending' } },
      ],
    },
  });
  return resp.results.map(p => ({
    id:         p.id,
    ticker:     p.properties['Ticker']?.title?.[0]?.plain_text || '',
    reason:     p.properties['Reason']?.rich_text?.[0]?.plain_text || '',
    whatWeKnow: p.properties['What We Know']?.rich_text?.[0]?.plain_text || '',
    confidence: p.properties['Confidence %']?.number || 50,
  }));
}

async function updateDeepDiveStatus(pageId, status, outputLink) {
  const props = { Status: { select: { name: status } } };
  if (outputLink) props['Deep Dive Output Link'] = { url: outputLink };
  return notion.pages.update({ page_id: pageId, properties: props });
}

async function logOutput({ date, briefType, tickersMentioned, whyMovedCount, deepDivesRun, costTokens, sourcesUsed, keyThemes, briefLink, priceSnapshot, analysis }) {
  const children = buildBriefPageBlocks({ date, briefType, tickersMentioned, whyMovedCount, costTokens, sourcesUsed, keyThemes, priceSnapshot, analysis });

  return notion.pages.create({
    parent: { database_id: DBS.outputs },
    properties: {
      'Date':                 { title:     [{ text: { content: date } }] },
      'Brief Type':           { select:    { name: briefType } },
      'Tickers Mentioned':    { rich_text: [{ text: { content: (tickersMentioned || []).join(', ') } }] },
      'Why Moved Candidates': { number: whyMovedCount || 0 },
      'Deep Dives Run Today': { number: deepDivesRun  || 0 },
      'Cost Tokens':          { number: costTokens    || 0 },
      'Sources Used':         { number: sourcesUsed   || 0 },
      'Key Themes':           { rich_text: [{ text: { content: (keyThemes || []).join(', ') } }] },
      ...(briefLink ? { 'Brief HTML Link': { url: briefLink } } : {}),
    },
    children,
  });
}

// ── Rich Notion page blocks for daily brief ─────────────────────────────
function buildBriefPageBlocks({ date, briefType, tickersMentioned, whyMovedCount, costTokens, sourcesUsed, keyThemes, priceSnapshot, analysis }) {
  const blocks = [];

  // Header callout
  blocks.push({
    object: 'block', type: 'callout',
    callout: {
      icon: { type: 'emoji', emoji: '🧠' },
      rich_text: [{ type: 'text', text: { content: `BRAIN ${briefType === 'daily' ? 'Daily' : 'Weekly'} Brief — ${date}` }, annotations: { bold: true } }],
      color: 'blue_background',
    },
  });

  blocks.push({ object: 'block', type: 'divider', divider: {} });

  // ── Portfolio Dashboard ──
  if (priceSnapshot?.prices && Object.keys(priceSnapshot.prices).length > 0) {
    blocks.push({
      object: 'block', type: 'heading_2',
      heading_2: { rich_text: [{ type: 'text', text: { content: '💼 Portfolio Dashboard' } }] },
    });

    const tickers = Object.values(priceSnapshot.prices);
    const tableRows = [
      {
        object: 'block', type: 'table_row',
        table_row: { cells: [
          [{ type: 'text', text: { content: 'Ticker' }, annotations: { bold: true } }],
          [{ type: 'text', text: { content: 'Price' }, annotations: { bold: true } }],
          [{ type: 'text', text: { content: 'Change %' }, annotations: { bold: true } }],
          [{ type: 'text', text: { content: 'Currency' }, annotations: { bold: true } }],
        ]},
      },
      ...tickers.map(t => ({
        object: 'block', type: 'table_row',
        table_row: { cells: [
          [{ type: 'text', text: { content: t.ticker || '—' } }],
          [{ type: 'text', text: { content: t.price != null ? String(Number(t.price).toFixed(2)) : '—' } }],
          [{ type: 'text', text: { content: t.changePct != null ? `${t.changePct >= 0 ? '+' : ''}${Number(t.changePct).toFixed(2)}%` : '—' }, annotations: { color: t.changePct >= 0 ? 'green' : 'red' } }],
          [{ type: 'text', text: { content: t.currency || '—' } }],
        ]},
      })),
    ];

    blocks.push({
      object: 'block', type: 'table',
      table: { table_width: 4, has_column_header: true, has_row_header: false, children: tableRows },
    });

    if (priceSnapshot.movers?.length > 0) {
      const moverText = priceSnapshot.movers.map(m =>
        `${m.ticker} ${m.changePct >= 0 ? '📈' : '📉'} ${m.changePct >= 0 ? '+' : ''}${Number(m.changePct).toFixed(2)}%`
      ).join('  •  ');
      blocks.push({
        object: 'block', type: 'callout',
        callout: {
          icon: { type: 'emoji', emoji: '⚡' },
          rich_text: [{ type: 'text', text: { content: `Big Movers: ${moverText}` } }],
          color: 'yellow_background',
        },
      });
    }
  }

  // ── Why Moved Analysis ──
  const whyMoved = analysis?.why_moved_payload?.why_moved || [];
  if (whyMoved.length > 0) {
    blocks.push({ object: 'block', type: 'divider', divider: {} });
    blocks.push({
      object: 'block', type: 'heading_2',
      heading_2: { rich_text: [{ type: 'text', text: { content: '🔍 Why Things Moved' } }] },
    });

    for (const item of whyMoved.slice(0, 8)) {
      const conf = item.confidence || 'Med';
      const confEmoji = conf === 'High' ? '🟢' : conf === 'Med' ? '🟡' : '🔴';
      const drivers = (item.drivers || []).join(', ');
      const deepDiveFlag = item.flag_for_deepdive ? ' → 🔬 Deep Dive Recommended' : '';

      blocks.push({
        object: 'block', type: 'bulleted_list_item',
        bulleted_list_item: {
          rich_text: [
            { type: 'text', text: { content: `${item.ticker}` }, annotations: { bold: true } },
            { type: 'text', text: { content: ` ${confEmoji} ${conf} — ${drivers}${deepDiveFlag}` } },
          ],
        },
      });
    }
  }

  // ── Stats Summary ──
  blocks.push({ object: 'block', type: 'divider', divider: {} });
  blocks.push({
    object: 'block', type: 'heading_2',
    heading_2: { rich_text: [{ type: 'text', text: { content: '📊 Brief Stats' } }] },
  });

  const statsText = [
    `Sources: ${sourcesUsed || 0}`,
    `Tokens: ${(costTokens || 0).toLocaleString()}`,
    `Why Moved: ${whyMovedCount || 0} candidates`,
    `Themes: ${(keyThemes || []).join(', ')}`,
    `Tickers: ${(tickersMentioned || []).join(', ')}`,
  ].join('\n');

  blocks.push({
    object: 'block', type: 'quote',
    quote: { rich_text: [{ type: 'text', text: { content: statsText } }], color: 'gray_background' },
  });

  // Footer
  blocks.push({ object: 'block', type: 'divider', divider: {} });
  blocks.push({
    object: 'block', type: 'paragraph',
    paragraph: {
      rich_text: [{ type: 'text', text: { content: `Generated by BRAIN • ${new Date().toISOString()} • Data may be delayed` }, annotations: { italic: true, color: 'gray' } }],
    },
  });

  return blocks;
}

async function logBudget({ date, haikuCalls, haikuCost, sonnetCalls, sonnetCost, deepDivesRun, monthlyTotal, monthProjected, alertThreshold }) {
  return notion.pages.create({
    parent: { database_id: DBS.budget },
    properties: {
      'Date':               { title:  [{ text: { content: date } }] },
      'Haiku Calls':        { number: haikuCalls   || 0 },
      'Haiku Cost USD':     { number: haikuCost    || 0 },
      'Sonnet Calls':       { number: sonnetCalls  || 0 },
      'Sonnet Cost USD':    { number: sonnetCost   || 0 },
      'Deep Dives Run':     { number: deepDivesRun || 0 },
      'Monthly Total USD':  { number: monthlyTotal  || 0 },
      'Month Projected USD':{ number: monthProjected || 0 },
      'Alert Threshold USD':{ number: alertThreshold || 100 },
    },
  });
}

// Log triaged emails to the 📥 Inbox Triage database. Skips noise (NEWSLETTER importance<2).
async function logTriage(items) {
  if (!DBS.triage) { console.warn('[notion] NOTION_TRIAGE_DB_ID not set — skipping'); return 0; }
  const now = new Date().toISOString();
  const worth = items.filter(it => it.importance >= 2 || it.action || ['HKUST', 'FINANCE', 'ACTION'].includes(it.category));
  let n = 0;
  for (const it of worth) {
    try {
      await notion.pages.create({
        parent: { database_id: DBS.triage },
        properties: {
          'Subject':      { title:     [{ text: { content: (it.subject || '(no subject)').slice(0, 200) } }] },
          'Category':     { select:    { name: it.category } },
          'Importance':   { number:    it.importance || 1 },
          'Summary':      { rich_text: [{ text: { content: (it.summary || '').slice(0, 1900) } }] },
          'From':         { rich_text: [{ text: { content: (it.from || '').slice(0, 200) } }] },
          'Action Needed':{ checkbox:  !!it.action },
          'Triaged At':   { date:      { start: now } },
          ...(it.eventDate ? { 'Event Date': { date: { start: it.eventDate } } } : {}),
        },
      });
      n++;
    } catch (e) { console.error(`[notion] triage log fail: ${e.message}`); }
  }
  console.log(`[notion] logged ${n}/${items.length} triaged emails`);
  return n;
}

// ── Portfolio positions → Notion DB (upsert by Ticker) ───────────────────
// Maps canonical holdings to the existing "📊 Filipe Portfolio Positions" schema.
// Return % props are Notion `percent` type → store as fraction (-10.62% → -0.1062).
async function syncPortfolio(rows) {
  if (!DBS.portfolio) { console.warn('[notion] NOTION_PORTFOLIO_DB_ID unset — skipping portfolio sync'); return 0; }
  const pct = v => (v == null ? null : v / 100);
  let n = 0;
  for (const r of rows) {
    const props = {
      'Ticker':          { title:  [{ text: { content: r.ticker } }] },
      'Category':        { select: { name: r.category } },
      'Qty':             { number: r.quantity ?? null },
      'Invested BRL':    { number: r.invested_brl ?? null },
      'Avg Price':       { number: r.avg_price ?? null },
      'Avg Price w/ Div':{ number: r.avg_price_with_div ?? null },
      'P&L ex Div':      { number: r.pnl_ex ?? null },
      'P&L inc Div':     { number: r.pnl_inc ?? null },
      'Return ex Div %': { number: pct(r.ret_ex) },
      'Return inc Div %':{ number: pct(r.ret_inc) },
    };
    try {
      const found = await notion.databases.query({
        database_id: DBS.portfolio,
        filter: { property: 'Ticker', title: { equals: r.ticker } },
        page_size: 1,
      });
      if (found.results.length) await notion.pages.update({ page_id: found.results[0].id, properties: props });
      else await notion.pages.create({ parent: { database_id: DBS.portfolio }, properties: props });
      n++;
    } catch (e) { console.error(`[notion] portfolio sync fail ${r.ticker}: ${e.message}`); }
  }
  console.log(`[notion] synced ${n}/${rows.length} portfolio positions`);
  return n;
}

module.exports = { addDeepDiveCandidate, getApprovedDeepDives, updateDeepDiveStatus, logOutput, logBudget, logTriage, syncPortfolio };
