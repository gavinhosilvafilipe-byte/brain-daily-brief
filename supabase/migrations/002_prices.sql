-- BRAIN Daily Brief — Portfolio Price Snapshots
-- Run via Supabase MCP execute_sql or SQL editor

CREATE TABLE IF NOT EXISTS price_snapshots (
  id         UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  date       DATE NOT NULL UNIQUE,
  snapshot   JSONB NOT NULL,
  movers     JSONB,
  fetched_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS price_snapshots_date_idx ON price_snapshots(date);
