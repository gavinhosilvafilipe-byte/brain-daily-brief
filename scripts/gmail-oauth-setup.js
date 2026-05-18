'use strict';
require('dotenv').config();
const { google }  = require('googleapis');
const readline    = require('readline');

const CLIENT_ID     = process.env.GMAIL_CLIENT_ID;
const CLIENT_SECRET = process.env.GMAIL_CLIENT_SECRET;
const REDIRECT_URI  = 'https://developers.google.com/oauthplayground';

if (!CLIENT_ID || !CLIENT_SECRET) {
  console.error('ERROR: Set GMAIL_CLIENT_ID and GMAIL_CLIENT_SECRET in .env');
  process.exit(1);
}

const oauth2Client = new google.auth.OAuth2(CLIENT_ID, CLIENT_SECRET, REDIRECT_URI);
const authUrl = oauth2Client.generateAuthUrl({
  access_type: 'offline',
  scope: ['https://mail.google.com/'],
});

console.log('\n=== Gmail OAuth2 Setup ===');
console.log('1. Open this URL in a browser and authorize:');
console.log('\n' + authUrl + '\n');
console.log('2. Copy the authorization code from the callback URL');
console.log('3. Paste it below\n');

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
rl.question('Paste authorization code: ', async (code) => {
  rl.close();
  try {
    const { tokens } = await oauth2Client.getToken(code.trim());
    console.log('\n=== SUCCESS ===');
    console.log('Add this line to your .env file:');
    console.log(`GMAIL_REFRESH_TOKEN=${tokens.refresh_token}`);
    console.log('\nAlso add to GitHub Actions secrets as: GMAIL_REFRESH_TOKEN');
  } catch (e) {
    console.error('Failed:', e.message);
  }
});
