-- Portfolio positions: cost basis + performance per holding
-- "current_value_brl" = live portfolio value (what user calls "amount invested")
-- cost_basis_brl = quantity × avg_price (computed column)

CREATE TABLE IF NOT EXISTS portfolio_positions (
  id                  UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  ticker              TEXT NOT NULL UNIQUE,
  asset_class         TEXT NOT NULL,       -- 'B3_STOCK' | 'FII' | 'CRYPTO' | 'TESOURO'
  quantity            NUMERIC,
  current_value_brl   NUMERIC,             -- current market value in BRL
  avg_price           NUMERIC,             -- avg purchase price (ex-dividends)
  avg_price_with_div  NUMERIC,             -- avg price adjusted for dividends received
  rendimento_sem_prov NUMERIC,             -- P&L excl. dividends (BRL)
  rendimento_com_prov NUMERIC,             -- P&L incl. dividends (BRL)
  rentab_sem_prov     NUMERIC,             -- return % excl. dividends
  rentab_com_prov     NUMERIC,             -- return % incl. dividends
  notes               TEXT,
  updated_at          TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE portfolio_positions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "anon_all" ON portfolio_positions FOR ALL TO anon USING (true) WITH CHECK (true);

CREATE OR REPLACE FUNCTION update_portfolio_timestamp()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER portfolio_positions_updated_at
  BEFORE UPDATE ON portfolio_positions
  FOR EACH ROW EXECUTE FUNCTION update_portfolio_timestamp();
