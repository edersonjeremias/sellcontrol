-- ════════════════════════════════════════════════════════════════
-- FIX: Normaliza comparação de instagram (remove @ em ambos os lados)
-- ════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION portal_get_minhas_conversas()
RETURNS TABLE(
  id UUID,
  assunto TEXT,
  coluna TEXT,
  nao_lidas_cliente INT,
  encerrado BOOLEAN,
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ,
  ultima_msg TEXT
)
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_instagram TEXT;
  v_instagram_normalizado TEXT;
BEGIN
  v_instagram := portal_get_instagram();

  IF v_instagram IS NULL THEN
    RETURN;
  END IF;

  -- Normaliza removendo @ para comparação
  v_instagram_normalizado := REPLACE(v_instagram, '@', '');

  RETURN QUERY
  SELECT
    c.id,
    c.assunto,
    c.coluna,
    c.nao_lidas_cliente,
    c.encerrado,
    c.created_at,
    c.updated_at,
    (
      SELECT m.texto
      FROM mensagens_contato m
      WHERE m.conversa_id = c.id
      ORDER BY m.created_at DESC
      LIMIT 1
    ) as ultima_msg
  FROM conversas c
  WHERE REPLACE(c.cliente_instagram, '@', '') = v_instagram_normalizado
  ORDER BY c.updated_at DESC;
END;
$$;

-- Atualiza também portal_get_mensagens para normalizar
CREATE OR REPLACE FUNCTION portal_get_mensagens(p_conversa_id UUID)
RETURNS TABLE(
  id UUID,
  remetente TEXT,
  texto TEXT,
  created_at TIMESTAMPTZ
)
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_instagram TEXT;
  v_instagram_normalizado TEXT;
  v_encontrou BOOLEAN;
BEGIN
  v_instagram := portal_get_instagram();

  IF v_instagram IS NULL THEN
    RETURN;
  END IF;

  -- Normaliza removendo @
  v_instagram_normalizado := REPLACE(v_instagram, '@', '');

  -- Verifica se a conversa pertence ao cliente (comparando sem @)
  SELECT EXISTS(
    SELECT 1
    FROM conversas
    WHERE conversas.id = p_conversa_id
      AND REPLACE(conversas.cliente_instagram, '@', '') = v_instagram_normalizado
  ) INTO v_encontrou;

  IF NOT v_encontrou THEN
    RETURN;
  END IF;

  -- Retorna mensagens
  RETURN QUERY
  SELECT
    m.id,
    m.remetente,
    m.texto,
    m.created_at
  FROM mensagens_contato m
  WHERE m.conversa_id = p_conversa_id
  ORDER BY m.created_at;
END;
$$;

-- Atualiza portal_criar_conversa para normalizar instagram
CREATE OR REPLACE FUNCTION portal_criar_conversa(
  p_assunto TEXT,
  p_mensagem TEXT
)
RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_instagram TEXT;
  v_instagram_normalizado TEXT;
  v_tenant_id UUID;
  v_conversa_id UUID;
BEGIN
  -- Busca instagram e tenant do cliente
  SELECT instagram, tenant_id INTO v_instagram, v_tenant_id
  FROM clientes
  WHERE user_id = auth.uid();

  IF v_instagram IS NULL THEN
    RAISE EXCEPTION 'Cliente não encontrado';
  END IF;

  -- Normaliza instagram (remove @)
  v_instagram_normalizado := REPLACE(v_instagram, '@', '');

  -- Cria conversa
  INSERT INTO conversas (
    tenant_id,
    cliente_instagram,
    assunto,
    coluna,
    nao_lidas
  ) VALUES (
    v_tenant_id,
    v_instagram_normalizado,
    p_assunto,
    'Novo',
    1
  ) RETURNING id INTO v_conversa_id;

  -- Insere primeira mensagem
  INSERT INTO mensagens_contato (
    conversa_id,
    remetente,
    texto
  ) VALUES (
    v_conversa_id,
    'cliente',
    p_mensagem
  );

  RETURN v_conversa_id;
END;
$$;

-- ══════════════════════════════════════════════════════════════════
-- DONE! Execute e atualize o portal com Ctrl+Shift+R
-- ══════════════════════════════════════════════════════════════════
