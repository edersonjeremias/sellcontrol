-- ============================================================
-- EXECUTE NO SUPABASE: SQL Editor → New Query → Run
-- Correção definitiva de colunas + RLS da tabela vendas
-- ============================================================

-- 1) Garante que todas as colunas usadas pelo app existam
ALTER TABLE vendas
  ADD COLUMN IF NOT EXISTS fila1       TEXT    NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS fila2       TEXT    NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS fila3       TEXT    NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS tipo_envio  TEXT    NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS sacolinha   INTEGER,
  ADD COLUMN IF NOT EXISTS status      TEXT    NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS live_nome   TEXT    NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS data_live   DATE;

-- 2) Habilita RLS (caso não esteja)
ALTER TABLE vendas ENABLE ROW LEVEL SECURITY;

-- 3) Remove TODAS as políticas antigas (inclusive a versão com subquery)
DROP POLICY IF EXISTS "vendas_select"        ON vendas;
DROP POLICY IF EXISTS "vendas_insert"        ON vendas;
DROP POLICY IF EXISTS "vendas_update"        ON vendas;
DROP POLICY IF EXISTS "vendas_delete"        ON vendas;
DROP POLICY IF EXISTS "vendas_authenticated" ON vendas;

-- 4) Cria UMA política simples: qualquer usuário autenticado pode tudo
--    (sem subquery em users_perfil — evita travamento)
CREATE POLICY "vendas_authenticated"
  ON vendas
  FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- 5) Recarrega cache do PostgREST
NOTIFY pgrst, 'reload schema';
