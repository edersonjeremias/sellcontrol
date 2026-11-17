-- ============================================================================
-- FILA DE ESPERA — relatório do que faltou peça
-- ============================================================================
-- Data: 17/11/2026
--
-- Nenhuma tabela nova: a fila já está em vendas.fila1 / fila2 / fila3, gravada
-- na live quando duas clientes pedem a mesma peça e só uma leva. A migration
-- só cria a página no menu e libera para quem já vê o Relatório — o relatório
-- novo lê exatamente os mesmos dados de vendas.
--
-- Rodar inteiro no SQL Editor do Supabase, de uma vez.
-- ============================================================================

-- ────────────────────────────────────────────────────────────────────────────
-- 1. PÁGINA NO MENU
-- ────────────────────────────────────────────────────────────────────────────
-- order_index 31: cai logo depois de Relatório (30) na categoria Financeiro.
-- O master já enxerga a página assim que ela existe.
INSERT INTO pages (tenant_id, slug, label, icon, category, order_index)
SELECT t.id, 'fila-espera', 'Fila de Espera', '⏳', 'Financeiro', 31
  FROM tenants t
 WHERE NOT EXISTS (
   SELECT 1 FROM pages p
    WHERE p.tenant_id = t.id AND p.slug = 'fila-espera'
 );

-- ────────────────────────────────────────────────────────────────────────────
-- 2. ACESSO: quem já vê Relatório passa a ver a Fila de Espera
-- ────────────────────────────────────────────────────────────────────────────
-- Admin, gerente, vendedor e financeiro só veem o que está em pages_access.
-- Copiar a permissão do Relatório evita liberar o relatório novo para quem não
-- deveria ver preço e cliente.
INSERT INTO pages_access (tenant_id, user_id, page_id)
SELECT a.tenant_id, a.user_id, nova.id
  FROM pages_access a
  JOIN pages relat ON relat.id = a.page_id AND relat.slug = 'relatorio'
  JOIN pages nova  ON nova.tenant_id = a.tenant_id AND nova.slug = 'fila-espera'
 ON CONFLICT (user_id, page_id) DO NOTHING;

-- ────────────────────────────────────────────────────────────────────────────
-- 3. ÍNDICE DE LEITURA
-- ────────────────────────────────────────────────────────────────────────────
-- O relatório varre o período por data_live dentro do tenant. Sem o índice o
-- Postgres lê a tabela de vendas inteira a cada filtro.
-- Um índice só, sem recorte por fila: o relatório carrega todas as vendas do
-- período porque precisa contar quantas unidades de cada peça saíram — é essa
-- a régua ao lado da fila. Um índice parcial em fila1/fila2/fila3 nunca seria
-- usado por essa consulta.
CREATE INDEX IF NOT EXISTS idx_vendas_tenant_data_live
  ON vendas (tenant_id, data_live DESC);

-- ============================================================================
-- CONFERIR (opcional) — quantas peças faltaram nos últimos 60 dias
-- ============================================================================
-- SELECT produto, modelo, cor, tamanho,
--        COUNT(*) FILTER (WHERE fila1 <> '') +
--        COUNT(*) FILTER (WHERE fila2 <> '') +
--        COUNT(*) FILTER (WHERE fila3 <> '') AS na_fila
--   FROM vendas
--  WHERE etapa = 'fechada'
--    AND data_live >= CURRENT_DATE - 60
--    AND (fila1 <> '' OR fila2 <> '' OR fila3 <> '')
--  GROUP BY 1, 2, 3, 4
--  ORDER BY na_fila DESC
--  LIMIT 30;

-- ============================================================================
-- FIM DA MIGRATION
-- ============================================================================
