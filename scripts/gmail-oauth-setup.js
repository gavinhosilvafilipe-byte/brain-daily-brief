'use strict';
require('dotenv').config({ override: true });
const { google } = require('googleapis');
const http       = require('http');
const fs         = require('fs');
const path       = require('path');

const CLIENT_ID     = process.env.GMAIL_CLIENT_ID;
const CLIENT_SECRET = process.env.GMAIL_CLIENT_SECRET;
const REDIRECT_URI  = 'http://localhost:3977/oauth2callback';

if (!CLIENT_ID || !CLIENT_SECRET) {
  console.error('ERROR: Set GMAIL_CLIENT_ID and GMAIL_CLIENT_SECRET in .env');
  process.exit(1);
}

const oauth2Client = new google.auth.OAuth2(CLIENT_ID, CLIENT_SECRET, REDIRECT_URI);
const authUrl = oauth2Client.generateAuthUrl({
  access_type: 'offline',
  prompt: 'consent',
  scope: ['https://mail.google.com/'],
});

console.log('\n=== Gmail OAuth2 Setup ===\n');
console.log('STEP 1: Go to Google Cloud Console:');
console.log('  https://console.cloud.google.com/apis/credentials');
console.log(`  → Edit your OAuth Client ID`);
console.log(`  → Under "Authorized redirect URIs", add: ${REDIRECT_URI}`);
console.log('  → Click Save\n');
console.log('STEP 2: A browser window will open. Approve Gmail access.\n');
console.log('Waiting for callback on localhost:3977...\n');

const { exec } = require('child_process');
exec(`open "${authUrl}"`);

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost:3977');
  const code  = url.searchParams.get('code');
  const error = url.searchParams.get('error');

  if (error) {
    res.writeHead(400, { 'Content-Type': 'text/html' });
    res.end(`<h2>Error: ${error}</h2><p>Close this tab and retry.</p>`);
    server.close();
    process.exit(1);
  }
  if (!code) { res.writeHead(404); res.end('waiting'); return; }

  try {
    const { tokens } = await oauth2Client.getToken(code);
    const refreshToken = tokens.refresh_token;

    if (!refreshToken) {
      res.writeHead(400, { 'Content-Type': 'text/html' });
      res.end('<h2>No refresh token.</h2><p>Go to <a href="https://myaccount.google.com/permissions">Google permissions</a>, remove this app, then retry.</p>');
      server.close();
      process.exit(1);
    }

    // Write token to .env automatically
    const envPath = path.join(__dirname, '..', '.env');
    let env = fs.readFileSync(envPath, 'utf8');
    env = env.replace(/^GMAIL_REFRESH_TOKEN=.*$/m, `GMAIL_REFRESH_TOKEN=${refreshToken}`);
    fs.writeFileSync(envPath, env, 'utf8');

    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end('<h2>Done! Gmail OAuth2 setup complete.</h2><p>Refresh token saved to .env. Close this tab.</p>');
    console.log('\n=== SUCCESS ===');
    console.log('GMAIL_REFRESH_TOKEN written to .env');
    console.log('Run: npm run brief');
    server.close();
    process.exit(0);
  } catch (e) {
    res.writeHead(500, { 'Content-Type': 'text/html' });
    res.end(`<h2>Failed</h2><p>${e.message}</p>`);
    console.error('Token exchange failed:', e.message);
    server.close();
    process.exit(1);
  }
});

server.listen(3977);

setTimeout(() => {
  console.error('\nTimeout — no callback in 2 min. Retry: npm run gmail-setup');
  server.close();
  process.exit(1);
}, 120000);
