-- ================================================================
-- CONTAS A PAGAR GERADAS PELO RH
--
-- Vale, salario, comissao e vale transporte sao dinheiro saindo da
-- empresa, mas so apareciam no RH: o Contas a Pagar nao enxergava
-- nada disso. Agora cada lancamento do RH mantem uma linha la.
--
-- A ligacao e por (origem, origem_id) com indice unico: regravar o
-- mesmo lancamento atualiza a conta em vez de criar outra. O periodo
-- de VT e o lancamento gerado a partir dele compartilham a mesma
-- chave, entao lancar o VT em Vales e Pagamentos nao duplica a conta.
--
-- Rodar inteiro no SQL Editor do Supabase.
-- ================================================================

ALTER TABLE contas_pagar
  ADD COLUMN IF NOT EXISTS origem    TEXT,
  ADD COLUMN IF NOT EXISTS origem_id UUID;

COMMENT ON COLUMN contas_pagar.origem    IS 'RH_LANC ou RH_VT quando a conta nasceu no modulo de RH';
COMMENT ON COLUMN contas_pagar.origem_id IS 'Id do lancamento de RH ou do periodo de VT que gerou a conta';

CREATE UNIQUE INDEX IF NOT EXISTS uq_contas_pagar_origem
  ON contas_pagar (tenant_id, origem, origem_id)
  WHERE origem IS NOT NULL AND origem_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_contas_pagar_origem
  ON contas_pagar (origem, origem_id);
