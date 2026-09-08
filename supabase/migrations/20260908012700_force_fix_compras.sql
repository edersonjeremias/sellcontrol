-- ============================================================================
-- LIMPEZA FORÇADA: Remove TODAS as políticas antigas e recria corretamente
-- ============================================================================

-- Primeiro: desabilita RLS para limpar tudo
ALTER TABLE IF EXISTS fornecedores DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS compras DISABLE ROW LEVEL SECURITY;

-- Remove TODAS as políticas existentes (qualquer nome)
DO $$
DECLARE
  r RECORD;
BEGIN
  -- Drop todas as políticas de fornecedores
  FOR r IN (SELECT policyname FROM pg_policies WHERE tablename = 'fornecedores')
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON fornecedores', r.policyname);
  END LOOP;

  -- Drop todas as políticas de compras
  FOR r IN (SELECT policyname FROM pg_policies WHERE tablename = 'compras')
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON compras', r.policyname);
  END LOOP;
END $$;

-- Agora recria tudo do zero com get_tenant_id()

-- ============================================================================
-- FORNECEDORES - RLS
-- ============================================================================
ALTER TABLE fornecedores ENABLE ROW LEVEL SECURITY;

CREATE POLICY fornecedores_select ON fornecedores
  FOR SELECT USING (tenant_id = get_tenant_id());

CREATE POLICY fornecedores_insert ON fornecedores
  FOR INSERT WITH CHECK (tenant_id = get_tenant_id());

CREATE POLICY fornecedores_update ON fornecedores
  FOR UPDATE USING (tenant_id = get_tenant_id());

CREATE POLICY fornecedores_delete ON fornecedores
  FOR DELETE USING (tenant_id = get_tenant_id());

-- ============================================================================
-- COMPRAS - RLS
-- ============================================================================
ALTER TABLE compras ENABLE ROW LEVEL SECURITY;

CREATE POLICY compras_select ON compras
  FOR SELECT USING (tenant_id = get_tenant_id());

CREATE POLICY compras_insert ON compras
  FOR INSERT WITH CHECK (tenant_id = get_tenant_id());

CREATE POLICY compras_update ON compras
  FOR UPDATE USING (tenant_id = get_tenant_id());

CREATE POLICY compras_delete ON compras
  FOR DELETE USING (tenant_id = get_tenant_id());

-- ============================================================================
-- FUNÇÃO get_total_compras_dia
-- ============================================================================
CREATE OR REPLACE FUNCTION get_total_compras_dia()
RETURNS NUMERIC AS $$
DECLARE
  total_dia NUMERIC;
  current_tenant UUID;
  current_user_id UUID;
BEGIN
  current_tenant := get_tenant_id();
  current_user_id := auth.uid();

  SELECT COALESCE(SUM(total), 0)
  INTO total_dia
  FROM compras
  WHERE tenant_id = current_tenant
    AND data = CURRENT_DATE
    AND usuario_id = current_user_id;

  RETURN total_dia;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
