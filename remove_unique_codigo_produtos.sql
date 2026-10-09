-- Remove constraint UNIQUE do código em produtos
-- Execute este SQL no Supabase SQL Editor

-- Remove a constraint única do campo codigo
ALTER TABLE produtos
DROP CONSTRAINT IF EXISTS produtos_tenant_id_codigo_key;

-- OPCIONAL: Se quiser criar um índice não-único para melhor performance
-- (permite duplicados mas mantém busca rápida)
CREATE INDEX IF NOT EXISTS idx_produtos_tenant_codigo
ON produtos(tenant_id, codigo);

-- Verifica se foi removido
SELECT conname, contype
FROM pg_constraint
WHERE conrelid = 'produtos'::regclass
AND conname LIKE '%codigo%';
