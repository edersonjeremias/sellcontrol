-- ══════════════════════════════════════════════════════════════════
-- Adicionar políticas RLS para tabela 'pages'
-- Permitir que usuários master gerenciem páginas das empresas
-- ══════════════════════════════════════════════════════════════════

-- Garantir que RLS está habilitado
ALTER TABLE pages ENABLE ROW LEVEL SECURITY;

-- Drop políticas existentes (se houver)
DROP POLICY IF EXISTS "pages_select_policy" ON pages;
DROP POLICY IF EXISTS "pages_insert_policy" ON pages;
DROP POLICY IF EXISTS "pages_update_policy" ON pages;
DROP POLICY IF EXISTS "pages_delete_policy" ON pages;

-- SELECT: Todos os usuários autenticados podem ver páginas
CREATE POLICY "pages_select_policy" ON pages
  FOR SELECT
  TO authenticated
  USING (true);

-- INSERT: Apenas usuários master podem inserir páginas
CREATE POLICY "pages_insert_policy" ON pages
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM users_perfil
      WHERE users_perfil.id = auth.uid()
      AND users_perfil.role = 'master'
    )
  );

-- UPDATE: Apenas usuários master podem atualizar páginas
CREATE POLICY "pages_update_policy" ON pages
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM users_perfil
      WHERE users_perfil.id = auth.uid()
      AND users_perfil.role = 'master'
    )
  );

-- DELETE: Apenas usuários master podem deletar páginas
CREATE POLICY "pages_delete_policy" ON pages
  FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM users_perfil
      WHERE users_perfil.id = auth.uid()
      AND users_perfil.role = 'master'
    )
  );
