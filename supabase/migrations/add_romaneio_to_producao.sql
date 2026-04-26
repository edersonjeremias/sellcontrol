-- ============================================================
-- EXECUTE NO SUPABASE: SQL Editor → New Query → Run
-- Adiciona coluna romaneio em producao_pedidos
-- (vincula ao número de romaneio gerado na página Expedição)
-- ============================================================

ALTER TABLE producao_pedidos
  ADD COLUMN IF NOT EXISTS romaneio INTEGER;

CREATE INDEX IF NOT EXISTS idx_producao_romaneio
  ON producao_pedidos(tenant_id, romaneio)
  WHERE romaneio IS NOT NULL;

NOTIFY pgrst, 'reload schema';
