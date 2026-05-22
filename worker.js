'use strict';
require('dotenv').config({ override: true });
const express = require('express');
const cron    = require('node-cron');
const app     = express();
const PORT    = process.env.PORT || 3000;

app.use(express.json());

// ── Auth guard — all /run/* and legacy job endpoints ────────────────────
app.use('/run', (req, res, next) => {
  const secret = process.env.WORKER_SECRET;
  if (secret && req.headers['x-api-key'] !== secret) {
    return res.status(401).json({ error: 'unauthorized' });
  }
  next();
});

// ── Health ─────────────────────────────────────────────────────────────
app.get('/health', (_req, res) => res.json({ status: 'ok', ts: new Date().toISOString() }));

// ── Generic job trigger — POST /run/:job ───────────────────────────────
const JOB_MAP = {
  ingest:    './src/jobs/ingest',
  prices:    './src/jobs/fetch_prices',
  analyze:   './src/jobs/analyze',
  brief:     './src/jobs/brief',
  budget:    './src/jobs/budget_rollup',
  distill:   './src/jobs/distill_weekly',
  poll:      './src/jobs/poll_approvals',
  deepdive:  './src/jobs/deepdive',
  valuation: './src/jobs/valuation',
  triage:    './src/jobs/triage',
};

app.post('/run/:job', async (req, res) => {
  const { job } = req.params;
  if (!JOB_MAP[job]) return res.status(404).json({ error: `unknown job: ${job}` });
  try {
    const { run } = require(JOB_MAP[job]);
    const result  = await run(req.body || {});
    res.json({ ok: true, ts: new Date().toISOString(), result: result ?? null });
  } catch (e) {
    console.error(`[worker] /run/${job} error:`, e.message);
    res.status(500).json({ error: e.message });
  }
});

// Legacy endpoints (backward compat)
app.post('/poll',     async (_req, res) => {
  try   { const { run } = require('./src/jobs/poll_approvals'); await run(); res.json({ ok: true }); }
  catch (e) { res.status(500).json({ error: e.message }); }
});
app.post('/deepdive', async (req, res) => {
  const { ticker, reason, whatWeKnow, confidence } = req.body || {};
  if (!ticker) return res.status(400).json({ error: 'ticker required' });
  try   { const { run } = require('./src/jobs/deepdive'); const link = await run({ ticker, reason, whatWeKnow, confidence }); res.json({ ok: true, link }); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

// ── Cron helpers ────────────────────────────────────────────────────────
async function runJob(name, modulePath) {
  console.log(`[cron] ${name} start`, new Date().toISOString());
  try {
    const { run } = require(modulePath);
    await run();
    console.log(`[cron] ${name} done`, new Date().toISOString());
  } catch (e) {
    console.error(`[cron] ${name} FAILED:`, e.message);
  }
}

// ── Daily pipeline — UTC times (user in Asia/Shanghai = UTC+8) ──────────
// Delivery target: email in inbox by 06:30 Shanghai = 22:30 UTC

// 21:30 UTC = 05:30 SGT — fetch news + YouTube
cron.schedule('30 21 * * *', () => runJob('ingest',        './src/jobs/ingest'));

// 22:00 UTC = 06:00 SGT — live portfolio prices via Yahoo Finance
cron.schedule('0 22 * * *',  () => runJob('fetch_prices',  './src/jobs/fetch_prices'));

// 22:10 UTC = 06:10 SGT — analyze packs + price moves
cron.schedule('10 22 * * *', () => runJob('analyze',       './src/jobs/analyze'));

// 22:30 UTC = 06:30 SGT — generate + email daily brief
cron.schedule('30 22 * * *', () => runJob('brief',         './src/jobs/brief'));

// 22:50 UTC = 06:50 SGT — budget rollup to Notion
cron.schedule('50 22 * * *', () => runJob('budget_rollup', './src/jobs/budget_rollup'));

// Every 20 min 22:00–01:00 UTC — poll Notion for approved deep dives
cron.schedule('*/20 22,23,0,1 * * *', () => runJob('poll_approvals', './src/jobs/poll_approvals'));

// Sunday 20:00 UTC = Mon 04:00 SGT — weekly distillation to Obsidian
cron.schedule('0 20 * * 0',  () => runJob('distill_weekly','./src/jobs/distill_weekly'));

// Friday 21:00 UTC = Saturday 05:00 CST — weekly portfolio valuation → Obsidian
cron.schedule('0 21 * * 5',  () => runJob('valuation',     './src/jobs/valuation'));

// ── Start ────────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`[worker] listening on :${PORT}`);
  console.log('[worker] cron active (UTC): ingest=21:30 prices=22:00 analyze=22:10 brief=22:30 budget=22:50 poll=*/20 distill=Sun20:00 valuation=Fri21:00');
});
