-- ================================================================
-- ADICIONA PÁGINA DE PRODUTOS NO MENU
-- ================================================================

-- Insere a página "Produtos" na tabela pages_access
-- Apenas para roles 'master' e 'admin'
INSERT INTO pages_access (slug, label, roles)
VALUES ('produtos', 'Produtos', ARRAY['master', 'admin'])
ON CONFLICT (slug) DO UPDATE
  SET label = EXCLUDED.label,
      roles = EXCLUDED.roles;

-- Comentário
COMMENT ON TABLE pages_access IS 'Define quais páginas cada role pode acessar';
