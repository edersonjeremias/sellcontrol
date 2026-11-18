-- ============================================================
-- CORREÇÃO: "Enviadas" só depois do despacho de verdade
-- ============================================================
-- A Expedição marca vendas.status = 'Enviado' no momento em que o romaneio
-- é GERADO (pedidosService: "Marca itens Separados como Enviado"), muito
-- antes de o pacote ser postado. A função tratava esse status como envio,
-- então a peça aparecia em "Enviadas" assim que entrava num romaneio — ou
-- até antes dele sair da loja.
--
-- Agora o sinal de envio é o romaneio despachado. vendas.status = 'Enviado'
-- só conta quando não há romaneio vinculado, caso das peças antigas, do
-- fluxo anterior aos romaneios, que de outra forma voltariam para a
-- sacolinha das clientes.
--
-- Mantém a correção anterior: o romaneio precisa ser DO MESMO cliente, já
-- que o número sozinho se repete entre pessoas diferentes.
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
    CASE
      -- Despacho do romaneio: o único sinal de que o pacote saiu
      WHEN r.status IN ('despachado', 'em_transito', 'entregue') THEN 'Enviado'
      -- Sem romaneio: peça do fluxo antigo, onde 'Enviado' era o envio real
      WHEN r.id IS NULL AND UPPER(TRIM(COALESCE(v.status, ''))) = 'ENVIADO' THEN 'Enviado'
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
      WHEN r.id IS NULL AND UPPER(TRIM(COALESCE(v.status, ''))) = 'ENVIADO'
        THEN COALESCE(v.data_envio, v.data_live)
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
