-- ════════════════════════════════════════════════════════════════
-- CORRIGE AS COLUNAS DO KANBAN DE NOTIFICAÇÕES
--
-- Problema: a coluna "Novo" foi renomeada para "Cancelado".
-- As 16 conversas ativas continuaram com coluna = 'Novo' no banco,
-- e como "Novo" não existia mais na configuração, elas sumiram da tela.
--
-- Solução: restaura "Novo" e mantém "Cancelado" como coluna extra.
-- Rode tudo de uma vez no SQL Editor do Supabase.
-- ════════════════════════════════════════════════════════════════

-- 1) Restaura a configuração das colunas
UPDATE notificacoes_colunas
SET colunas = '[
  {"titulo": "Novo",                "cor": "#fbbc04"},
  {"titulo": "Aguardando Resposta", "cor": "#f28b82"},
  {"titulo": "Compras",             "cor": "#81c995"},
  {"titulo": "Cancelado",           "cor": "#9aa0a6"}
]'::jsonb
WHERE tenant_id = '7135c82e-6155-41e5-9c42-638a94222bbe';

-- 2) Qualquer conversa ativa com coluna vazia volta para "Novo"
UPDATE notificacoes
SET coluna = 'Novo'
WHERE tenant_id = '7135c82e-6155-41e5-9c42-638a94222bbe'
  AND encerrado = false
  AND (coluna IS NULL OR coluna = '');

-- 3) Conferência: mostra a contagem por coluna das conversas ativas
SELECT coluna, COUNT(*) AS total
FROM notificacoes
WHERE tenant_id = '7135c82e-6155-41e5-9c42-638a94222bbe'
  AND encerrado = false
GROUP BY coluna
ORDER BY total DESC;
