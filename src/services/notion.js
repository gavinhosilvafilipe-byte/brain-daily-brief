'use strict';
const { Client } = require('@notionhq/client');
const config = require('../config');

const notion = new Client({ auth: config.notion.token });
const DBS = config.notion.dbs;

async function getSettings() {
  const resp = await notion.databases.query({ database_id: DBS.settings });
  const settings = {};
  for (const page of resp.results) {
    const name  = page.properties['Setting Name']?.title?.[0]?.plain_text;
    const value = page.properties['Value']?.rich_text?.[0]?.plain_text;
    if (name) settings[name] = value;
  }
  return settings;
}

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

async function logOutput({ date, briefType, tickersMentioned, whyMovedCount, deepDivesRun, costTokens, sourcesUsed, keyThemes, briefLink }) {
  return notion.pages.create({
    parent: { database_id: DBS.outputs },
    properties: {
      'Date':                 { title:     [{ text: { content: date } }] },
      'Brief Type':           { select:    { name: briefType } },
      'Tickers Mentioned':    { rich_text: [{ text: { content: (tickersMentioned || []).join(', ') } }] },
      'Why Moved Candidates': { number: whyMovedCount || 0 },
      'Deep Dives Run Today': { number: deepDivesRun || 0 },
      'Cost Tokens':          { number: costTokens || 0 },
      'Sources Used':         { number: sourcesUsed || 0 },
      'Key Themes':           { rich_text: [{ text: { content: (keyThemes || []).join(', ') } }] },
      ...(briefLink ? { 'Brief HTML Link': { url: briefLink } } : {}),
    },
  });
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

module.exports = { getSettings, addDeepDiveCandidate, getApprovedDeepDives, updateDeepDiveStatus, logOutput, logBudget };
