-- ============================================================================
-- CONCILIAÇÃO DE FRETE — Romaneio x Mercado Pago x Melhor Envio
-- ============================================================================
-- Data: 04/11/2026
--
-- A mesma conta do Mercado Pago recebe o frete dos romaneios e o dinheiro das
-- vendas. No extrato tudo vira uma lista só, então não havia como saber quanto
-- entrou de frete — nem onde marcar que esse dinheiro já foi transferido para a
-- conta que gera crédito no Melhor Envio.
--
-- Três partes:
--   1. romaneios        — marcação da transferência e recebimento fora do PIX
--   2. pagamentos_frete — taxa do MP e valor líquido (o que entrou de verdade)
--   3. mp_extrato       — espelho do extrato do MP, classificado em
--                         frete / venda / outro
-- ============================================================================

-- ────────────────────────────────────────────────────────────────────────────
-- 1. ROMANEIOS: transferência para a conta do Melhor Envio
-- ────────────────────────────────────────────────────────────────────────────
ALTER TABLE romaneios
  ADD COLUMN IF NOT EXISTS frete_transferido          BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS frete_transferido_em       TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS frete_transferido_por      UUID,
  ADD COLUMN IF NOT EXISTS frete_transferido_por_nome TEXT,
  ADD COLUMN IF NOT EXISTS frete_recebido_manual      NUMERIC(10,2),
  ADD COLUMN IF NOT EXISTS frete_recebido_obs         TEXT;

COMMENT ON COLUMN romaneios.frete_transferido IS
  'Dinheiro do frete já foi transferido para a conta que gera crédito no Melhor Envio';
COMMENT ON COLUMN romaneios.frete_transferido_em IS
  'Quando a transferência foi marcada';
COMMENT ON COLUMN romaneios.frete_transferido_por_nome IS
  'Quem marcou a transferência, preservado mesmo se o cadastro mudar';
COMMENT ON COLUMN romaneios.frete_recebido_manual IS
  'Frete recebido fora do PIX do sistema (dinheiro, junto com a venda, crédito)';
COMMENT ON COLUMN romaneios.frete_recebido_obs IS
  'Como esse valor manual entrou';

CREATE INDEX IF NOT EXISTS idx_romaneios_frete_transferido
  ON romaneios (tenant_id, frete_transferido);

-- ────────────────────────────────────────────────────────────────────────────
-- 2. PAGAMENTOS_FRETE: taxa do Mercado Pago e valor líquido
-- ────────────────────────────────────────────────────────────────────────────
ALTER TABLE pagamentos_frete
  ADD COLUMN IF NOT EXISTS mp_taxa       NUMERIC(10,2),
  ADD COLUMN IF NOT EXISTS valor_liquido NUMERIC(10,2);

COMMENT ON COLUMN pagamentos_frete.mp_taxa IS
  'Soma das taxas cobradas pelo Mercado Pago (fee_details)';
COMMENT ON COLUMN pagamentos_frete.valor_liquido IS
  'Valor que realmente caiu na conta do MP (net_received_amount)';

-- Preenche com o que já está guardado em gateway_response
UPDATE pagamentos_frete p
   SET valor_liquido = COALESCE(
         p.valor_liquido,
         NULLIF(p.gateway_response->'transaction_details'->>'net_received_amount', '')::numeric
       ),
       mp_taxa = COALESCE(
         p.mp_taxa,
         CASE WHEN jsonb_typeof(p.gateway_response->'fee_details') = 'array' THEN (
           SELECT SUM((f->>'amount')::numeric)
             FROM jsonb_array_elements(p.gateway_response->'fee_details') f
         ) END
       )
 WHERE jsonb_typeof(p.gateway_response) = 'object'
   AND (p.valor_liquido IS NULL OR p.mp_taxa IS NULL);

-- ────────────────────────────────────────────────────────────────────────────
-- 3. MP_EXTRATO: espelho do extrato do Mercado Pago, já separado
-- ────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS mp_extrato (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id      UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,

  mp_payment_id  TEXT NOT NULL,
  data_aprovacao TIMESTAMPTZ,

  valor          NUMERIC(12,2),   -- transaction_amount (bruto)
  taxa           NUMERIC(12,2),   -- soma de fee_details
  liquido        NUMERIC(12,2),   -- net_received_amount

  metodo         TEXT,            -- pix, credit_card, bolbradesco...
  descricao      TEXT,
  payer_email    TEXT,
  status         TEXT,

  -- De onde veio esse dinheiro
  origem         TEXT NOT NULL DEFAULT 'outro'
                 CHECK (origem IN ('frete', 'venda', 'outro')),
  origem_auto    BOOLEAN NOT NULL DEFAULT true,  -- false = classificado à mão
  romaneio_id    UUID REFERENCES romaneios(id) ON DELETE SET NULL,
  cobranca_id    UUID,

  raw            JSONB,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE (tenant_id, mp_payment_id)
);

CREATE INDEX IF NOT EXISTS idx_mp_extrato_tenant_data
  ON mp_extrato (tenant_id, data_aprovacao DESC);
CREATE INDEX IF NOT EXISTS idx_mp_extrato_origem
  ON mp_extrato (tenant_id, origem);
CREATE INDEX IF NOT EXISTS idx_mp_extrato_romaneio
  ON mp_extrato (romaneio_id);

ALTER TABLE mp_extrato ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "mp_extrato_tenant_policy" ON mp_extrato;

CREATE POLICY "mp_extrato_tenant_policy"
  ON mp_extrato FOR ALL TO authenticated
  USING      (tenant_id IN (SELECT tenant_id FROM users_perfil WHERE id = auth.uid()))
  WITH CHECK (tenant_id IN (SELECT tenant_id FROM users_perfil WHERE id = auth.uid()));

DROP TRIGGER IF EXISTS update_mp_extrato_updated_at ON mp_extrato;

CREATE TRIGGER update_mp_extrato_updated_at
  BEFORE UPDATE ON mp_extrato
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

COMMENT ON TABLE mp_extrato IS
  'Extrato do Mercado Pago espelhado e classificado (frete x venda x outro)';

-- ────────────────────────────────────────────────────────────────────────────
-- 4. PÁGINA NO MENU
-- ────────────────────────────────────────────────────────────────────────────
INSERT INTO pages (tenant_id, slug, label, icon, category, order_index)
SELECT t.id, 'frete-pagamentos', 'Frete e Romaneios', '📦', 'Financeiro', 36
  FROM tenants t
 WHERE NOT EXISTS (
   SELECT 1 FROM pages p
    WHERE p.tenant_id = t.id AND p.slug = 'frete-pagamentos'
 );

-- ============================================================================
-- FIM DA MIGRATION
-- ============================================================================
