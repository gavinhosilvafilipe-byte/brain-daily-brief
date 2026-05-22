#!/usr/bin/env node
'use strict';
// SessionEnd hook: appends each Claude chat's topic to the Obsidian chat log,
// so the vault keeps a running index of what Filipe worked on with Claude.
const fs = require('fs');
const path = require('path');

const VAULT = process.env.OBSIDIAN_VAULT_PATH || '/Users/filipegavinhodasilva/Desktop/BRAIN';
const LOG = path.join(VAULT, 'BRAIN', '02-WIKI', 'Claude-Chat-Log.md');

function readStdin() {
  try { return fs.readFileSync(0, 'utf8'); } catch { return ''; }
}

function firstUserText(transcriptPath) {
  try {
    const lines = fs.readFileSync(transcriptPath, 'utf8').split('\n').filter(Boolean);
    for (const line of lines) {
      let o; try { o = JSON.parse(line); } catch { continue; }
      const msg = o.message || o;
      if (msg.role !== 'user') continue;
      let text = '';
      if (typeof msg.content === 'string') text = msg.content;
      else if (Array.isArray(msg.content)) text = msg.content.filter(b => b.type === 'text').map(b => b.text).join(' ');
      text = text.trim();
      // skip system reminders / hook noise / tool results
      if (!text || text.startsWith('<') || text.startsWith('[') || text.length < 4) continue;
      return text.replace(/\s+/g, ' ').slice(0, 140);
    }
  } catch { /* ignore */ }
  return null;
}

const raw = readStdin();
let data = {}; try { data = JSON.parse(raw); } catch { /* */ }
const tpath = data.transcript_path || data.transcriptPath || process.env.CLAUDE_TRANSCRIPT_PATH;
if (!tpath) process.exit(0);

const topic = firstUserText(tpath);
if (!topic) process.exit(0);

const now = new Date();
const stamp = now.toISOString().slice(0, 16).replace('T', ' ');
const line = `- ${stamp} — ${topic}\n`;

fs.mkdirSync(path.dirname(LOG), { recursive: true });
if (!fs.existsSync(LOG)) fs.writeFileSync(LOG, `# 🤖 Claude Chat Log\n\nRunning index of Claude Code sessions, newest at bottom. Auto-appended on session end.\n\n`);
fs.appendFileSync(LOG, line);
process.exit(0);
