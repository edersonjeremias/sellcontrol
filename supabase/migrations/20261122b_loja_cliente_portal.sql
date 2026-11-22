-- ============================================================================
-- LOJA — reconhecer a cliente que já existe e avisar quando o pedido anda
-- ============================================================================
-- Primeira compra pela loja criou um cadastro novo ao lado do que já existia:
-- a cliente informa WhatsApp, e o sistema é indexado por @ do Instagram, então
-- não havia como ligar os dois. O número é o que ela tem em comum com o
-- cadastro antigo — é por ele que passamos a procurar.
--
-- Idempotente.
-- ============================================================================

-- ─────────────────────────────────────────────────────────────────────────────
-- Cliente já cadastrado com este WhatsApp
-- ─────────────────────────────────────────────────────────────────────────────
-- Compara só os dígitos, e pelos 11 últimos: o cadastro antigo tem número
-- escrito de todo jeito — com máscara, com +55 na frente, com espaço. Pegar os
-- 11 finais faz "11975377492" e "+55 11 97537-7492" casarem sem arrastar junto
-- quem só compartilha o fim do número.
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
     -- Cadastro criado pela própria loja fica por último: se existe um @ de
     -- verdade com este número, é dele que a venda tem de ser
     ORDER BY (c.instagram LIKE 'loja.%'), c.created_at
   LIMIT 1;
$$;

REVOKE ALL ON FUNCTION loja_cliente_por_whatsapp(uuid, text) FROM anon, authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- Rastro do que a cliente já recebeu
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE loja_pedidos
  ADD COLUMN IF NOT EXISTS avisado_em    timestamptz,
  ADD COLUMN IF NOT EXISTS acesso_portal boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN loja_pedidos.avisado_em IS
  'Quando a loja mandou a confirmação para a cliente pelo WhatsApp.';
COMMENT ON COLUMN loja_pedidos.acesso_portal IS
  'A primeira compra criou (ou confirmou) o acesso dela ao portal do cliente.';
