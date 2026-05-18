'use strict';
const Anthropic = require('@anthropic-ai/sdk');
const config = require('../config');

const MODEL_COSTS = {
  'claude-haiku-4-5-20251001': { input: 0.0000008, output: 0.000004 },
  'claude-sonnet-4-6':         { input: 0.000003,  output: 0.000015 },
  'claude-opus-4-7':           { input: 0.000015,  output: 0.000075 },
};

const client = new Anthropic({ apiKey: config.anthropic.apiKey });

async function callModel(model, messages, systemPrompt, jobType = 'unknown') {
  const params = {
    model,
    max_tokens: model.includes('opus') ? 8192 : 4096,
    messages,
  };
  if (systemPrompt) {
    params.system = [{
      type: 'text',
      text: systemPrompt,
      cache_control: { type: 'ephemeral' },
    }];
  }
  const response = await client.messages.create(params);
  const usage = response.usage;
  const costs = MODEL_COSTS[model] || MODEL_COSTS['claude-sonnet-4-6'];
  const costUsd = (usage.input_tokens * costs.input) + (usage.output_tokens * costs.output);

  try {
    const { logCost } = require('./supabase');
    await logCost(model, usage.input_tokens, usage.output_tokens, costUsd, jobType);
  } catch (e) {
    console.error('[anthropic] cost log failed (non-fatal):', e.message);
  }

  return { content: response.content[0].text, usage, costUsd };
}

const callHaiku  = (m, s, j) => callModel('claude-haiku-4-5-20251001', m, s, j);
const callSonnet = (m, s, j) => callModel('claude-sonnet-4-6', m, s, j);
const callOpus   = (m, s, j) => callModel('claude-opus-4-7', m, s, j);

module.exports = { callModel, callHaiku, callSonnet, callOpus };
