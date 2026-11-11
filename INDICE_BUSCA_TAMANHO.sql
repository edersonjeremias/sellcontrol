-- ═══════════════════════════════════════════════════════════════
-- ÍNDICE DE BUSCA PARA A COLUNA TAMANHO
-- Cole TUDO de uma vez no Supabase SQL Editor e clique em RUN
-- ═══════════════════════════════════════════════════════════════
--
-- A busca de produtos passou a procurar também na coluna "tamanho".
-- Os outros campos pesquisáveis (produto, modelo, cor, marca, codigo)
-- já ganharam índice trigram em OTIMIZAR_BUSCA_PRODUTOS.sql; este
-- fecha o conjunto para que "tamanho" não vire o campo lento da busca.
-- ═══════════════════════════════════════════════════════════════

CREATE INDEX IF NOT EXISTS idx_produtos_tamanho_trgm
  ON produtos USING GIN (tamanho gin_trgm_ops);

ANALYZE produtos;
