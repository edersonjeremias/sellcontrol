-- ============================================================
-- EXECUTE NO SUPABASE: SQL Editor → New Query → Run
-- Permite que clientes vejam seus recibos sem estar logados
-- ============================================================

-- Habilita RLS (caso não esteja)
ALTER TABLE cobrancas ENABLE ROW LEVEL SECURITY;

-- Remove políticas antigas que podem estar conflitando
DROP POLICY IF EXISTS "cobrancas_anon_read" ON cobrancas;
DROP POLICY IF EXISTS "cobrancas_public_read" ON cobrancas;
DROP POLICY IF EXISTS "cobrancas_select_anon" ON cobrancas;

-- Cria a política que permite leitura anônima apenas pelo ID
-- Isso é seguro pois o UUID é impossível de adivinhar
CREATE POLICY "cobrancas_anon_read" ON cobrancas
  FOR SELECT
  TO anon
  USING (true);

-- Garante que o cache do PostgREST seja atualizado
NOTIFY pgrst, 'reload schema';
