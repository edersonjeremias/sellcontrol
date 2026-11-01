-- ================================================================
-- VINCULO ENTRE O FUNCIONARIO DO RH E A VENDEDORA DAS LIVES
-- O relatorio de comissoes agrupa por vendas.live_nome, que quase
-- nunca e igual ao nome do cadastro. Esta coluna faz a ponte para o
-- botao "Lancar no RH" ja vir com o funcionario certo escolhido.
-- Rodar inteiro no SQL Editor do Supabase.
-- ================================================================

ALTER TABLE funcionarios
  ADD COLUMN IF NOT EXISTS nome_live TEXT;

COMMENT ON COLUMN funcionarios.nome_live IS
  'Nome desta pessoa em vendas.live_nome, usado para lancar a comissao no RH';
