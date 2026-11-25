-- ============================================================================
-- DESCRIÇÃO DA PEÇA NA VENDA
-- ============================================================================
-- Mesmo campo livre que produtos.descricao, agora na linha da venda: ao
-- importar do catálogo a descrição vem junto, e durante a live dá para
-- ajustar o texto daquela peça sem alterar o cadastro do produto.
--
-- Coluna opcional na tela de Vendas (engrenagem), como custo e gênero.
-- Idempotente.
-- ============================================================================

ALTER TABLE vendas
  ADD COLUMN IF NOT EXISTS descricao text;

COMMENT ON COLUMN vendas.descricao IS
  'Descricao livre da peca nesta venda. Vem do produto na importacao e pode ser ajustada na live.';
