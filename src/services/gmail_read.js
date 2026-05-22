'use strict';
const { google } = require('googleapis');
const config = require('../config');

function client() {
  const o = new google.auth.OAuth2(config.gmail.clientId, config.gmail.clientSecret);
  o.setCredentials({ refresh_token: config.gmail.refreshToken });
  return google.gmail({ version: 'v1', auth: o });
}

async function listUnread({ query = 'is:unread in:inbox newer_than:1d', max = 40 } = {}) {
  const gmail = client();
  const res = await gmail.users.messages.list({ userId: 'me', q: query, maxResults: max });
  return res.data.messages || [];
}

async function getMessage(id) {
  const gmail = client();
  const res = await gmail.users.messages.get({
    userId: 'me', id, format: 'metadata',
    metadataHeaders: ['From', 'Subject', 'Date'],
  });
  const headers = res.data.payload?.headers || [];
  const h = (n) => headers.find(x => x.name === n)?.value || '';
  return {
    id,
    from: h('From'),
    subject: h('Subject'),
    date: h('Date'),
    snippet: res.data.snippet || '',
  };
}

// Cache label name → id; create nested labels if missing.
let _labelCache = null;
async function _labels(gmail) {
  if (_labelCache) return _labelCache;
  const res = await gmail.users.labels.list({ userId: 'me' });
  _labelCache = {};
  for (const l of res.data.labels || []) _labelCache[l.name] = l.id;
  return _labelCache;
}

async function ensureLabel(name) {
  const gmail = client();
  const labels = await _labels(gmail);
  if (labels[name]) return labels[name];
  const res = await gmail.users.labels.create({
    userId: 'me',
    requestBody: { name, labelListVisibility: 'labelShow', messageListVisibility: 'show' },
  });
  _labelCache[name] = res.data.id;
  return res.data.id;
}

async function applyLabel(messageId, labelName) {
  const gmail = client();
  const labelId = await ensureLabel(labelName);
  await gmail.users.messages.modify({
    userId: 'me', id: messageId,
    requestBody: { addLabelIds: [labelId] },
  });
  return labelId;
}

module.exports = { listUnread, getMessage, ensureLabel, applyLabel };
