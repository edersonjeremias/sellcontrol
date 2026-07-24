-- Tabela de cupons de desconto
CREATE TABLE IF NOT EXISTS cupons (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  codigo text NOT NULL,
  percentual numeric NOT NULL CHECK (percentual > 0 AND percentual <= 100),
  data_inicio date NOT NULL,
  data_fim date NOT NULL,
  ativo boolean DEFAULT true,
  created_at timestamp with time zone DEFAULT now(),

  CONSTRAINT cupons_tenant_codigo_unique UNIQUE (tenant_id, codigo),
  CONSTRAINT cupons_datas_validas CHECK (data_fim >= data_inicio)
);

-- Índices para performance
CREATE INDEX IF NOT EXISTS idx_cupons_tenant ON cupons(tenant_id);
CREATE INDEX IF NOT EXISTS idx_cupons_codigo ON cupons(codigo);
CREATE INDEX IF NOT EXISTS idx_cupons_ativo ON cupons(ativo);

-- RLS Policies
ALTER TABLE cupons ENABLE ROW LEVEL SECURITY;

-- Master pode tudo
CREATE POLICY "cupons_master_all" ON cupons FOR ALL TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM users_perfil
    WHERE users_perfil.id = auth.uid()
    AND users_perfil.role = 'master'
  )
);

-- Admin/Colaborador do tenant pode gerenciar seus cupons
CREATE POLICY "cupons_tenant_all" ON cupons FOR ALL TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM users_perfil
    WHERE users_perfil.id = auth.uid()
    AND users_perfil.tenant_id = cupons.tenant_id
    AND users_perfil.role IN ('admin', 'colaborador')
  )
);

-- Cliente pode visualizar cupons ativos (para validação)
CREATE POLICY "cupons_public_select" ON cupons FOR SELECT TO anon, authenticated
USING (ativo = true AND CURRENT_DATE BETWEEN data_inicio AND data_fim);

-- Adicionar colunas na tabela cobrancas para rastrear cupom usado
ALTER TABLE cobrancas ADD COLUMN IF NOT EXISTS cupom_codigo text;
ALTER TABLE cobrancas ADD COLUMN IF NOT EXISTS cupom_desconto_percentual numeric;
ALTER TABLE cobrancas ADD COLUMN IF NOT EXISTS cupom_desconto_valor numeric;
