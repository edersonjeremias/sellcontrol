-- Adiciona página de Compras ao sistema
-- Permite registro de compras de mercadorias para controle financeiro

-- Para cada tenant existente, adiciona a página de Compras
INSERT INTO pages (tenant_id, slug, label, icon, category, order_index)
SELECT
  t.id as tenant_id,
  'compras' as slug,
  'Compras' as label,
  '🛒' as icon,
  'Financeiro' as category,
  35 as order_index
FROM tenants t
WHERE NOT EXISTS (
  SELECT 1 FROM pages p
  WHERE p.tenant_id = t.id
  AND p.slug = 'compras'
);
