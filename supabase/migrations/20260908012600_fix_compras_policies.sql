-- ============================================================================
-- CORREÇÃO: Atualiza políticas RLS para usar get_tenant_id()
-- ============================================================================

-- Fornecedores
DROP POLICY IF EXISTS fornecedores_select ON fornecedores;
CREATE POLICY fornecedores_select ON fornecedores
  FOR SELECT USING (tenant_id = get_tenant_id());

DROP POLICY IF EXISTS fornecedores_insert ON fornecedores;
CREATE POLICY fornecedores_insert ON fornecedores
  FOR INSERT WITH CHECK (tenant_id = get_tenant_id());

DROP POLICY IF EXISTS fornecedores_update ON fornecedores;
CREATE POLICY fornecedores_update ON fornecedores
  FOR UPDATE USING (tenant_id = get_tenant_id());

DROP POLICY IF EXISTS fornecedores_delete ON fornecedores;
CREATE POLICY fornecedores_delete ON fornecedores
  FOR DELETE USING (tenant_id = get_tenant_id());

-- Compras
DROP POLICY IF EXISTS compras_select ON compras;
CREATE POLICY compras_select ON compras
  FOR SELECT USING (tenant_id = get_tenant_id());

DROP POLICY IF EXISTS compras_insert ON compras;
CREATE POLICY compras_insert ON compras
  FOR INSERT WITH CHECK (tenant_id = get_tenant_id());

DROP POLICY IF EXISTS compras_update ON compras;
CREATE POLICY compras_update ON compras
  FOR UPDATE USING (tenant_id = get_tenant_id());

DROP POLICY IF EXISTS compras_delete ON compras;
CREATE POLICY compras_delete ON compras
  FOR DELETE USING (tenant_id = get_tenant_id());

-- Função get_total_compras_dia
CREATE OR REPLACE FUNCTION get_total_compras_dia()
RETURNS NUMERIC AS $$
DECLARE
  total_dia NUMERIC;
  current_tenant UUID;
  current_user_id UUID;
BEGIN
  -- Pega tenant e usuário atual
  BEGIN
    current_tenant := get_tenant_id();
  EXCEPTION WHEN OTHERS THEN
    current_tenant := NULL;
  END;

  current_user_id := auth.uid();

  -- Calcula total do dia
  SELECT COALESCE(SUM(total), 0)
  INTO total_dia
  FROM compras
  WHERE tenant_id = current_tenant
    AND data = CURRENT_DATE
    AND usuario_id = current_user_id;

  RETURN total_dia;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
