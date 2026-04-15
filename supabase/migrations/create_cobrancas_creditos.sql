-- ─────────────────────────────────────────────────────────────
--  Tabela: cobrancas  (cobranças / contas a receber)
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS cobrancas (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id      UUID        NOT NULL,
  data           DATE        NOT NULL DEFAULT CURRENT_DATE,
  cliente        TEXT        NOT NULL DEFAULT '',
  whatsapp       TEXT        NOT NULL DEFAULT '',
  itens          JSONB       NOT NULL DEFAULT '[]',
  total          DECIMAL(10,2) NOT NULL DEFAULT 0,
  link_mp        TEXT        NOT NULL DEFAULT '',
  status         TEXT        NOT NULL DEFAULT 'PENDENTE',
  id_mp          TEXT        NOT NULL DEFAULT '',
  ext_ref        TEXT        NOT NULL DEFAULT '',
  live           TEXT        NOT NULL DEFAULT '',
  observacao     TEXT        NOT NULL DEFAULT '',
  qt_envios      INTEGER     NOT NULL DEFAULT 0,
  data_pagamento TIMESTAMPTZ,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_cobrancas_tenant_data
  ON cobrancas(tenant_id, data DESC);

CREATE INDEX IF NOT EXISTS idx_cobrancas_tenant_status
  ON cobrancas(tenant_id, status);

ALTER TABLE cobrancas ENABLE ROW LEVEL SECURITY;

-- Usuários autenticados: acesso total ao próprio tenant
CREATE POLICY "cobrancas_auth_tenant" ON cobrancas
  TO authenticated
  USING (
    tenant_id = (SELECT tenant_id FROM users_perfil WHERE id = auth.uid())
  )
  WITH CHECK (
    tenant_id = (SELECT tenant_id FROM users_perfil WHERE id = auth.uid())
  );

-- Acesso anônimo: somente leitura (necessário para a página de recibo pública)
CREATE POLICY "cobrancas_anon_read" ON cobrancas
  FOR SELECT
  TO anon
  USING (true);


-- ─────────────────────────────────────────────────────────────
--  Tabela: creditos  (saldo de crédito por cliente)
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS creditos (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id        UUID        NOT NULL,
  cliente          TEXT        NOT NULL DEFAULT '',
  valor_original   DECIMAL(10,2) NOT NULL DEFAULT 0,
  motivo           TEXT        NOT NULL DEFAULT 'Crédito da Loja',
  saldo_restante   DECIMAL(10,2) NOT NULL DEFAULT 0,
  valor_utilizado  DECIMAL(10,2) NOT NULL DEFAULT 0,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_creditos_tenant_cliente
  ON creditos(tenant_id, cliente);

ALTER TABLE creditos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "creditos_auth_tenant" ON creditos
  TO authenticated
  USING (
    tenant_id = (SELECT tenant_id FROM users_perfil WHERE id = auth.uid())
  )
  WITH CHECK (
    tenant_id = (SELECT tenant_id FROM users_perfil WHERE id = auth.uid())
  );
