-- BRAIN Daily Brief — Row Level Security
-- Apply via Supabase SQL editor
--
-- NOTE: For a backend-only service, use the SERVICE ROLE key, not the anon key.
-- Get it from: Supabase dashboard → Project Settings → API → service_role key
-- Set SUPABASE_SERVICE_KEY=your_service_key in .env
-- The service_role key bypasses RLS entirely — no policies needed.
--
-- These policies allow the anon key to work as a fallback.

-- ── Enable RLS ────────────────────────────────────────────────────────────
ALTER TABLE public.packs           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.source_trust    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.daily_analysis  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cost_log        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.job_queue       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.price_snapshots ENABLE ROW LEVEL SECURITY;

-- ── Permissive policies for anon role (backend service) ──────────────────
-- Safe because anon key is only used server-side, never exposed to browsers.

CREATE POLICY "anon_all_packs"           ON public.packs           FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "anon_all_source_trust"    ON public.source_trust    FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "anon_all_daily_analysis"  ON public.daily_analysis  FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "anon_all_cost_log"        ON public.cost_log        FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "anon_all_job_queue"       ON public.job_queue       FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "anon_all_price_snapshots" ON public.price_snapshots FOR ALL TO anon USING (true) WITH CHECK (true);
