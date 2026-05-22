'use strict';
// Push local preço-teto note + computed.json to Supabase (preco_teto, id=1).
// Called by BRAIN/.preco-teto/run.sh after render. CI brief.js reads it back.
require('dotenv').config({ override: true });
const fs = require('fs');
const path = require('path');
const { savePrecoTeto } = require('../src/services/supabase');

const NOTE = path.resolve(__dirname, '..', '..', 'BRAIN', 'STOCK', 'preco-teto.md');
const COMPUTED = path.resolve(__dirname, '..', '..', '.preco-teto', 'computed.json');

(async () => {
  const markdown = fs.readFileSync(NOTE, 'utf8');
  const computed = JSON.parse(fs.readFileSync(COMPUTED, 'utf8'));
  const m = markdown.match(/## §1 — Summary \((\d{4}-\d{2}-\d{2})\)/);
  const updatedDate = m ? m[1] : new Date().toISOString().slice(0, 10);
  await savePrecoTeto(updatedDate, markdown, computed);
  console.log(`[push-preco-teto] saved ${updatedDate} (${markdown.length} chars) -> Supabase`);
})().catch(e => { console.error('[push-preco-teto] FAIL:', e.message); process.exit(1); });
