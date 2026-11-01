-- ================================================================
-- PARCELAMENTO DOS LANCAMENTOS DO RH
-- Uma linha por parcela, todas amarradas pelo mesmo grupo_id.
-- Usado nas compras que o funcionario faz na loja e paga em N vezes.
-- Rodar inteiro no SQL Editor do Supabase.
-- ================================================================

ALTER TABLE rh_lancamentos
  ADD COLUMN IF NOT EXISTS grupo_id       UUID,
  ADD COLUMN IF NOT EXISTS parcela        INT,
  ADD COLUMN IF NOT EXISTS total_parcelas INT;

CREATE INDEX IF NOT EXISTS idx_rh_lanc_grupo ON rh_lancamentos (grupo_id);

COMMENT ON COLUMN rh_lancamentos.grupo_id IS
  'Liga as parcelas de uma mesma compra/lancamento parcelado';
COMMENT ON COLUMN rh_lancamentos.parcela IS
  'Numero desta parcela dentro do grupo (1, 2, 3...)';
COMMENT ON COLUMN rh_lancamentos.total_parcelas IS
  'Quantidade de parcelas do grupo';
