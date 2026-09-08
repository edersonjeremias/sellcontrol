-- ============================================================================
-- DIAGNÓSTICO E CORREÇÃO: Força inserção da página Compras
-- ============================================================================

-- Primeiro, verifica se já existe
DO $$
DECLARE
  tenant_record RECORD;
  page_exists BOOLEAN;
BEGIN
  -- Para cada tenant
  FOR tenant_record IN SELECT id, nome FROM tenants
  LOOP
    -- Verifica se já tem a página
    SELECT EXISTS (
      SELECT 1 FROM pages
      WHERE tenant_id = tenant_record.id
      AND slug = 'compras'
    ) INTO page_exists;

    IF NOT page_exists THEN
      -- Insere a página
      INSERT INTO pages (tenant_id, slug, label, icon, category, order_index)
      VALUES (
        tenant_record.id,
        'compras',
        'Compras',
        '🛒',
        'Financeiro',
        35
      );

      RAISE NOTICE 'Página Compras adicionada para tenant: % (id: %)', tenant_record.nome, tenant_record.id;
    ELSE
      RAISE NOTICE 'Página Compras já existe para tenant: % (id: %)', tenant_record.nome, tenant_record.id;
    END IF;
  END LOOP;
END $$;

-- Mostra todas as páginas Compras criadas
SELECT
  t.nome as empresa,
  p.label,
  p.slug,
  p.category,
  p.icon
FROM pages p
JOIN tenants t ON t.id = p.tenant_id
WHERE p.slug = 'compras'
ORDER BY t.nome;
