-- Remove a constraint antiga e recria com ON DELETE SET NULL
-- Permite excluir cupons mesmo que tenham sido usados em cobranças
-- O histórico é mantido via cupom_codigo, cupom_desconto_percentual, cupom_desconto_valor

-- 1. Remove a constraint antiga
ALTER TABLE cobrancas
DROP CONSTRAINT IF EXISTS cobrancas_cupom_id_fkey;

-- 2. Recria a constraint com ON DELETE SET NULL
ALTER TABLE cobrancas
ADD CONSTRAINT cobrancas_cupom_id_fkey
  FOREIGN KEY (cupom_id)
  REFERENCES cupons(id)
  ON DELETE SET NULL;

COMMENT ON CONSTRAINT cobrancas_cupom_id_fkey ON cobrancas IS
  'Permite excluir cupons - o histórico é mantido via cupom_codigo/desconto';
