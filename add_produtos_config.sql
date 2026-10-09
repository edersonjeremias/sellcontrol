-- Adiciona colunas de configuração para produtos
-- Execute este SQL no Supabase SQL Editor

ALTER TABLE configuracoes
ADD COLUMN IF NOT EXISTS produtos_codigo_automatico BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS produtos_proximo_codigo INTEGER DEFAULT 100,
ADD COLUMN IF NOT EXISTS produtos_permitir_duplicado BOOLEAN DEFAULT false;

-- Atualiza configurações existentes para ter valores padrão
UPDATE configuracoes
SET
  produtos_codigo_automatico = COALESCE(produtos_codigo_automatico, false),
  produtos_proximo_codigo = COALESCE(produtos_proximo_codigo, 100),
  produtos_permitir_duplicado = COALESCE(produtos_permitir_duplicado, false)
WHERE produtos_codigo_automatico IS NULL
   OR produtos_proximo_codigo IS NULL
   OR produtos_permitir_duplicado IS NULL;
