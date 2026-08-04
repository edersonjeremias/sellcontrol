-- Migration: Popular tabela lives com lives existentes em vendas
-- Data: 2026-08-03
-- Descrição: Extrai nomes únicos de lives da tabela vendas e insere na tabela lives
--           Ignora duplicatas (ON CONFLICT DO NOTHING)

INSERT INTO lives (tenant_id, nome, created_at)
SELECT DISTINCT
  v.tenant_id,
  v.live_nome AS nome,
  NOW() AS created_at
FROM vendas v
WHERE v.live_nome IS NOT NULL
  AND v.live_nome != ''
  AND v.live_nome IS NOT NULL
ON CONFLICT (tenant_id, nome) DO NOTHING;

-- Resultado esperado: Lives históricas agora aparecem na tabela lives
-- Performance: getDadosIniciais e getLivesParaCobranca agora são instantâneos
