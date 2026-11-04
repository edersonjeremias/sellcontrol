-- ════════════════════════════════════════════════════════════════════
-- "Empresas" vira uma página de verdade, para poder ser organizada
-- ════════════════════════════════════════════════════════════════════
--
-- Master → Empresas era injetada direto no AppShell e não existia na
-- tabela pages. Por isso não aparecia em Configurações → Menu e não
-- dava para escolher a categoria dela.
--
-- A rota /master/empresas continua protegida por RequireRole master,
-- então criar a linha aqui não abre acesso para mais ninguém.
--
-- Só é criada nos tenants que têm um usuário master, para não poluir a
-- lista de páginas das outras empresas.
-- ════════════════════════════════════════════════════════════════════

INSERT INTO pages (tenant_id, slug, label, category, icon, order_index)
SELECT DISTINCT
  up.tenant_id,
  'master/empresas',
  'Empresas',
  'Admin',
  'apartment',
  810
FROM users_perfil up
WHERE up.role = 'master'
  AND NOT EXISTS (
    SELECT 1 FROM pages p
    WHERE p.tenant_id = up.tenant_id
      AND p.slug = 'master/empresas'
  );

-- Conferência
SELECT category, order_index, slug, label
FROM pages
WHERE slug = 'master/empresas';
