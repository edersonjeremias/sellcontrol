-- ═══════════════════════════════════════════════════════════════
-- OTIMIZAR BUSCA DE PRODUTOS
-- Cole TUDO de uma vez no Supabase SQL Editor e clique em RUN
-- ═══════════════════════════════════════════════════════════════

-- 1. Habilita a extensão de busca por trigramas
--    Sem ela, "ILIKE %texto%" varre a tabela inteira a cada busca
CREATE EXTENSION IF NOT EXISTS pg_trgm;


-- 2. Índices trigram nos campos usados na busca
--    Estes são os índices que fazem o ILIKE ficar rápido
CREATE INDEX IF NOT EXISTS idx_produtos_produto_trgm
  ON produtos USING GIN (produto gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_produtos_modelo_trgm
  ON produtos USING GIN (modelo gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_produtos_cor_trgm
  ON produtos USING GIN (cor gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_produtos_marca_trgm
  ON produtos USING GIN (marca gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_produtos_codigo_trgm
  ON produtos USING GIN (codigo gin_trgm_ops);


-- 3. Índice para o filtro base (tenant + ativo) e a ordenação por data
CREATE INDEX IF NOT EXISTS idx_produtos_tenant_ativo_data
  ON produtos (tenant_id, ativo, created_at DESC);


-- 4. Remove o índice de imagens
--    Ele foi criado junto com a coluna "imagens", mas nenhuma consulta
--    do sistema busca produtos pelo conteúdo das imagens. Ele só deixa
--    o salvamento de produtos mais lento.
--    Se algum dia precisar, basta recriar com:
--      CREATE INDEX idx_produtos_imagens ON produtos USING GIN (imagens);
DROP INDEX IF EXISTS idx_produtos_imagens;


-- 5. Atualiza as estatísticas para o Postgres usar os novos índices
ANALYZE produtos;


-- ═══════════════════════════════════════════════════════════════
-- CONFERIR O RESULTADO (opcional)
-- Rode separado depois. Deve aparecer "Bitmap Index Scan",
-- e NÃO "Seq Scan"
-- ═══════════════════════════════════════════════════════════════
-- EXPLAIN ANALYZE
-- SELECT * FROM produtos
-- WHERE tenant_id = (SELECT tenant_id FROM produtos LIMIT 1)
--   AND ativo = true
--   AND (produto ILIKE '%camis%' OR modelo ILIKE '%camis%');
