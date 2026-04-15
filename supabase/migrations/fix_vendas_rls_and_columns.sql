-- ============================================================
-- EXECUTE NO SUPABASE: SQL Editor → New Query → Run
-- Corrige colunas faltantes e políticas RLS da tabela vendas
-- ============================================================

-- 1) Garante que as colunas usadas pelo app existam
ALTER TABLE vendas
  ADD COLUMN IF NOT EXISTS fila1       TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS fila2       TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS fila3       TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS tipo_envio  TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS sacolinha   INTEGER,
  ADD COLUMN IF NOT EXISTS status      TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS live_nome   TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS data_live   DATE;

-- 2) Habilita RLS (caso não esteja)
ALTER TABLE vendas ENABLE ROW LEVEL SECURITY;

-- 3) Remove políticas antigas para recriar corretamente
DROP POLICY IF EXISTS "vendas_select" ON vendas;
DROP POLICY IF EXISTS "vendas_insert" ON vendas;
DROP POLICY IF EXISTS "vendas_update" ON vendas;
DROP POLICY IF EXISTS "vendas_delete" ON vendas;

-- 4) SELECT: usuário autenticado vê somente registros do seu tenant
CREATE POLICY "vendas_select" ON vendas
  FOR SELECT TO authenticated
  USING (tenant_id = (
    SELECT tenant_id FROM users_perfil WHERE id = auth.uid() LIMIT 1
  ));

-- 5) INSERT: usuário autenticado insere somente no seu tenant
CREATE POLICY "vendas_insert" ON vendas
  FOR INSERT TO authenticated
  WITH CHECK (tenant_id = (
    SELECT tenant_id FROM users_perfil WHERE id = auth.uid() LIMIT 1
  ));

-- 6) UPDATE: usuário autenticado atualiza somente registros do seu tenant
CREATE POLICY "vendas_update" ON vendas
  FOR UPDATE TO authenticated
  USING (tenant_id = (
    SELECT tenant_id FROM users_perfil WHERE id = auth.uid() LIMIT 1
  ));

-- 7) DELETE: usuário autenticado exclui somente registros do seu tenant
CREATE POLICY "vendas_delete" ON vendas
  FOR DELETE TO authenticated
  USING (tenant_id = (
    SELECT tenant_id FROM users_perfil WHERE id = auth.uid() LIMIT 1
  ));

-- 8) Recarrega o cache do PostgREST (necessário após alterações de schema)
NOTIFY pgrst, 'reload schema';
