-- Cria tabela de histórico de créditos
-- Para rastrear todas as movimentações (lançamento e uso)

CREATE TABLE IF NOT EXISTS creditos_historico (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  cliente TEXT NOT NULL,
  tipo TEXT NOT NULL CHECK (tipo IN ('CREDITO', 'DEBITO')),
  valor NUMERIC(10,2) NOT NULL,
  saldo_anterior NUMERIC(10,2) DEFAULT 0,
  saldo_posterior NUMERIC(10,2) DEFAULT 0,
  motivo TEXT,
  cobranca_id UUID REFERENCES cobrancas(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- RLS
ALTER TABLE creditos_historico ENABLE ROW LEVEL SECURITY;

-- Policy para tenant
CREATE POLICY "creditos_historico_tenant_policy"
  ON creditos_historico
  FOR ALL
  TO authenticated
  USING (tenant_id IN (
    SELECT tenant_id FROM users_perfil WHERE id = auth.uid()
  ));

-- Índices para performance
CREATE INDEX idx_creditos_historico_tenant_cliente
  ON creditos_historico(tenant_id, cliente);

CREATE INDEX idx_creditos_historico_created_at
  ON creditos_historico(tenant_id, created_at DESC);

CREATE INDEX idx_creditos_historico_cobranca
  ON creditos_historico(cobranca_id)
  WHERE cobranca_id IS NOT NULL;

-- Comentários
COMMENT ON TABLE creditos_historico IS
  'Histórico completo de movimentações de crédito (lançamento e uso)';

COMMENT ON COLUMN creditos_historico.tipo IS
  'CREDITO = lançar crédito ao cliente | DEBITO = usar crédito em cobrança';

COMMENT ON COLUMN creditos_historico.saldo_anterior IS
  'Saldo do cliente ANTES desta movimentação';

COMMENT ON COLUMN creditos_historico.saldo_posterior IS
  'Saldo do cliente APÓS esta movimentação';
