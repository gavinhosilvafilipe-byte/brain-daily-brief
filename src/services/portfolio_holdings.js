'use strict';
// Parse the canonical holdings note (Obsidian STOCK/Portfolio.md) into structured rows.
// Portfolio.md is the SOURCE OF TRUTH for qty + cost basis; this never writes back to it.
const { readNote } = require('./obsidian');

// Strip R$, thousands commas, %, +, parens → float (keeps leading minus). null if blank/dash.
function num(s) {
  if (s == null) return null;
  const t = String(s).replace(/[R$\s,%+()]/g, '');
  if (t === '' || t === '—' || t === '-') return null;
  const v = parseFloat(t);
  return Number.isFinite(v) ? v : null;
}

const SECTIONS = [
  { re: /^##\s*B3 Stocks/i, cls: 'B3_STOCK', cat: 'B3 Stocks', kind: 'equity' },
  { re: /^##\s*FIIs/i,      cls: 'FII',      cat: 'FIIs',      kind: 'equity' },
  { re: /^##\s*Crypto/i,    cls: 'CRYPTO',   cat: 'Crypto',    kind: 'crypto' },
  { re: /^##\s*Tesouro/i,   cls: 'TESOURO',  cat: 'Tesouro',   kind: 'tesouro' },
];

function tableRows(lines) {
  return lines
    .filter(l => l.trim().startsWith('|'))
    .map(l => l.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map(c => c.trim()))
    .filter(cells => !cells.every(c => /^-+$/.test(c) || c === ''))     // drop separator row
    .filter(cells => !/^(ticker|asset|bond)$/i.test(cells[0]));         // drop header row
}

function parsePortfolio(relPath = 'STOCK/Portfolio.md') {
  const md = readNote(relPath);
  if (!md) return { positions: [], updated: null };
  const updated = (md.match(/^updated:\s*(\S+)/m) || [])[1] || null;

  const segs = [];
  let cur = null;
  for (const line of md.split('\n')) {
    const hit = SECTIONS.find(s => s.re.test(line));
    if (hit) { cur = { ...hit, lines: [] }; segs.push(cur); continue; }
    if (cur && /^##\s/.test(line)) cur = null;   // a non-portfolio header ends the section
    if (cur) cur.lines.push(line);
  }

  const positions = [];
  for (const seg of segs) {
    for (const cells of tableRows(seg.lines)) {
      if (seg.kind === 'tesouro') {
        const [bond, value] = cells;
        if (!bond) continue;
        positions.push({ ticker: bond.replace(/\s+/g, ''), asset_class: 'TESOURO', category: 'Tesouro',
          quantity: null, invested_brl: num(value), avg_price: null, avg_price_with_div: null,
          pnl_ex: null, pnl_inc: null, ret_ex: null, ret_inc: null });
      } else if (seg.kind === 'crypto') {
        const [asset, qty, inv, avg, pnl, ret] = cells;
        if (!asset) continue;
        positions.push({ ticker: asset, asset_class: 'CRYPTO', category: 'Crypto',
          quantity: num(qty), invested_brl: num(inv), avg_price: num(avg), avg_price_with_div: null,
          pnl_ex: num(pnl), pnl_inc: num(pnl), ret_ex: num(ret), ret_inc: num(ret) });
      } else {
        const [tk, qty, inv, avg, avgDiv, pnlEx, pnlInc, retEx, retInc] = cells;
        if (!tk) continue;
        positions.push({ ticker: tk, asset_class: seg.cls, category: seg.cat,
          quantity: num(qty), invested_brl: num(inv), avg_price: num(avg), avg_price_with_div: num(avgDiv),
          pnl_ex: num(pnlEx), pnl_inc: num(pnlInc), ret_ex: num(retEx), ret_inc: num(retInc) });
      }
    }
  }
  return { positions, updated };
}

module.exports = { parsePortfolio };
