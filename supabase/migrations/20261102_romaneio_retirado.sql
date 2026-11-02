-- ============================================================================
-- RETIRADA NA LOJA
-- ============================================================================
-- Data: 02/11/2026
--
-- Quando a cliente busca o pedido na loja não há frete, etiqueta nem rastreio,
-- então o romaneio ficava parado em "pronto" para sempre e continuava
-- aparecendo como aguardando pagamento do frete.
-- ============================================================================

ALTER TABLE romaneios
  DROP CONSTRAINT IF EXISTS romaneios_status_check;

ALTER TABLE romaneios
  ADD CONSTRAINT romaneios_status_check CHECK (
    status IN (
      'preparando',
      'pronto',
      'frete_cotado',
      'frete_pago',
      'etiqueta_gerada',
      'despachado',
      'em_transito',
      'entregue',
      'retirado',
      'cancelado'
    )
  );

ALTER TABLE romaneios
  ADD COLUMN IF NOT EXISTS retirado_em TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS retirado_nome TEXT,
  ADD COLUMN IF NOT EXISTS retirado_por_nome TEXT;

COMMENT ON COLUMN romaneios.retirado_em IS
  'Quando a cliente retirou o pedido na loja';
COMMENT ON COLUMN romaneios.retirado_nome IS
  'Quem buscou o pedido, informado no momento da retirada';
COMMENT ON COLUMN romaneios.retirado_por_nome IS
  'Usuário do sistema que registrou a retirada';
