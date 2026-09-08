-- ============================================================================
-- TABELA: fornecedores
-- Armazena os fornecedores das compras
-- ============================================================================
CREATE TABLE IF NOT EXISTS fornecedores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  nome TEXT NOT NULL,
  endereco TEXT,
  whatsapp TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Índices
CREATE INDEX IF NOT EXISTS idx_fornecedores_tenant ON fornecedores(tenant_id);
CREATE INDEX IF NOT EXISTS idx_fornecedores_nome ON fornecedores(tenant_id, nome);

-- RLS
ALTER TABLE fornecedores ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS fornecedores_tenant_isolation ON fornecedores;
CREATE POLICY fornecedores_tenant_isolation ON fornecedores
  USING (tenant_id = current_setting('app.current_tenant')::uuid);

-- ============================================================================
-- TABELA: compras
-- Armazena os itens de compra
-- ============================================================================
CREATE TABLE IF NOT EXISTS compras (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  data DATE NOT NULL DEFAULT CURRENT_DATE,
  descricao TEXT NOT NULL,
  quantidade NUMERIC(10,2) NOT NULL DEFAULT 1,
  preco_unitario NUMERIC(10,2) NOT NULL DEFAULT 0,
  total NUMERIC(10,2) GENERATED ALWAYS AS (quantidade * preco_unitario) STORED,
  fornecedor_id UUID REFERENCES fornecedores(id) ON DELETE SET NULL,
  usuario_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Índices
CREATE INDEX IF NOT EXISTS idx_compras_tenant ON compras(tenant_id);
CREATE INDEX IF NOT EXISTS idx_compras_data ON compras(tenant_id, data DESC);
CREATE INDEX IF NOT EXISTS idx_compras_fornecedor ON compras(fornecedor_id);
CREATE INDEX IF NOT EXISTS idx_compras_usuario ON compras(usuario_id);

-- RLS
ALTER TABLE compras ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS compras_tenant_isolation ON compras;
CREATE POLICY compras_tenant_isolation ON compras
  USING (tenant_id = current_setting('app.current_tenant')::uuid);

-- ============================================================================
-- FUNÇÃO: Retorna total de compras do dia para o usuário logado
-- ============================================================================
CREATE OR REPLACE FUNCTION get_total_compras_dia()
RETURNS NUMERIC AS $$
DECLARE
  total_dia NUMERIC;
  current_tenant UUID;
  current_user_id UUID;
BEGIN
  -- Pega tenant e usuário atual
  BEGIN
    current_tenant := current_setting('app.current_tenant')::uuid;
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

-- Trigger para atualizar updated_at
CREATE OR REPLACE FUNCTION update_compras_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS compras_updated_at ON compras;
CREATE TRIGGER compras_updated_at
  BEFORE UPDATE ON compras
  FOR EACH ROW
  EXECUTE FUNCTION update_compras_updated_at();

DROP TRIGGER IF EXISTS fornecedores_updated_at ON fornecedores;
CREATE TRIGGER fornecedores_updated_at
  BEFORE UPDATE ON fornecedores
  FOR EACH ROW
  EXECUTE FUNCTION update_compras_updated_at();
