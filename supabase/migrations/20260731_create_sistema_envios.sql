-- ============================================================================
-- SISTEMA DE ENVIOS AUTOMATIZADO
-- ============================================================================
-- Data: 31/07/2026
-- Autor: Sistema SellControl
--
-- Estrutura para automatizar envios com:
-- - Endereços de clientes
-- - Romaneios (consolidação de sacolinhas)
-- - Cotações de frete (Melhor Envio)
-- - Pagamentos de frete (Mercado Pago PIX)
-- ============================================================================

-- ────────────────────────────────────────────────────────────────────────────
-- 1. ENDEREÇOS DOS CLIENTES
-- ────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS enderecos_clientes (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  cliente_instagram TEXT NOT NULL,

  -- Identificação do endereço
  apelido TEXT, -- Ex: Casa, Trabalho, Mãe
  destinatario TEXT NOT NULL,
  telefone TEXT NOT NULL,

  -- Endereço completo
  cep TEXT NOT NULL,
  rua TEXT NOT NULL,
  numero TEXT NOT NULL,
  complemento TEXT,
  bairro TEXT NOT NULL,
  cidade TEXT NOT NULL,
  estado TEXT NOT NULL, -- Sigla: SP, RJ, MG

  -- Controle
  padrao BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_enderecos_tenant_cliente ON enderecos_clientes(tenant_id, cliente_instagram);
CREATE INDEX idx_enderecos_padrao ON enderecos_clientes(tenant_id, cliente_instagram, padrao) WHERE padrao = true;

ALTER TABLE enderecos_clientes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "enderecos_clientes_tenant_policy"
  ON enderecos_clientes FOR ALL TO authenticated
  USING (tenant_id IN (SELECT tenant_id FROM users_perfil WHERE id = auth.uid()));

COMMENT ON TABLE enderecos_clientes IS 'Endereços de entrega salvos pelos clientes';

-- ────────────────────────────────────────────────────────────────────────────
-- 2. ROMANEIOS (Consolidação de Sacolinhas)
-- ────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS romaneios (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,

  -- Identificação
  numero TEXT UNIQUE NOT NULL, -- ROM-001, ROM-002
  cliente_instagram TEXT NOT NULL,

  -- Dimensões da caixa
  peso NUMERIC(10,2), -- kg
  altura INTEGER, -- cm
  largura INTEGER, -- cm
  comprimento INTEGER, -- cm

  -- Status do romaneio
  status TEXT NOT NULL DEFAULT 'preparando' CHECK (
    status IN (
      'preparando',
      'pronto',
      'frete_cotado',
      'frete_pago',
      'etiqueta_gerada',
      'despachado',
      'em_transito',
      'entregue',
      'cancelado'
    )
  ),

  -- Endereço de entrega
  endereco_id UUID REFERENCES enderecos_clientes(id),

  -- Frete escolhido
  transportadora TEXT,
  servico TEXT,
  valor_frete NUMERIC(10,2),
  prazo_entrega INTEGER, -- dias úteis

  -- Rastreamento
  codigo_rastreio TEXT,
  url_etiqueta TEXT,
  melhor_envio_order_id TEXT,

  -- Observações
  observacoes TEXT,

  -- Datas
  pronto_em TIMESTAMPTZ,
  frete_pago_em TIMESTAMPTZ,
  etiqueta_gerada_em TIMESTAMPTZ,
  despachado_em TIMESTAMPTZ,
  entregue_em TIMESTAMPTZ,
  cancelado_em TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_romaneios_tenant ON romaneios(tenant_id);
CREATE INDEX idx_romaneios_cliente ON romaneios(tenant_id, cliente_instagram);
CREATE INDEX idx_romaneios_status ON romaneios(tenant_id, status);
CREATE INDEX idx_romaneios_numero ON romaneios(numero);

ALTER TABLE romaneios ENABLE ROW LEVEL SECURITY;

CREATE POLICY "romaneios_tenant_policy"
  ON romaneios FOR ALL TO authenticated
  USING (tenant_id IN (SELECT tenant_id FROM users_perfil WHERE id = auth.uid()));

COMMENT ON TABLE romaneios IS 'Romaneios de envio (consolidação de múltiplas sacolinhas)';

-- ────────────────────────────────────────────────────────────────────────────
-- 3. RELACIONAMENTO ROMANEIO-SACOLINHAS
-- ────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS romaneio_sacolinhas (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  romaneio_id UUID NOT NULL REFERENCES romaneios(id) ON DELETE CASCADE,

  -- Identificação da sacolinha
  sacolinha INTEGER NOT NULL,
  data_live DATE,
  live_nome TEXT,

  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_romaneio_sacolinhas_romaneio ON romaneio_sacolinhas(romaneio_id);

ALTER TABLE romaneio_sacolinhas ENABLE ROW LEVEL SECURITY;

CREATE POLICY "romaneio_sacolinhas_tenant_policy"
  ON romaneio_sacolinhas FOR ALL TO authenticated
  USING (romaneio_id IN (
    SELECT id FROM romaneios WHERE tenant_id IN (
      SELECT tenant_id FROM users_perfil WHERE id = auth.uid()
    )
  ));

COMMENT ON TABLE romaneio_sacolinhas IS 'Quais sacolinhas fazem parte de cada romaneio';

-- ────────────────────────────────────────────────────────────────────────────
-- 4. COTAÇÕES DE FRETE (Melhor Envio)
-- ────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS cotacoes_frete (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  romaneio_id UUID NOT NULL REFERENCES romaneios(id) ON DELETE CASCADE,

  -- Opção de frete
  transportadora TEXT NOT NULL,
  servico TEXT NOT NULL,
  valor NUMERIC(10,2) NOT NULL,
  prazo INTEGER NOT NULL, -- dias úteis

  -- Dados completos da API
  melhor_envio_data JSONB,

  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_cotacoes_romaneio ON cotacoes_frete(romaneio_id);

ALTER TABLE cotacoes_frete ENABLE ROW LEVEL SECURITY;

CREATE POLICY "cotacoes_frete_tenant_policy"
  ON cotacoes_frete FOR ALL TO authenticated
  USING (romaneio_id IN (
    SELECT id FROM romaneios WHERE tenant_id IN (
      SELECT tenant_id FROM users_perfil WHERE id = auth.uid()
    )
  ));

COMMENT ON TABLE cotacoes_frete IS 'Cotações de frete do Melhor Envio';

-- ────────────────────────────────────────────────────────────────────────────
-- 5. PAGAMENTOS DE FRETE (Mercado Pago)
-- ────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS pagamentos_frete (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  romaneio_id UUID NOT NULL REFERENCES romaneios(id) ON DELETE CASCADE,

  -- Valor
  valor NUMERIC(10,2) NOT NULL,

  -- Método
  metodo TEXT NOT NULL CHECK (metodo IN ('pix', 'cartao', 'boleto')),

  -- Status
  status TEXT NOT NULL DEFAULT 'pendente' CHECK (
    status IN ('pendente', 'aprovado', 'recusado', 'cancelado')
  ),

  -- Gateway
  gateway_transaction_id TEXT,
  gateway_response JSONB,

  -- PIX
  pix_qr_code TEXT,
  pix_qr_code_base64 TEXT,
  pix_expiracao TIMESTAMPTZ,

  -- Datas
  pago_em TIMESTAMPTZ,
  cancelado_em TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_pagamentos_romaneio ON pagamentos_frete(romaneio_id);
CREATE INDEX idx_pagamentos_status ON pagamentos_frete(status);

ALTER TABLE pagamentos_frete ENABLE ROW LEVEL SECURITY;

CREATE POLICY "pagamentos_frete_tenant_policy"
  ON pagamentos_frete FOR ALL TO authenticated
  USING (romaneio_id IN (
    SELECT id FROM romaneios WHERE tenant_id IN (
      SELECT tenant_id FROM users_perfil WHERE id = auth.uid()
    )
  ));

COMMENT ON TABLE pagamentos_frete IS 'Pagamentos de frete (Mercado Pago)';

-- ────────────────────────────────────────────────────────────────────────────
-- TRIGGERS: Atualizar updated_at automaticamente
-- ────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_enderecos_updated_at
  BEFORE UPDATE ON enderecos_clientes
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_romaneios_updated_at
  BEFORE UPDATE ON romaneios
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_pagamentos_updated_at
  BEFORE UPDATE ON pagamentos_frete
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ────────────────────────────────────────────────────────────────────────────
-- FUNÇÃO: Gerar próximo número de romaneio
-- ────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION gerar_numero_romaneio(p_tenant_id UUID)
RETURNS TEXT AS $$
DECLARE
  v_count INTEGER;
  v_numero TEXT;
BEGIN
  SELECT COUNT(*) INTO v_count FROM romaneios WHERE tenant_id = p_tenant_id;
  v_numero := 'ROM-' || LPAD((v_count + 1)::TEXT, 3, '0');
  RETURN v_numero;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION gerar_numero_romaneio IS 'Gera número sequencial de romaneio (ROM-001, ROM-002...)';

-- ============================================================================
-- FIM DA MIGRATION
-- ============================================================================
