-- ============================================================================
-- LOJA — guardar na sacolinha
-- ============================================================================
-- A cliente que já compra nas lives pode pagar só as peças e deixar que elas
-- saiam junto com as outras, num frete só. É o motivo de ela ter sacolinha.
--
-- A peça entra na sacolinha JÁ QUITADA. No fechamento ela entra no romaneio e
-- no cálculo do frete como qualquer outra, mas não pode voltar para a
-- cobrança — quem paga duas vezes pela mesma peça não volta.
--
-- Idempotente.
-- ============================================================================

-- ─────────────────────────────────────────────────────────────────────────────
-- Cliente já cadastrada com este WhatsApp — agora preferindo quem usa o portal
-- ─────────────────────────────────────────────────────────────────────────────
-- A mesma pessoa pode ter mais de um cadastro antigo. Entre eles, o que
-- interessa é aquele com acesso ao portal: é o @ que ela usa para entrar e
-- onde ela espera ver as peças.
CREATE OR REPLACE FUNCTION loja_cliente_por_whatsapp(p_tenant_id uuid, p_whatsapp text)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT c.instagram
    FROM clientes c
   WHERE c.tenant_id = p_tenant_id
     AND length(regexp_replace(coalesce(p_whatsapp, ''), '\D', '', 'g')) >= 10
     AND right(regexp_replace(coalesce(c.whatsapp, ''), '\D', '', 'g'), 11)
       = right(regexp_replace(p_whatsapp, '\D', '', 'g'), 11)
     AND btrim(coalesce(c.instagram, '')) <> ''
   ORDER BY
     -- 1. quem já entra no portal com esse @
     (NOT EXISTS (
        SELECT 1 FROM portal_clientes pc
         WHERE lower(btrim(pc.instagram)) = lower(btrim(replace(c.instagram, '@', '')))
      )),
     -- 2. cadastro criado pela própria loja fica por último
     (c.instagram LIKE 'loja.%'),
     c.created_at
   LIMIT 1;
$$;

REVOKE ALL ON FUNCTION loja_cliente_por_whatsapp(uuid, text) FROM anon, authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- Peça da loja não volta para a cobrança
-- ─────────────────────────────────────────────────────────────────────────────
-- A busca de vendas para cobrança (cobrancasService.buscarVendasParaCobranca)
-- pega tudo que está como Vendido na data da live. A peça comprada na loja já
-- foi paga no cartão ou no PIX do pedido, então ela é marcada com origem
-- 'loja' e o filtro a ignora. Este índice é para esse filtro não varrer a
-- tabela inteira.
CREATE INDEX IF NOT EXISTS idx_vendas_cobranca_origem
  ON vendas (tenant_id, data_live)
  WHERE origem IS NULL;

COMMENT ON COLUMN loja_pedidos.destino IS
  'entrega = paga peças e frete agora, vira romaneio. sacolinha = paga só as peças, que esperam o fechamento junto com as da live.';
