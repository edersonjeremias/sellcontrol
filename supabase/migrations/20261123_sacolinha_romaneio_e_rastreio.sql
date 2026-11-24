-- ============================================================
-- Sacolinha do portal: romaneio e transportadora na peça enviada
-- ============================================================
-- A cliente via o código de rastreio solto, sem saber de qual pacote ele
-- era nem conseguir clicar. A função passa a devolver o número do romaneio
-- e a transportadora, que o portal usa para montar o link de rastreio.
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
  rastreio          TEXT,
  romaneio          TEXT,
  transportadora    TEXT
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
    CASE
      -- Despacho do romaneio: o único sinal de que o pacote saiu
      WHEN r.status IN ('despachado', 'em_transito', 'entregue') THEN 'Enviado'
      -- Sem romaneio: peça do fluxo antigo, onde 'Enviado' era o envio real
      -- data_envio distingue o envio real do 'ENVIADO' da cobrança
      WHEN r.id IS NULL
           AND UPPER(TRIM(COALESCE(v.status, ''))) = 'ENVIADO'
           AND v.data_envio IS NOT NULL THEN 'Enviado'
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
      WHEN r.id IS NULL
           AND UPPER(TRIM(COALESCE(v.status, ''))) = 'ENVIADO'
           AND v.data_envio IS NOT NULL
        THEN v.data_envio
      ELSE p.data_enviado
    END                                                     AS data_envio,
    COALESCE(NULLIF(r.codigo_rastreio, ''), p.rastreio, '') AS rastreio,
    COALESCE(r.numero, '')                                  AS romaneio,
    COALESCE(r.transportadora, '')                          AS transportadora
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
