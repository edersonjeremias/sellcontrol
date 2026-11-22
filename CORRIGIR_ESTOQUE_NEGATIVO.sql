-- ============================================================================
-- CONSERTO DAS QUANTIDADES DEPOIS DA BAIXA REPETIDA
-- ============================================================================
-- Rode PRIMEIRO a migration 20261122_fix_estoque_upsert.sql. Sem ela, qualquer
-- conserto volta a ser desfeito no próximo salvamento da tela de Vendas.
--
-- O que dá e o que não dá para recuperar:
--   - as baixas LEGÍTIMAS (a linha da live que ganhou cliente) ficaram
--     marcadas em vendas.estoque_produto_id — essas sabemos quais são;
--   - as baixas INDEVIDAS (uma por salvamento automático) não deixaram marca
--     em lugar nenhum. O banco não guarda o valor anterior da quantidade.
--
-- Por isso o conserto parte de uma premissa que só você confirma: quanto cada
-- peça tinha em estoque antes. Em brechó a peça é única, então o BLOCO 2 parte
-- de 1. Se algum produto seu tinha mais de uma unidade, ajuste depois na tela
-- de Produtos.
-- ============================================================================


-- ────────────────────────────────────────────────────────────────────────────
-- BLOCO 1 — DIAGNÓSTICO: o que foi afetado (rode e olhe antes de corrigir)
-- ────────────────────────────────────────────────────────────────────────────
SELECT
  p.codigo,
  p.produto,
  p.modelo,
  p.cor,
  p.quantidade                                   AS quantidade_agora,
  (SELECT count(*) FROM vendas v
    WHERE v.estoque_produto_id = p.id)           AS vendas_de_verdade,
  GREATEST(0, 1 - (SELECT count(*) FROM vendas v
    WHERE v.estoque_produto_id = p.id))          AS ficaria_assim,
  p.publicado_loja,
  p.updated_at
FROM produtos p
WHERE p.tenant_id = '7135c82e-6155-41e5-9c42-638a94222bbe'
  AND (p.quantidade < 0 OR p.updated_at >= '2026-11-21')
ORDER BY p.quantidade;


-- ────────────────────────────────────────────────────────────────────────────
-- BLOCO 2 — CONSERTO: devolve ao estoque quem ficou negativo
-- ────────────────────────────────────────────────────────────────────────────
-- Parte de uma unidade por peça e desconta as vendas que de fato existem.
-- Mexe SÓ em quem está com quantidade negativa, que é o estrago visível.
-- Confira o BLOCO 1 antes: a coluna ficaria_assim mostra o resultado.
UPDATE produtos p
   SET quantidade = GREATEST(0, 1 - (
         SELECT count(*) FROM vendas v WHERE v.estoque_produto_id = p.id
       ))
 WHERE p.tenant_id = '7135c82e-6155-41e5-9c42-638a94222bbe'
   AND p.quantidade < 0;


-- ────────────────────────────────────────────────────────────────────────────
-- BLOCO 3 — CONFERÊNCIA: o que está no ar na loja depois do conserto
-- ────────────────────────────────────────────────────────────────────────────
SELECT codigo, produto, modelo, cor, quantidade, publicado_loja, ativo
  FROM produtos
 WHERE tenant_id = '7135c82e-6155-41e5-9c42-638a94222bbe'
   AND publicado_loja
 ORDER BY codigo;
