-- ═══════════════════════════════════════════════════════════════
-- AJUSTE DE ESTOQUE ATÔMICO
-- Cole TUDO de uma vez no Supabase SQL Editor e clique em RUN
-- ═══════════════════════════════════════════════════════════════
--
-- POR QUE ISSO EXISTE
--
-- Antes, vender um produto fazia duas viagens ao banco:
--   1. ler a quantidade atual
--   2. gravar a quantidade menos 1
--
-- Quando duas vendas acontecem quase juntas, as duas leem o mesmo
-- valor e gravam o mesmo resultado -- uma das baixas se perde:
--
--   Venda A le 5          Venda B le 5
--   Venda A grava 4       Venda B grava 4    <- sumiu uma baixa
--
-- Esta funcao faz a conta dentro do proprio UPDATE, numa operacao
-- so. O Postgres serializa os acessos a mesma linha, entao duas
-- vendas simultaneas resultam em 3, nunca em 4.
--
-- Aceita valores negativos de proposito: estoque -2 significa que
-- o item saiu 2 vezes alem do que havia disponivel.
-- ═══════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION ajustar_estoque(p_id UUID, p_delta INT)
RETURNS INT
LANGUAGE sql
SECURITY INVOKER          -- respeita o RLS: so mexe no estoque do proprio tenant
SET search_path = public
AS $$
  UPDATE produtos
  SET quantidade = COALESCE(quantidade, 0) + p_delta
  WHERE id = p_id
  RETURNING quantidade;
$$;

GRANT EXECUTE ON FUNCTION ajustar_estoque(UUID, INT) TO authenticated;


-- ═══════════════════════════════════════════════════════════════
-- CONFERIR (opcional)
-- Rode separado depois, trocando o codigo 1001 por um produto seu.
-- Deve baixar 1 e devolver 1, voltando ao valor original.
-- ═══════════════════════════════════════════════════════════════
-- SELECT quantidade AS antes FROM produtos WHERE codigo = '1001';
-- SELECT ajustar_estoque((SELECT id FROM produtos WHERE codigo = '1001' LIMIT 1), -1) AS depois_da_baixa;
-- SELECT ajustar_estoque((SELECT id FROM produtos WHERE codigo = '1001' LIMIT 1),  1) AS depois_do_estorno;
