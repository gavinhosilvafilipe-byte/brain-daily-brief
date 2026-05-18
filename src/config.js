'use strict';
require('dotenv').config();

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
  portfolio: {
    tickers: (process.env.PORTFOLIO_TICKERS || 'BBAS3,VALE3,PETR4,BTC,USDBRL').split(','),
    bigMoveThreshold: parseFloat(process.env.BIG_MOVE_THRESHOLD || '3.0'),
  },
  obsidian: {
    vaultPath: process.env.OBSIDIAN_VAULT_PATH || '/Users/filipegavinhodasilva/Desktop/BRAIN',
  },
};
