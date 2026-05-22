#!/usr/bin/env node
'use strict';
// SessionStart hook: surfaces the latest inbox triage digest into Claude's context
// so every new chat tells Filipe what he missed + pending calendar events.
const fs = require('fs');
const path = require('path');

const JSON_FILE = path.join(__dirname, '..', '..', 'STATE', 'missed.json');

function out(s) { process.stdout.write(s); }

try {
  const d = JSON.parse(fs.readFileSync(JSON_FILE, 'utf8'));
  const ageH = (Date.now() - new Date(d.generatedAt).getTime()) / 3.6e6;
  if (ageH > 18 || !d.total) process.exit(0); // stale or empty → stay silent

  const lines = [];
  lines.push(`[BRAIN second-brain — inbox digest, ${ageH < 1 ? 'just now' : Math.round(ageH) + 'h ago'}]`);
  lines.push(`${d.total} email(s) triaged · ` + Object.entries(d.counts).filter(([, n]) => n).map(([c, n]) => `${c}:${n}`).join(' · '));
  if (d.important?.length) {
    lines.push(`IMPORTANT:`);
    for (const m of d.important) lines.push(`  • [${m.category}] ${m.subject} — ${m.summary}`);
  }
  if (d.actions?.length) {
    lines.push(`NEEDS ACTION:`);
    for (const a of d.actions) lines.push(`  • ${a.subject} — ${a.summary}`);
  }
  if (d.events?.length) {
    lines.push(`PENDING CALENDAR EVENTS (not yet added):`);
    for (const e of d.events) lines.push(`  • ${e.title} — ${e.date}${e.time ? ' ' + e.time : ''}${e.note ? ' (' + e.note + ')' : ''}`);
  }
  lines.push(``);
  lines.push(`INSTRUCTION: At the start of your reply, give Filipe a 1-3 line summary of what he missed above (caveman-terse). If PENDING CALENDAR EVENTS exist, offer to add them to his calendar and add via Calendar MCP only after he confirms. Then proceed with whatever he actually asked.`);
  out(lines.join('\n') + '\n');
} catch (_e) {
  process.exit(0); // no digest yet → silent
}
