-- Adiciona campos de margem na tabela pagamentos_frete
ALTER TABLE pagamentos_frete
ADD COLUMN IF NOT EXISTS valor_original DECIMAL(10,2),
ADD COLUMN IF NOT EXISTS margem_aplicada DECIMAL(5,2);

COMMENT ON COLUMN pagamentos_frete.valor_original IS 'Valor do frete sem margem';
COMMENT ON COLUMN pagamentos_frete.margem_aplicada IS 'Percentual de margem aplicado';
