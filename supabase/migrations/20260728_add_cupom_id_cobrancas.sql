-- Adiciona cupom_id para rastrear qual cupom foi usado
-- Necessário para incrementar o contador apenas quando PAGAR

ALTER TABLE cobrancas
ADD COLUMN IF NOT EXISTS cupom_id UUID REFERENCES cupons(id);

COMMENT ON COLUMN cobrancas.cupom_id IS
  'ID do cupom usado (para incrementar contador apenas após pagamento confirmado)';

-- Índice para otimizar buscas
CREATE INDEX IF NOT EXISTS idx_cobrancas_cupom_id
  ON cobrancas(cupom_id)
  WHERE cupom_id IS NOT NULL;
