-- Corrige foreign key de cobranca_id para permitir exclusão
-- Quando uma cobrança é excluída, mantém o histórico mas seta cobranca_id = NULL

-- Remove a constraint antiga
ALTER TABLE creditos_historico
  DROP CONSTRAINT IF EXISTS creditos_historico_cobranca_id_fkey;

-- Adiciona nova constraint com ON DELETE SET NULL
ALTER TABLE creditos_historico
  ADD CONSTRAINT creditos_historico_cobranca_id_fkey
  FOREIGN KEY (cobranca_id)
  REFERENCES cobrancas(id)
  ON DELETE SET NULL;

COMMENT ON CONSTRAINT creditos_historico_cobranca_id_fkey ON creditos_historico IS
  'Permite excluir cobrança sem perder o histórico de crédito (seta NULL)';
