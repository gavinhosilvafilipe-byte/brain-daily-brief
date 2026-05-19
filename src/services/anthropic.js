'use strict';
const Anthropic = require('@anthropic-ai/sdk');
const config = require('../config');

// Per-token pricing (USD). Cache read = 10% of input; cache write = 125% of input.
const MODEL_COSTS = {
  'claude-haiku-4-5-20251001': { input: 0.0000008,  output: 0.000004,   cacheWrite: 0.000001,   cacheRead: 0.00000008  },
  'claude-sonnet-4-6':         { input: 0.000003,   output: 0.000015,   cacheWrite: 0.00000375, cacheRead: 0.0000003   },
  'claude-opus-4-7':           { input: 0.000015,   output: 0.000075,   cacheWrite: 0.00001875, cacheRead: 0.0000015   },
};

// SDK reads ANTHROPIC_API_KEY from env automatically; explicit pass fails in v0.55+ if key is undefined at init time
const client = config.anthropic.apiKey
  ? new Anthropic({ apiKey: config.anthropic.apiKey })
  : new Anthropic();

/**
 * opts.cacheContent  — split last user message at '---' boundary:
 *                      packs above = cached (ephemeral), instructions below = live.
 *                      Saves ~90% on re-runs within 5-min cache TTL.
 * opts.maxTokens     — override default max_tokens.
 */
async function callModel(model, messages, systemPrompt, jobType = 'unknown', opts = {}) {
  let finalMessages = messages;

  if (opts.cacheContent) {
    finalMessages = messages.map((msg, i) => {
      if (msg.role !== 'user' || i !== messages.length - 1) return msg;
      const text = typeof msg.content === 'string' ? msg.content : null;
      if (!text) return msg;
      // Split at last '---' divider: stable pack content (cached) + live instructions
      const cut = text.lastIndexOf('\n\n---\n\n');
      if (cut === -1) return msg;
      return {
        ...msg,
        content: [
          { type: 'text', text: text.slice(0, cut), cache_control: { type: 'ephemeral' } },
          { type: 'text', text: text.slice(cut) },
        ],
      };
    });
  }

  const params = {
    model,
    max_tokens: opts.maxTokens ?? (model.includes('opus') ? 8192 : 4096),
    messages: finalMessages,
  };
  if (systemPrompt) {
    params.system = [{ type: 'text', text: systemPrompt, cache_control: { type: 'ephemeral' } }];
  }

  const response = await client.messages.create(params);
  const usage  = response.usage;
  const costs  = MODEL_COSTS[model] || MODEL_COSTS['claude-sonnet-4-6'];
  const costUsd =
    (usage.input_tokens              * costs.input)      +
    (usage.output_tokens             * costs.output)     +
    ((usage.cache_creation_input_tokens ?? 0) * costs.cacheWrite) +
    ((usage.cache_read_input_tokens   ?? 0) * costs.cacheRead);

  const cacheHit = (usage.cache_read_input_tokens ?? 0) > 0;
  if (cacheHit) console.log(`[anthropic] cache HIT — saved ~${usage.cache_read_input_tokens} tokens`);

  try {
    const { logCost } = require('./supabase');
    await logCost(model, usage.input_tokens, usage.output_tokens, costUsd, jobType);
  } catch (e) {
    console.error('[anthropic] cost log failed (non-fatal):', e.message);
  }

  return { content: response.content?.[0]?.text ?? '', usage, costUsd };
}

const callHaiku  = (m, s, j, opts) => callModel('claude-haiku-4-5-20251001', m, s, j, opts);
const callSonnet = (m, s, j, opts) => callModel('claude-sonnet-4-6',         m, s, j, opts);
const callOpus   = (m, s, j, opts) => callModel('claude-opus-4-7',           m, s, j, opts);

module.exports = { callModel, callHaiku, callSonnet, callOpus };
