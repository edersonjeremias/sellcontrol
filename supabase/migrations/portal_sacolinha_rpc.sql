-- ============================================================
-- PORTAL: RPC para buscar itens da sacolinha do cliente
-- Lê diretamente da tabela `vendas` com SECURITY DEFINER
-- Cole e execute no SQL Editor do Supabase
-- ============================================================

CREATE OR REPLACE FUNCTION portal_get_minha_sacolinha()
RETURNS TABLE (
  id               UUID,
  cliente_instagram TEXT,
  codigo_peca       TEXT,
  descricao_completa TEXT,
  valor             NUMERIC,
  status_peca       TEXT,
  data_insercao     TIMESTAMPTZ,
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
    v.preco                                                 AS valor,
    COALESCE(p.status_entrega, '')                          AS status_peca,
    v.created_at                                            AS data_insercao,
    NULL::TEXT                                              AS observacao,
    p.data_enviado                                          AS data_envio,
    COALESCE(p.rastreio, '')                                AS rastreio
  FROM vendas v
  LEFT JOIN producao_pedidos p
    ON v.codigo = p.pedido_codigo
    AND LOWER(TRIM(REPLACE(COALESCE(p.cliente_nome, ''), '@', ''))) = v_slug
    AND v.data_live = p.data_solicitado
  WHERE LOWER(TRIM(REPLACE(COALESCE(v.cliente_nome, ''), '@', ''))) = v_slug
    AND UPPER(TRIM(COALESCE(v.status, ''))) != 'CANCELADO'
  ORDER BY v.created_at DESC;
END;
$$;

-- Garante que usuários anônimos/autenticados podem chamar a função
GRANT EXECUTE ON FUNCTION portal_get_minha_sacolinha() TO anon, authenticated;
