'use strict';
require('dotenv').config({ override: true });

module.exports = {
  anthropic: {
    apiKey: process.env.ANTHROPIC_API_KEY,
  },
  notion: {
    token: process.env.NOTION_TOKEN,
    dbs: {
      settings: process.env.NOTION_SETTINGS_DB_ID,
      queue: process.env.NOTION_QUEUE_DB_ID,
      outputs: process.env.NOTION_OUTPUTS_DB_ID,
      budget: process.env.NOTION_BUDGET_DB_ID,
      triage: process.env.NOTION_TRIAGE_DB_ID,
      portfolio: process.env.NOTION_PORTFOLIO_DB_ID || '6ec6dbf9a82f4fd586bf3b1e77343f72',
    },
  },
  supabase: {
    url: process.env.SUPABASE_URL,
    key: process.env.SUPABASE_ANON_KEY,
  },
  gmail: {
    clientId: process.env.GMAIL_CLIENT_ID,
    clientSecret: process.env.GMAIL_CLIENT_SECRET,
    refreshToken: process.env.GMAIL_REFRESH_TOKEN,
    recipientEmail: process.env.RECIPIENT_EMAIL,
  },
  youtube: {
    apiKey: process.env.YOUTUBE_API_KEY,
    channels: (process.env.YOUTUBE_CHANNELS || '').split(',').filter(Boolean),
    lookbackHours: parseInt(process.env.YOUTUBE_LOOKBACK_HOURS || '48'),
  },
  newsapi: {
    orgKey: process.env.NEWSAPI_ORG_KEY,
    dataKey: process.env.NEWSDATA_IO_KEY,
  },
  firecrawl: {
    apiKey: process.env.FIRECRAWL_API_KEY,
  },
  investidor10: {
    walletId:   process.env.INVESTIDOR10_WALLET_ID   || '',
    walletHash: process.env.INVESTIDOR10_WALLET_HASH || '',
  },
  portfolio: {
    tickers: (process.env.PORTFOLIO_TICKERS || 'BBAS3,VALE3,PETR4,USDBRL').split(',').map(s => s.trim()).filter(Boolean),
    fiiTickers: (process.env.FII_TICKERS || '').split(',').filter(Boolean),
    // Asset classes hidden from sync/brief (reversible). Default hides CRYPTO.
    excludeAssetClasses: (process.env.EXCLUDE_ASSET_CLASSES || 'CRYPTO').split(',').map(s => s.trim().toUpperCase()).filter(Boolean),
    bigMoveThreshold: parseFloat(process.env.BIG_MOVE_THRESHOLD || '3.0'),
    ntnbYield: parseFloat(process.env.NTNB_YIELD || '6.5'),
    sectorMultiples: {
      BBAS3:   { fairPL: 7,  fairPVP: 1.2 },
      ABCB4:   { fairPL: 8,  fairPVP: 1.3 },
      VALE3:   { fairPL: 6,  fairPVP: 1.5 },
      PETR4:   { fairPL: 7,  fairPVP: 1.5 },
      AURE3:   { fairPL: 14, fairPVP: 1.0 },
      CSMG3:   { fairPL: 12, fairPVP: 1.2 },
      DEFAULT: { fairPL: 10, fairPVP: 1.0 },
      FII:     { fairPL: null, fairPVP: 1.0 },
    },
  },
  obsidian: {
    vaultPath: process.env.OBSIDIAN_VAULT_PATH || '/Users/filipegavinhodasilva/Desktop/BRAIN',
  },
};
