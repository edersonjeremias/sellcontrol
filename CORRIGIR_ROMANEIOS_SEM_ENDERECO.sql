-- ============================================================================
-- CORRIGIR ROMANEIOS SEM ENDEREÇO VINCULADO
-- ============================================================================
-- Este script vincula os romaneios existentes aos endereços padrão dos clientes
-- Execute isso no Supabase SQL Editor
-- ============================================================================

-- Atualiza romaneios que não têm endereco_id preenchido
UPDATE romaneios r
SET endereco_id = e.id
FROM enderecos_clientes e
WHERE
  r.tenant_id = e.tenant_id
  AND r.cliente_instagram = e.cliente_instagram
  AND e.padrao = true
  AND r.endereco_id IS NULL;

-- Verificar quantos foram atualizados
SELECT COUNT(*) as romaneios_corrigidos
FROM romaneios
WHERE endereco_id IS NOT NULL;

-- Listar romaneios que ainda não têm endereço (clientes sem endereço cadastrado)
SELECT
  numero,
  cliente_instagram,
  status,
  created_at
FROM romaneios
WHERE endereco_id IS NULL
ORDER BY created_at DESC;
