'use strict';
require('dotenv').config();
const express = require('express');
const app     = express();
const PORT    = process.env.PORT || 3000;

app.use(express.json());

app.get('/health', (_req, res) => res.json({ status: 'ok', ts: new Date().toISOString() }));

app.post('/poll', async (_req, res) => {
  try {
    const { run } = require('./src/jobs/poll_approvals');
    await run();
    res.json({ ok: true, ts: new Date().toISOString() });
  } catch (e) {
    console.error('[worker] /poll error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

app.post('/deepdive', async (req, res) => {
  const { ticker, reason, whatWeKnow, confidence } = req.body || {};
  if (!ticker) return res.status(400).json({ error: 'ticker required' });
  try {
    const { run } = require('./src/jobs/deepdive');
    const link = await run({ ticker, reason, whatWeKnow, confidence });
    res.json({ ok: true, link });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.listen(PORT, () => console.log(`[worker] listening on ${PORT}`));
