-- ============================================================
-- EXECUTE NO SUPABASE: SQL Editor → New Query → Run
-- Corrige RLS de TODAS as tabelas usadas pelo app
-- ============================================================

-- ── VENDAS ───────────────────────────────────────────────────
ALTER TABLE vendas ADD COLUMN IF NOT EXISTS fila1       TEXT    NOT NULL DEFAULT '';
ALTER TABLE vendas ADD COLUMN IF NOT EXISTS fila2       TEXT    NOT NULL DEFAULT '';
ALTER TABLE vendas ADD COLUMN IF NOT EXISTS fila3       TEXT    NOT NULL DEFAULT '';
ALTER TABLE vendas ADD COLUMN IF NOT EXISTS tipo_envio  TEXT    NOT NULL DEFAULT '';
ALTER TABLE vendas ADD COLUMN IF NOT EXISTS sacolinha   INTEGER;
ALTER TABLE vendas ADD COLUMN IF NOT EXISTS status      TEXT    NOT NULL DEFAULT '';
ALTER TABLE vendas ADD COLUMN IF NOT EXISTS live_nome   TEXT    NOT NULL DEFAULT '';
ALTER TABLE vendas ADD COLUMN IF NOT EXISTS data_live   DATE;

ALTER TABLE vendas ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "vendas_select"         ON vendas;
DROP POLICY IF EXISTS "vendas_insert"         ON vendas;
DROP POLICY IF EXISTS "vendas_update"         ON vendas;
DROP POLICY IF EXISTS "vendas_delete"         ON vendas;
DROP POLICY IF EXISTS "vendas_authenticated"  ON vendas;
DROP POLICY IF EXISTS "vendas_rw"             ON vendas;
CREATE POLICY "vendas_rw" ON vendas FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ── CLIENTES ─────────────────────────────────────────────────
ALTER TABLE clientes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "clientes_select"         ON clientes;
DROP POLICY IF EXISTS "clientes_insert"         ON clientes;
DROP POLICY IF EXISTS "clientes_update"         ON clientes;
DROP POLICY IF EXISTS "clientes_delete"         ON clientes;
DROP POLICY IF EXISTS "clientes_authenticated"  ON clientes;
DROP POLICY IF EXISTS "clientes_rw"             ON clientes;
CREATE POLICY "clientes_rw" ON clientes FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ── LIVES ────────────────────────────────────────────────────
ALTER TABLE lives ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "lives_select"         ON lives;
DROP POLICY IF EXISTS "lives_insert"         ON lives;
DROP POLICY IF EXISTS "lives_update"         ON lives;
DROP POLICY IF EXISTS "lives_delete"         ON lives;
DROP POLICY IF EXISTS "lives_rw"             ON lives;
CREATE POLICY "lives_rw" ON lives FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ── LISTAS ───────────────────────────────────────────────────
ALTER TABLE listas_produtos ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "listas_produtos_rw" ON listas_produtos;
CREATE POLICY "listas_produtos_rw" ON listas_produtos FOR ALL TO authenticated USING (true) WITH CHECK (true);

ALTER TABLE listas_modelos ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "listas_modelos_rw" ON listas_modelos;
CREATE POLICY "listas_modelos_rw" ON listas_modelos FOR ALL TO authenticated USING (true) WITH CHECK (true);

ALTER TABLE listas_cores ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "listas_cores_rw" ON listas_cores;
CREATE POLICY "listas_cores_rw" ON listas_cores FOR ALL TO authenticated USING (true) WITH CHECK (true);

ALTER TABLE listas_marcas ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "listas_marcas_rw" ON listas_marcas;
CREATE POLICY "listas_marcas_rw" ON listas_marcas FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ── RECARREGA CACHE ──────────────────────────────────────────
NOTIFY pgrst, 'reload schema';
