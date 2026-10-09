-- Adiciona coluna para armazenar URLs das imagens dos produtos
-- Execute este SQL no Supabase SQL Editor

-- Adiciona coluna imagens (array de URLs em formato JSON)
ALTER TABLE produtos
ADD COLUMN IF NOT EXISTS imagens JSONB DEFAULT '[]'::jsonb;

-- Adiciona comentário explicativo
COMMENT ON COLUMN produtos.imagens IS 'Array de URLs das imagens do produto (máximo 3). Ex: ["url1.jpg", "url2.jpg"]';

-- Cria índice para consultas mais rápidas
CREATE INDEX IF NOT EXISTS idx_produtos_imagens
ON produtos USING GIN (imagens);
