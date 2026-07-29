-- Adiciona página de Comissões ao sistema
-- Permite controle de acesso via Master/Admin

-- Para cada tenant existente, adiciona a página de Comissões
INSERT INTO pages (tenant_id, slug, label, icon, category, order_index)
SELECT
  t.id as tenant_id,
  'comissoes' as slug,
  'Comissões' as label,
  '💰' as icon,
  'Relatórios' as category,
  50 as order_index
FROM tenants t
WHERE NOT EXISTS (
  SELECT 1 FROM pages p
  WHERE p.tenant_id = t.id
  AND p.slug = 'comissoes'
);

COMMENT ON COLUMN pages.slug IS 'URL da página (ex: /comissoes)';
COMMENT ON COLUMN pages.label IS 'Nome exibido no menu';
COMMENT ON COLUMN pages.icon IS 'Emoji ou ícone';
COMMENT ON COLUMN pages.category IS 'Agrupamento no menu (ex: Relatórios)';
COMMENT ON COLUMN pages.order_index IS 'Ordem de exibição';
