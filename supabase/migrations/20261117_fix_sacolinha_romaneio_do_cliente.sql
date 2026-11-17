-- ============================================================
-- CORREÇÃO: peças apareciam como enviadas sem terem sido
-- ============================================================
-- O LEFT JOIN com romaneios casava apenas o número (vendas.numero_pedido
-- com o número do romaneio) e o tenant. Faltou amarrar o cliente: se
-- existisse um ROM-042 de outra pessoa já despachado, toda venda com
-- numero_pedido = 42 era dada como enviada, inclusive de clientes que
-- nunca receberam nada.
--
-- Afetava principalmente clientes novas, cujos pedidos ainda têm número
-- baixo e por isso colidem com romaneios antigos já despachados.
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
  -- romaneios.numero é texto ("ROM-155"); vendas.numero_pedido é o inteiro 155.
  -- O cliente entra na condição: o número sozinho se repete entre pessoas
  -- diferentes e marcava como enviada a peça de quem nunca recebeu nada.
  LEFT JOIN romaneios r
    ON r.tenant_id = v.tenant_id
    AND LOWER(TRIM(REPLACE(COALESCE(r.cliente_instagram, ''), '@', ''))) = v_slug
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
