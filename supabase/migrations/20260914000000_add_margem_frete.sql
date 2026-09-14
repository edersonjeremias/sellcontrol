-- Adiciona campo de margem de frete nas configurações
ALTER TABLE configuracoes
ADD COLUMN IF NOT EXISTS margem_frete DECIMAL(5,2) DEFAULT 10.00;

COMMENT ON COLUMN configuracoes.margem_frete IS 'Percentual de margem aplicado sobre o valor do frete (para cobrir taxas e lucro)';
