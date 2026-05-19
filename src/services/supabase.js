'use strict';
const { createClient } = require('@supabase/supabase-js');
const config = require('../config');

const supabase = createClient(config.supabase.url, config.supabase.key);

async function insertPack(packType, content, sourceHash) {
  const { data, error } = await supabase.from('packs').insert({
    pack_type: packType,
    content,
    source_hash: sourceHash,
    expires_at: new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString(),
  }).select().single();
  if (error) throw error;
  return data;
}

async function getPacksForDate(date) {
  const d = new Date(date);
  const start = new Date(d); start.setUTCHours(0, 0, 0, 0);
  const end   = new Date(d); end.setUTCHours(23, 59, 59, 999);
  const { data, error } = await supabase
    .from('packs').select('*')
    .gte('created_at', start.toISOString())
    .lte('created_at', end.toISOString());
  if (error) throw error;
  return data || [];
}

async function checkPackExists(sourceHash) {
  const cutoff = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();
  const { data, error } = await supabase
    .from('packs').select('id')
    .eq('source_hash', sourceHash)
    .gte('created_at', cutoff)
    .maybeSingle();
  if (error) throw error;
  return !!data;
}

async function logCost(model, inputTokens, outputTokens, costUsd, jobType) {
  const today = new Date().toISOString().split('T')[0];
  const { error } = await supabase.from('cost_log').insert({
    date: today, model, input_tokens: inputTokens,
    output_tokens: outputTokens, cost_usd: costUsd, job_type: jobType,
  });
  if (error) console.error('[supabase] cost_log insert error:', error.message);
}

async function getDailyCosts(date) {
  const { data, error } = await supabase.from('cost_log').select('*').eq('date', date);
  if (error) throw error;
  return data || [];
}

async function getMonthlyCosts(yearMonth) {
  // DATE column doesn't support LIKE — use range query instead
  const [year, month] = yearMonth.split('-').map(Number);
  const start = `${yearMonth}-01`;
  const nextM = month === 12 ? `${year + 1}-01-01` : `${year}-${String(month + 1).padStart(2, '0')}-01`;
  const { data, error } = await supabase.from('cost_log').select('*')
    .gte('date', start).lt('date', nextM);
  if (error) throw error;
  return data || [];
}

async function saveDailyAnalysis(date, whyMovedPayload, portfolioSnapshot) {
  const { error } = await supabase.from('daily_analysis').upsert(
    { date, why_moved_payload: whyMovedPayload, portfolio_snapshot: portfolioSnapshot },
    { onConflict: 'date' }
  );
  if (error) throw error;
}

async function getDailyAnalysis(date) {
  const { data, error } = await supabase.from('daily_analysis').select('*').eq('date', date).maybeSingle();
  if (error) throw error;
  return data;
}

async function savePriceSnapshot(date, snapshot) {
  const { error } = await supabase.from('price_snapshots').upsert(
    {
      date,
      snapshot:   snapshot.prices,
      movers:     snapshot.movers,
      fetched_at: snapshot.fetchedAt,
    },
    { onConflict: 'date' }
  );
  if (error) throw error;
}

async function getPriceSnapshot(date) {
  const { data, error } = await supabase
    .from('price_snapshots').select('snapshot,movers,fetched_at').eq('date', date).maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return {
    prices:    data.snapshot,
    movers:    data.movers    || [],
    fetchedAt: data.fetched_at,
    threshold: parseFloat(process.env.BIG_MOVE_THRESHOLD || '3.0'),
  };
}

module.exports = {
  insertPack, getPacksForDate, checkPackExists,
  logCost, getDailyCosts, getMonthlyCosts,
  saveDailyAnalysis, getDailyAnalysis,
  savePriceSnapshot, getPriceSnapshot,
};
