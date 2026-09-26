-- ================================================================
-- ADICIONA PÁGINA DE PRODUTOS NO MENU
-- ================================================================

-- Adiciona a página "Produtos" para TODOS os tenants
INSERT INTO pages (tenant_id, slug, label, category, icon, order_index)
SELECT
  id as tenant_id,
  'produtos' as slug,
  'Produtos' as label,
  'Cadastro' as category,
  '📦' as icon,
  50 as order_index
FROM tenants
WHERE NOT EXISTS (
  SELECT 1 FROM pages
  WHERE pages.tenant_id = tenants.id
  AND pages.slug = 'produtos'
);

-- Comentário
COMMENT ON TABLE pages IS 'Páginas disponíveis no sistema (por tenant)';
