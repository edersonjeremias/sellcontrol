-- Cria tabela para gerenciar status customizados da expedição
CREATE TABLE IF NOT EXISTS status_expedicao (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  nome VARCHAR(50) NOT NULL,
  cor VARCHAR(7) NOT NULL, -- hex color (#RRGGBB)
  ordem INTEGER NOT NULL DEFAULT 0,
  ativo BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Índices para performance
CREATE INDEX idx_status_expedicao_tenant ON status_expedicao(tenant_id);
CREATE INDEX idx_status_expedicao_ordem ON status_expedicao(tenant_id, ordem);
CREATE INDEX idx_status_expedicao_ativo ON status_expedicao(tenant_id, ativo);

-- RLS (Row Level Security)
ALTER TABLE status_expedicao ENABLE ROW LEVEL SECURITY;

-- Policy: usuários autenticados podem ver status da sua empresa
CREATE POLICY status_expedicao_select_policy ON status_expedicao
  FOR SELECT
  TO authenticated
  USING (tenant_id IN (
    SELECT tenant_id FROM users WHERE auth_user_id = auth.uid()
  ));

-- Policy: apenas admin e master podem inserir
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

-- Policy: apenas admin e master podem atualizar
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

-- Policy: apenas admin e master podem deletar
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

-- Insere status padrão para todos os tenants existentes
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
ON CONFLICT DO NOTHING;

-- Trigger para atualizar updated_at
CREATE OR REPLACE FUNCTION update_status_expedicao_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER status_expedicao_updated_at
  BEFORE UPDATE ON status_expedicao
  FOR EACH ROW
  EXECUTE FUNCTION update_status_expedicao_updated_at();

-- Comentários
COMMENT ON TABLE status_expedicao IS 'Status customizados para o módulo de expedição/pedidos';
COMMENT ON COLUMN status_expedicao.nome IS 'Nome do status (ex: Separado, Enviado, etc)';
COMMENT ON COLUMN status_expedicao.cor IS 'Cor em hexadecimal (#RRGGBB)';
COMMENT ON COLUMN status_expedicao.ordem IS 'Ordem de exibição (menor = primeiro)';
COMMENT ON COLUMN status_expedicao.ativo IS 'Se o status está ativo e pode ser usado';
