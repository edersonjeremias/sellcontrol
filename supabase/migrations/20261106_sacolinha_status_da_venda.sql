-- ============================================================
-- Sacolinha do portal: respeitar o status da própria venda
-- ============================================================
-- O portal decidia "na sacolinha" vs "enviada" olhando só
-- producao_pedidos.status_entrega e o romaneio. Mas quem marca a peça como
-- despachada no dia a dia é a Expedição, que grava em vendas.status — e esse
-- campo era ignorado aqui.
--
-- Resultado: uma cliente com 68 peças pendentes na Expedição aparecia com 375
-- "Na Sacolinha" no portal, e a aba "Enviadas" ficava sempre zerada.
--
-- Passa a usar vendas.status, mesma fonte da Expedição:
--   'Enviado'                      → aba Enviadas
--   Devolução / Gerar Crédito      → fora das duas abas, como já era com
--                                    Cancelado (a peça não volta nem segue)
--
-- A comparação é feita em maiúsculas e com as variantes sem acento porque
-- cada loja cadastra os próprios status em status_expedicao.
-- ============================================================

DROP FUNCTION IF EXISTS portal_get_minha_sacolinha();

CREATE FUNCTION portal_get_minha_sacolinha()
RETURNS TABLE (
  id               UUID,
  cliente_instagram TEXT,
  codigo_peca       TEXT,
  descricao_completa TEXT,
  valor             NUMERIC,
  status_peca       TEXT,
  data_insercao     DATE,
  observacao        TEXT,
  data_envio        DATE,
  rastreio          TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_instagram TEXT;
  v_slug      TEXT;
BEGIN
  -- Identifica o instagram do usuário logado no portal
  v_instagram := portal_get_instagram();
  IF v_instagram IS NULL THEN RETURN; END IF;

  -- Normaliza: remove @ e lowercase para comparar (o vendedor pode ter digitado com ou sem @)
  v_slug := LOWER(TRIM(REPLACE(v_instagram, '@', '')));

  RETURN QUERY
  SELECT
    v.id,
    v.cliente_nome                                          AS cliente_instagram,
    v.codigo                                                AS codigo_peca,
    TRIM(CONCAT_WS(' ',
      NULLIF(TRIM(COALESCE(v.produto, '')), ''),
      NULLIF(TRIM(COALESCE(v.modelo,  '')), ''),
      NULLIF(TRIM(COALESCE(v.cor,     '')), ''),
      NULLIF(TRIM(COALESCE(v.marca,   '')), ''),
      NULLIF(TRIM(COALESCE(v.tamanho, '')), '')
    ))                                                      AS descricao_completa,
    -- ✅ Usa PROMOÇÃO se existir E > 0, senão usa PREÇO normal
    CASE
      WHEN v.preco_promocional IS NOT NULL AND v.preco_promocional > 0
      THEN v.preco_promocional
      ELSE v.preco
    END                                                     AS valor,
    -- Ordem de precedência: romaneio despachado, status da Expedição, produção
    CASE
      WHEN r.status IN ('despachado', 'em_transito', 'entregue')  THEN 'Enviado'
      WHEN UPPER(TRIM(COALESCE(v.status, ''))) = 'ENVIADO'        THEN 'Enviado'
      ELSE COALESCE(p.status_entrega, '')
    END                                                     AS status_peca,
    COALESCE(
      v.data_live,
      (v.created_at AT TIME ZONE 'America/Sao_Paulo')::date
    )                                                       AS data_insercao,
    NULL::TEXT                                              AS observacao,
    CASE
      WHEN r.status IN ('despachado', 'em_transito', 'entregue')
        THEN COALESCE(r.despachado_em, r.entregue_em)::date
      WHEN UPPER(TRIM(COALESCE(v.status, ''))) = 'ENVIADO' THEN v.data_live
      ELSE p.data_enviado
    END                                                     AS data_envio,
    COALESCE(NULLIF(r.codigo_rastreio, ''), p.rastreio, '') AS rastreio
  FROM vendas v
  LEFT JOIN producao_pedidos p
    ON v.codigo = p.pedido_codigo
    AND LOWER(TRIM(REPLACE(COALESCE(p.cliente_nome, ''), '@', ''))) = v_slug
    AND v.data_live = p.data_solicitado
  -- romaneios.numero é texto ("ROM-155"); vendas.numero_pedido é o inteiro 155
  LEFT JOIN romaneios r
    ON r.tenant_id = v.tenant_id
    AND v.numero_pedido IS NOT NULL
    AND NULLIF(regexp_replace(r.numero, '[^0-9]', '', 'g'), '')::int = v.numero_pedido
  WHERE LOWER(TRIM(REPLACE(COALESCE(v.cliente_nome, ''), '@', ''))) = v_slug
    AND UPPER(TRIM(COALESCE(v.status, ''))) NOT IN (
      'CANCELADO',
      'DEVOLUÇÃO', 'DEVOLUCAO',
      'GERAR CRÉDITO', 'GERAR CREDITO'
    )
  ORDER BY v.created_at DESC;
END;
$$;

GRANT EXECUTE ON FUNCTION portal_get_minha_sacolinha() TO anon, authenticated;

NOTIFY pgrst, 'reload schema';
