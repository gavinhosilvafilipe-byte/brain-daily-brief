'use strict';
require('dotenv').config({ override: true });
const fs = require('fs');
const path = require('path');
const { execFile } = require('child_process');
const gmail = require('../services/gmail_read');
const { callHaiku } = require('../services/anthropic');
const obsidian = require('../services/obsidian');
const notion = require('../services/notion');

const STATE_DIR = path.join(__dirname, '..', '..', 'STATE');
const IDS_FILE  = path.join(STATE_DIR, 'triaged_ids.json');
const JSON_FILE = path.join(STATE_DIR, 'missed.json');
const MD_FILE   = path.join(STATE_DIR, 'missed.md');

const CATEGORIES = ['HKUST', 'FINANCE', 'ACTION', 'PERSONAL', 'RECEIPT', 'NEWSLETTER', 'OTHER'];
const LABELS = { HKUST:'BRAIN/HKUST', FINANCE:'BRAIN/Finance', ACTION:'BRAIN/Action',
  PERSONAL:'BRAIN/Personal', RECEIPT:'BRAIN/Receipt', NEWSLETTER:'BRAIN/Newsletter', OTHER:'BRAIN/Other' };

function loadIds() {
  try { return new Set(JSON.parse(fs.readFileSync(IDS_FILE, 'utf8')).ids || []); }
  catch (e) { if (e.code !== 'ENOENT') console.error('[triage] triaged_ids.json unreadable, starting fresh:', e.message); return new Set(); }
}
function saveIds(set) {
  fs.mkdirSync(STATE_DIR, { recursive: true });
  fs.writeFileSync(IDS_FILE, JSON.stringify({ ids: [...set].slice(-2000), updatedAt: new Date().toISOString() }, null, 2));
}

const SYSTEM = `You triage Filipe's email inbox. Filipe: Brazilian, G12 student in China, heading to HKUST Fall 2026 (BBA Quant Finance + CS). Holds a BRL stock/crypto/Tesouro portfolio.
Classify each email into ONE category: HKUST (anything HKUST/university/admissions/housing/orientation), FINANCE (broker, bank, B3, crypto, Tesouro, investment), ACTION (needs a reply/action/payment with a deadline), PERSONAL (friends/family/personal life), RECEIPT (order confirmation, invoice, payment receipt), NEWSLETTER (promotions, marketing, digests), OTHER.
Extract any concrete calendar event (deadline, meeting, appointment) with a date.
Return ONLY valid JSON, no prose.`;

function buildPrompt(msgs) {
  const list = msgs.map((m, i) =>
    `[${i}] id=${m.id}\nFrom: ${m.from}\nSubject: ${m.subject}\nDate: ${m.date}\nSnippet: ${m.snippet.slice(0, 300)}`
  ).join('\n\n');
  return `Triage these ${msgs.length} emails.\n\n${list}\n\n---\n\nReturn JSON:
{"items":[{"id":"<id>","category":"HKUST|FINANCE|ACTION|PERSONAL|RECEIPT|NEWSLETTER|OTHER","importance":1|2|3,"summary":"one concise line","action":true|false,"events":[{"title":"...","date":"YYYY-MM-DD","time":"HH:MM or empty","note":"..."}]}]}
importance: 3=urgent/important (HKUST, deadlines, money), 2=worth knowing, 1=noise. events only if a real date is present.`;
}

function parseJson(text) {
  const s = text.indexOf('{'); const e = text.lastIndexOf('}');
  if (s === -1 || e === -1) throw new Error('no JSON in model output');
  return JSON.parse(text.slice(s, e + 1));
}

