-- ============================================================================
-- Adicionar token do Melhor Envio por empresa (tenant)
-- ============================================================================
-- Data: 31/07/2026
-- Sistema: Multi-tenant - cada empresa tem seu próprio token

-- Adicionar coluna para token do Melhor Envio
ALTER TABLE configuracoes
ADD COLUMN IF NOT EXISTS token_melhor_envio TEXT;

-- Adicionar coluna para URL da API (sandbox ou produção)
ALTER TABLE configuracoes
ADD COLUMN IF NOT EXISTS melhor_envio_api_url TEXT DEFAULT 'https://sandbox.melhorenvio.com.br';

-- Comentários
COMMENT ON COLUMN configuracoes.token_melhor_envio IS 'Token de acesso da API do Melhor Envio (único por empresa)';
COMMENT ON COLUMN configuracoes.melhor_envio_api_url IS 'URL da API do Melhor Envio (sandbox ou produção)';
