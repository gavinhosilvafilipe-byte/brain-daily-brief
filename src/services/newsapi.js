'use strict';
const axios = require('axios');
const config = require('../config');

const TOPICS = [
  'US stock market Fed interest rates',
  'Brazil Ibovespa SELIC inflation Copom',
  'Bitcoin Ethereum crypto markets',
  'oil gold iron ore commodities',
  'China trade geopolitics',
  'Brazil banks Banco do Brasil Itau Bradesco earnings',
  'Brazil utilities electricity sanitation Cemig Taesa',
  'Vale mining iron ore Brazil exports',
  'Brazil real estate FII fundos imobiliarios interest rates',
  'Brazil fiscal Tesouro NTN-B real yield',
];

async function searchNewsOrg(query, pageSize = 20) {
  const from = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString().split('T')[0];
  const resp = await axios.get('https://newsapi.org/v2/everything', {
    params: { q: query, from, sortBy: 'relevancy', pageSize, apiKey: config.newsapi.orgKey, language: 'en' },
  });
  return (resp.data.articles || []).map(a => ({
    title: a.title, description: a.description,
    url: a.url, publishedAt: a.publishedAt, source: a.source?.name,
  }));
}

async function searchNewsData(query, size = 10) {
  const resp = await axios.get('https://newsdata.io/api/1/latest', {
    params: { apikey: config.newsapi.dataKey, q: query, language: 'en', size },
  });
  return (resp.data.results || []).map(a => ({
    title: a.title, description: a.description,
    url: a.link, publishedAt: a.pubDate, source: a.source_id,
  }));
}

async function fetchMarketNews(topics = TOPICS) {
  const results = [];
  for (const topic of topics) {
    try {
      const articles = await searchNewsOrg(topic, 14);
      results.push(...articles);
    } catch (e) {
      console.error(`[newsapi] newsapi.org failed for "${topic}":`, e.message);
      try {
        const articles = await searchNewsData(topic, 5);
        results.push(...articles);
      } catch (e2) {
        console.error(`[newsapi] newsdata.io also failed:`, e2.message);
      }
    }
  }
  const seen = new Set();
  return results.filter(a => {
    if (!a.url || seen.has(a.url)) return false;
    seen.add(a.url);
    return true;
  });
}

module.exports = { searchNewsOrg, searchNewsData, fetchMarketNews };
