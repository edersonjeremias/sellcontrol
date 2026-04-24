-- ============================================================
-- EXECUTE NO SUPABASE: SQL Editor → New Query → Run
-- Adiciona coluna numero_pedido na tabela vendas
-- (usada pelo módulo Controle de Pedidos)
-- ============================================================

ALTER TABLE vendas
  ADD COLUMN IF NOT EXISTS numero_pedido INTEGER;

CREATE INDEX IF NOT EXISTS idx_vendas_numero_pedido
  ON vendas(tenant_id, numero_pedido)
  WHERE numero_pedido IS NOT NULL;

NOTIFY pgrst, 'reload schema';
