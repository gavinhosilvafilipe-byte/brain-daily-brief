'use strict';
require('dotenv').config({ override: true });
const { getApprovedDeepDives, updateDeepDiveStatus } = require('../services/notion');
const { run: runDeepDive } = require('./deepdive');

async function run() {
  console.log('[poll] checking', new Date().toISOString());
  const approved = await getApprovedDeepDives();
  if (!approved.length) { console.log('[poll] nothing approved'); return; }

  for (const item of approved) {
    console.log(`[poll] running deep dive: ${item.ticker}`);
    await updateDeepDiveStatus(item.id, 'running');
    try {
      const link = await runDeepDive(item);
      await updateDeepDiveStatus(item.id, 'completed', link);
    } catch (e) {
      console.error(`[poll] deep dive failed for ${item.ticker}:`, e.message);
      await updateDeepDiveStatus(item.id, 'pending');
    }
  }
}

module.exports = { run };
if (require.main === module) run().catch(e => { console.error(e); process.exit(1); });
