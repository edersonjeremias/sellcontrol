-- ============================================
-- Migration: Sistema de Cupons (IDEMPOTENTE)
-- ============================================

-- 1. Criar tabela cupons (se não existir)
CREATE TABLE IF NOT EXISTS cupons (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  codigo text NOT NULL,
  percentual numeric NOT NULL CHECK (percentual > 0 AND percentual <= 100),
  data_inicio date NOT NULL,
  data_fim date NOT NULL,
  ativo boolean DEFAULT true,
  created_at timestamp with time zone DEFAULT now(),

  CONSTRAINT cupons_datas_validas CHECK (data_fim >= data_inicio)
);

-- 2. Criar constraint unique (se não existir)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'cupons_tenant_codigo_unique'
  ) THEN
    ALTER TABLE cupons ADD CONSTRAINT cupons_tenant_codigo_unique UNIQUE (tenant_id, codigo);
  END IF;
END $$;

-- 3. Criar índices (IF NOT EXISTS já é suportado)
CREATE INDEX IF NOT EXISTS idx_cupons_tenant ON cupons(tenant_id);
CREATE INDEX IF NOT EXISTS idx_cupons_codigo ON cupons(codigo);
CREATE INDEX IF NOT EXISTS idx_cupons_ativo ON cupons(ativo);

-- 4. Habilitar RLS
ALTER TABLE cupons ENABLE ROW LEVEL SECURITY;

-- 5. Criar policies (dropar antes se existir)
DROP POLICY IF EXISTS "cupons_master_all" ON cupons;
CREATE POLICY "cupons_master_all" ON cupons FOR ALL TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM users_perfil
    WHERE users_perfil.id = auth.uid()
    AND users_perfil.role = 'master'
  )
);

DROP POLICY IF EXISTS "cupons_tenant_all" ON cupons;
CREATE POLICY "cupons_tenant_all" ON cupons FOR ALL TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM users_perfil
    WHERE users_perfil.id = auth.uid()
    AND users_perfil.tenant_id = cupons.tenant_id
    AND users_perfil.role IN ('admin', 'colaborador')
  )
);

DROP POLICY IF EXISTS "cupons_public_select" ON cupons;
CREATE POLICY "cupons_public_select" ON cupons FOR SELECT TO anon, authenticated
USING (ativo = true AND CURRENT_DATE BETWEEN data_inicio AND data_fim);

-- 6. Adicionar colunas na tabela cobrancas (IF NOT EXISTS)
ALTER TABLE cobrancas ADD COLUMN IF NOT EXISTS cupom_codigo text;
ALTER TABLE cobrancas ADD COLUMN IF NOT EXISTS cupom_desconto_percentual numeric;
ALTER TABLE cobrancas ADD COLUMN IF NOT EXISTS cupom_desconto_valor numeric;

-- Verificação final
DO $$
BEGIN
  RAISE NOTICE '✅ Migration de cupons aplicada com sucesso!';
  RAISE NOTICE '📊 Tabela cupons: %', (SELECT COUNT(*) FROM information_schema.tables WHERE table_name = 'cupons');
  RAISE NOTICE '📊 Colunas em cobrancas: %', (
    SELECT COUNT(*) FROM information_schema.columns
    WHERE table_name = 'cobrancas'
    AND column_name LIKE 'cupom_%'
  );
END $$;
