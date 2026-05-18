-- BRAIN Daily Brief — Initial Schema
-- Run this via Supabase MCP or SQL editor

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Packs: compressed data bundles from ingest job
CREATE TABLE IF NOT EXISTS packs (
  id          UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  pack_type   TEXT        NOT NULL,
  content     JSONB       NOT NULL,
  source_hash TEXT,
  trust_tier  TEXT        DEFAULT 'MED',
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  expires_at  TIMESTAMPTZ DEFAULT (NOW() + INTERVAL '48 hours')
);
CREATE INDEX IF NOT EXISTS packs_hash_idx    ON packs(source_hash);
CREATE INDEX IF NOT EXISTS packs_created_idx ON packs(created_at);
CREATE INDEX IF NOT EXISTS packs_type_idx    ON packs(pack_type);

-- Source trust registry (90-day cache)
CREATE TABLE IF NOT EXISTS source_trust (
  id          UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  source_url  TEXT UNIQUE NOT NULL,
  trust_tier  TEXT        NOT NULL DEFAULT 'MED',
  reasoning   TEXT,
  watch_for   TEXT,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  expires_at  TIMESTAMPTZ DEFAULT (NOW() + INTERVAL '90 days')
);

-- Daily analysis results (WHY_MOVED payload)
CREATE TABLE IF NOT EXISTS daily_analysis (
  id                  UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  date                DATE NOT NULL UNIQUE,
  why_moved_payload   JSONB,
  portfolio_snapshot  JSONB,
  created_at          TIMESTAMPTZ DEFAULT NOW()
);

-- Model usage cost log
CREATE TABLE IF NOT EXISTS cost_log (
  id            UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  date          DATE NOT NULL,
  model         TEXT NOT NULL,
  input_tokens  INTEGER DEFAULT 0,
  output_tokens INTEGER DEFAULT 0,
  cost_usd      FLOAT   DEFAULT 0,
  job_type      TEXT,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS cost_log_date_idx ON cost_log(date);

-- Job queue (for Railway worker / on-demand triggers)
CREATE TABLE IF NOT EXISTS job_queue (
  id           UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  job_type     TEXT NOT NULL,
  status       TEXT DEFAULT 'pending',
  payload      JSONB,
  result       JSONB,
  created_at   TIMESTAMPTZ DEFAULT NOW(),
  started_at   TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  error        TEXT
);
