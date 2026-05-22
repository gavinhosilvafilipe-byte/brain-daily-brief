'use strict';
const fs   = require('fs');
const path = require('path');
const config = require('../config');

const VAULT = config.obsidian?.vaultPath
  ? path.join(config.obsidian.vaultPath, 'BRAIN')
  : path.join(process.env.HOME, 'Desktop', 'BRAIN', 'BRAIN');

const SIX_MONTHS_MS = 6 * 30 * 24 * 60 * 60 * 1000;
const MAX_SNIPPETS_IN_CONTEXT = 10;

function newsDir(ticker) {
  return path.join(VAULT, 'STOCK', ticker.toUpperCase(), 'news');
}

/**
 * Save a long-horizon news snippet for a ticker.
 * @param {string} ticker
 * @param {{ date: string, headline: string, summary: string, horizon: string }} snippet
 */
function saveSnippet(ticker, { date, headline, summary, horizon }) {
  const dir = newsDir(ticker);
  fs.mkdirSync(dir, { recursive: true });
  const slug = headline.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 50);
  const file = path.join(dir, `${date}-${slug}.md`);
  if (fs.existsSync(file)) return; // idempotent — don't overwrite same-day same-headline
  const content = `---\nticker: ${ticker}\ndate: ${date}\nhorizon: ${horizon}\n---\n\n# ${headline}\n\n${summary}\n`;
  fs.writeFileSync(file, content, 'utf8');
  console.log(`[stock-news] saved: ${ticker}/${date}-${slug}.md`);
}

/**
 * Return combined text of recent (≤6mo) snippets for a ticker — for Haiku context reuse.
 * Returns '' if no snippets exist.
 */
function getContext(ticker) {
  const dir = newsDir(ticker);
  if (!fs.existsSync(dir)) return '';
  const cutoff = Date.now() - SIX_MONTHS_MS;
  const files = fs.readdirSync(dir)
    .filter(f => f.endsWith('.md'))
    .map(f => ({ f, mtime: fs.statSync(path.join(dir, f)).mtimeMs }))
    .filter(({ mtime }) => mtime > cutoff)
    .sort((a, b) => b.mtime - a.mtime)
    .slice(0, MAX_SNIPPETS_IN_CONTEXT);
  if (!files.length) return '';
  return files.map(({ f }) => fs.readFileSync(path.join(dir, f), 'utf8')).join('\n---\n');
}

/**
 * Delete snippets older than 6 months for a single ticker.
 */
function pruneOld(ticker) {
  const dir = newsDir(ticker);
  if (!fs.existsSync(dir)) return;
  const cutoff = Date.now() - SIX_MONTHS_MS;
  let pruned = 0;
  for (const f of fs.readdirSync(dir)) {
    if (!f.endsWith('.md')) continue;
    const fp = path.join(dir, f);
    if (fs.statSync(fp).mtimeMs < cutoff) { fs.unlinkSync(fp); pruned++; }
  }
  if (pruned) console.log(`[stock-news] pruned ${pruned} old snippets for ${ticker}`);
}

/**
 * Prune all tickers — call from a monthly cron job.
 */
function pruneAll(tickers) {
  for (const t of tickers) pruneOld(t);
}

module.exports = { saveSnippet, getContext, pruneOld, pruneAll };
