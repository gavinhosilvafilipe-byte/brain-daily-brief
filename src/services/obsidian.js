'use strict';
const fs   = require('fs');
const path = require('path');
const config = require('../config');

function vaultPath(relativePath) {
  return path.join(config.obsidian.vaultPath, 'BRAIN', relativePath);
}

function writeNote(relativePath, markdown) {
  const fullPath = vaultPath(relativePath);
  fs.mkdirSync(path.dirname(fullPath), { recursive: true });
  fs.writeFileSync(fullPath, markdown, 'utf8');
  console.log(`[obsidian] wrote: ${fullPath}`);
}

function readNote(relativePath) {
  const fullPath = vaultPath(relativePath);
  try {
    return fs.readFileSync(fullPath, 'utf8');
  } catch {
    return null;
  }
}

module.exports = { writeNote, readNote };
