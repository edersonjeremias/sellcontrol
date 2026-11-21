-- ============================================================================
-- LOJA — checkout: cotações, pagamento e a virada em venda
-- ============================================================================
-- O que o pedido precisa guardar entre o carrinho e a Produção:
--   - as opções de frete cotadas, para validar a que a cliente escolheu (o
--     valor nunca pode vir do navegador);
--   - o rastro da virada, para saber se o pedido pago já virou venda e por que
--     não virou quando falhar.
--
-- Idempotente.
-- ============================================================================

ALTER TABLE loja_pedidos
  ADD COLUMN IF NOT EXISTS frete_cotacoes jsonb,
  ADD COLUMN IF NOT EXISTS virada_em      timestamptz,
  ADD COLUMN IF NOT EXISTS virada_erro    text;

COMMENT ON COLUMN loja_pedidos.frete_cotacoes IS
  'Opções devolvidas pelo Melhor Envio, já com a margem da loja. A escolha da cliente é conferida contra esta lista.';
COMMENT ON COLUMN loja_pedidos.virada_em IS
  'Quando o pedido pago virou venda, romaneio e peça na Produção.';
COMMENT ON COLUMN loja_pedidos.virada_erro IS
  'Último erro da virada. Preenchido significa pedido pago que não entrou na Produção — tem de ser olhado.';

-- Pedido pago que ainda não virou venda: é a fila que a loja não pode deixar parada
CREATE INDEX IF NOT EXISTS idx_loja_pedidos_a_virar
  ON loja_pedidos (tenant_id)
  WHERE status = 'pago' AND virada_em IS NULL;

-- ─────────────────────────────────────────────────────────────────────────────
-- Vendas vindas da loja
-- ─────────────────────────────────────────────────────────────────────────────
-- A Produção precisa saber de onde a peça veio sem perguntar para ninguém.
ALTER TABLE vendas
  ADD COLUMN IF NOT EXISTS origem text;

COMMENT ON COLUMN vendas.origem IS
  'De onde a venda veio: vazio para a live (o caminho de sempre) e "loja" para a loja pública.';

CREATE INDEX IF NOT EXISTS idx_vendas_origem
  ON vendas (tenant_id, origem)
  WHERE origem IS NOT NULL;
