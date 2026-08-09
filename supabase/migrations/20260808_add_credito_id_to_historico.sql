-- Adiciona credito_id ao histórico para rastrear origem das movimentações
-- Permite deletar histórico quando crédito é excluído

ALTER TABLE creditos_historico
  ADD COLUMN credito_id UUID REFERENCES creditos(id) ON DELETE CASCADE;

CREATE INDEX idx_creditos_historico_credito_id
  ON creditos_historico(credito_id)
  WHERE credito_id IS NOT NULL;

COMMENT ON COLUMN creditos_historico.credito_id IS
  'ID do crédito que gerou esta movimentação (CASCADE delete limpa histórico)';
