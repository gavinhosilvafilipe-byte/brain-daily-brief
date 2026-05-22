-- BRAIN Daily Brief — preço-teto table (captured from live) + portfolio MTM sync columns
-- Idempotent: safe to re-run. preco_teto + portfolio_positions already exist live;
-- this file brings migrations/ into source-of-truth parity and adds mark-to-market columns.

-- ── preço-teto: composite ceiling-price store (singleton row, id=1) ───────
CREATE TABLE IF NOT EXISTS public.preco_teto (
  id           INT PRIMARY KEY,
  updated_date DATE,
  markdown     TEXT,
  computed     JSONB,
  refreshed_at TIMESTAMPTZ DEFAULT NOW()
);

-- RLS: anon key is used server-side only (matches 003_rls.sql convention).
-- Policy is created alongside enable so access is not blocked.
ALTER TABLE public.preco_teto ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "anon_all_preco_teto" ON public.preco_teto;
CREATE POLICY "anon_all_preco_teto" ON public.preco_teto FOR ALL TO anon USING (true) WITH CHECK (true);

-- ── portfolio_positions: mark-to-market sync columns ─────────────────────
-- current_value_brl holds INVESTED (cost basis) from Portfolio.md (canonical).
-- These add live market value + day delta + preço-teto status, refreshed each run.
ALTER TABLE public.portfolio_positions ADD COLUMN IF NOT EXISTS market_value_brl      NUMERIC;
ALTER TABLE public.portfolio_positions ADD COLUMN IF NOT EXISTS prev_market_value_brl NUMERIC;
ALTER TABLE public.portfolio_positions ADD COLUMN IF NOT EXISTS day_change_pct        NUMERIC;
ALTER TABLE public.portfolio_positions ADD COLUMN IF NOT EXISTS last_price            NUMERIC;
ALTER TABLE public.portfolio_positions ADD COLUMN IF NOT EXISTS teto_status           TEXT;
ALTER TABLE public.portfolio_positions ADD COLUMN IF NOT EXISTS teto_price            NUMERIC;
ALTER TABLE public.portfolio_positions ADD COLUMN IF NOT EXISTS teto_margin           NUMERIC;
ALTER TABLE public.portfolio_positions ADD COLUMN IF NOT EXISTS synced_at             TIMESTAMPTZ;
