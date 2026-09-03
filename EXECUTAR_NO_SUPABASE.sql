-- ============================================================
-- EXECUTE ESTE SQL NO PAINEL DO SUPABASE
-- SQL Editor → New Query → Cole este código → Run
-- ============================================================

-- 1. Cria tabela status_expedicao
CREATE TABLE IF NOT EXISTS status_expedicao (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  nome VARCHAR(50) NOT NULL,
  cor VARCHAR(7) NOT NULL,
  ordem INTEGER NOT NULL DEFAULT 0,
  ativo BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. Índices
CREATE INDEX IF NOT EXISTS idx_status_expedicao_tenant ON status_expedicao(tenant_id);
CREATE INDEX IF NOT EXISTS idx_status_expedicao_ordem ON status_expedicao(tenant_id, ordem);
CREATE INDEX IF NOT EXISTS idx_status_expedicao_ativo ON status_expedicao(tenant_id, ativo);

-- 3. Habilita RLS
ALTER TABLE status_expedicao ENABLE ROW LEVEL SECURITY;

-- 4. Políticas RLS (Remove se já existirem e recria)
DROP POLICY IF EXISTS status_expedicao_select_policy ON status_expedicao;
CREATE POLICY status_expedicao_select_policy ON status_expedicao
  FOR SELECT
  TO authenticated
  USING (tenant_id IN (
    SELECT tenant_id FROM users WHERE auth_user_id = auth.uid()
  ));

DROP POLICY IF EXISTS status_expedicao_insert_policy ON status_expedicao;
CREATE POLICY status_expedicao_insert_policy ON status_expedicao
  FOR INSERT
  TO authenticated
  WITH CHECK (
    tenant_id IN (
      SELECT tenant_id FROM users
      WHERE auth_user_id = auth.uid()
      AND role IN ('admin', 'master')
    )
  );

DROP POLICY IF EXISTS status_expedicao_update_policy ON status_expedicao;
CREATE POLICY status_expedicao_update_policy ON status_expedicao
  FOR UPDATE
  TO authenticated
  USING (
    tenant_id IN (
      SELECT tenant_id FROM users
      WHERE auth_user_id = auth.uid()
      AND role IN ('admin', 'master')
    )
  );

DROP POLICY IF EXISTS status_expedicao_delete_policy ON status_expedicao;
CREATE POLICY status_expedicao_delete_policy ON status_expedicao
  FOR DELETE
  TO authenticated
  USING (
    tenant_id IN (
      SELECT tenant_id FROM users
      WHERE auth_user_id = auth.uid()
      AND role IN ('admin', 'master')
    )
  );

-- 5. Popula status padrão para todos os tenants
INSERT INTO status_expedicao (tenant_id, nome, cor, ordem, ativo)
SELECT
  t.id as tenant_id,
  s.nome,
  s.cor,
  s.ordem,
  true as ativo
FROM tenants t
CROSS JOIN (
  VALUES
    ('Separado', '#81c995', 1),
    ('Enviado', '#8ab4f8', 2),
    ('Comprar', '#fbbc04', 3),
    ('Comprado', '#81c995', 4),
    ('Devolução', '#f28b82', 5),
    ('Gerar Crédito', '#c58af9', 6),
    ('Cancelado', '#9aa0a6', 7),
    ('Pendente', '#fbbc04', 8)
) AS s(nome, cor, ordem)
WHERE NOT EXISTS (
  SELECT 1 FROM status_expedicao
  WHERE status_expedicao.tenant_id = t.id
);

-- 6. Trigger para updated_at
CREATE OR REPLACE FUNCTION update_status_expedicao_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS status_expedicao_updated_at ON status_expedicao;
CREATE TRIGGER status_expedicao_updated_at
  BEFORE UPDATE ON status_expedicao
  FOR EACH ROW
  EXECUTE FUNCTION update_status_expedicao_updated_at();

-- 7. Comentários
COMMENT ON TABLE status_expedicao IS 'Status customizados para o módulo de expedição/pedidos';
COMMENT ON COLUMN status_expedicao.nome IS 'Nome do status (ex: Separado, Enviado, etc)';
COMMENT ON COLUMN status_expedicao.cor IS 'Cor em hexadecimal (#RRGGBB)';
COMMENT ON COLUMN status_expedicao.ordem IS 'Ordem de exibição (menor = primeiro)';
COMMENT ON COLUMN status_expedicao.ativo IS 'Se o status está ativo e pode ser usado';

-- ============================================================
-- PRONTO! Agora recarregue a página de Configurações
-- ============================================================