function macPush(title, body) {
  return new Promise(res => {
    const safe = x => String(x).replace(/"/g, "'").slice(0, 200);
    const script = `display notification "${safe(body)}" with title "${safe(title)}" sound name "Glass"`;
    execFile('osascript', ['-e', script], () => res());
  });
}

function buildMd(digest) {
  const L = [];
  L.push(`## 📥 Inbox Triage — ${digest.generatedAt.slice(0, 16).replace('T', ' ')}`);
  L.push(`**${digest.total} new email(s)** · ` + Object.entries(digest.counts).filter(([,n])=>n).map(([c,n])=>`${c}:${n}`).join(' · '));
  if (digest.important.length) {
    L.push(`\n### ⭐ Important`);
    for (const m of digest.important) L.push(`- **[${m.category}]** ${m.subject} — ${m.summary} _(${m.from})_`);
  }
  if (digest.actions.length) {
    L.push(`\n### ✅ Needs action`);
    for (const a of digest.actions) L.push(`- ${a.subject} — ${a.summary}`);
  }
  if (digest.events.length) {
    L.push(`\n### 📅 Proposed events (confirm to add)`);
    for (const e of digest.events) L.push(`- **${e.title}** — ${e.date}${e.time ? ' ' + e.time : ''}${e.note ? ' · ' + e.note : ''} _(from: ${e.source})_`);
  }
  return L.join('\n') + '\n';
}

async function run() {
  const seen = loadIds();
  const refs = await gmail.listUnread();
  const fresh = refs.filter(r => !seen.has(r.id));
  if (!fresh.length) {
    console.log('[triage] no new email');
    return { total: 0 };
  }
  const msgs = await Promise.all(fresh.slice(0, 40).map(r => gmail.getMessage(r.id)));

  const { content } = await callHaiku(
    [{ role: 'user', content: buildPrompt(msgs) }], SYSTEM, 'triage', { maxTokens: 3000 });
  const parsed = parseJson(content);
  const byId = Object.fromEntries(msgs.map(m => [m.id, m]));

  const counts = Object.fromEntries(CATEGORIES.map(c => [c, 0]));
  const important = [], actions = [], events = [], notionItems = [];

  for (const it of parsed.items || []) {
    const m = byId[it.id]; if (!m) continue;
    const cat = CATEGORIES.includes(it.category) ? it.category : 'OTHER';
    counts[cat]++;
    try { await gmail.applyLabel(it.id, LABELS[cat]); }
    catch (e) { console.error(`[triage] label fail ${it.id}: ${e.message}`); }
    const fromName = (m.from.match(/^"?([^"<]+?)"?\s*</) || [, m.from])[1].trim();
    if (it.importance >= 3 || cat === 'HKUST') important.push({ from: fromName, subject: m.subject, summary: it.summary, category: cat });
    if (it.action) actions.push({ subject: m.subject, summary: it.summary });
    const firstEvent = (it.events || []).find(ev => ev.date);
    for (const ev of it.events || []) if (ev.date) events.push({ ...ev, source: m.subject });
    notionItems.push({ subject: m.subject, category: cat, importance: it.importance || 1, action: !!it.action, from: fromName, summary: it.summary, eventDate: firstEvent?.date });
    seen.add(it.id);
  }

  const digest = { generatedAt: new Date().toISOString(), total: msgs.length, counts, important, actions, events };

  fs.mkdirSync(STATE_DIR, { recursive: true });
  fs.writeFileSync(JSON_FILE, JSON.stringify(digest, null, 2));
  const md = buildMd(digest);
  fs.writeFileSync(MD_FILE, md);
  saveIds(seen);

  // Append to Obsidian daily note
  const date = digest.generatedAt.slice(0, 10);
  const rel = `01-RAW/DAILY/${date}.md`;
  const prev = obsidian.readNote(rel) ||
    `---\ntype: daily\ntags: [daily]\nstatus: active\ncreated: ${date}\nupdated: ${date}\n---\n# ${date}\n`;
  obsidian.writeNote(rel, `${prev}\n${md}`);

  // Notion log (non-fatal)
  try { await notion.logTriage(notionItems); }
  catch (e) { console.error('[triage] notion log failed (non-fatal):', e.message); }

  // Mac push
  await macPush('BRAIN · Inbox', `${msgs.length} new · ${important.length} important · ${events.length} event(s)`);
  console.log(`[triage] ${msgs.length} emails · ${important.length} important · ${events.length} events`);

  return digest;
}

module.exports = { run };

if (require.main === module) {
  run().then(() => { console.log('[triage] done'); process.exit(0); })
       .catch(e => { console.error('[triage] FATAL:', e); process.exit(1); });
}
