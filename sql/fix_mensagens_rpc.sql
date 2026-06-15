-- ════════════════════════════════════════════════════════════════
-- FIX: Recria funções RPC do sistema de mensagens
-- ════════════════════════════════════════════════════════════════

-- Drop apenas das funções que vamos recriar (não portal_get_instagram)
DROP FUNCTION IF EXISTS portal_criar_conversa(TEXT, TEXT);
DROP FUNCTION IF EXISTS portal_get_minhas_conversas();
DROP FUNCTION IF EXISTS portal_get_mensagens(UUID);
DROP FUNCTION IF EXISTS portal_responder_conversa(UUID, TEXT);
DROP FUNCTION IF EXISTS portal_marcar_lida(UUID);

-- ── 1. Criar nova conversa ──────────────────────────────────────────
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

  -- Cria conversa
  INSERT INTO conversas (
    tenant_id,
    cliente_instagram,
    assunto,
    coluna,
    nao_lidas
  ) VALUES (
    v_tenant_id,
    v_instagram,
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

-- ── 2. Listar conversas do cliente ──────────────────────────────────
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
BEGIN
  v_instagram := portal_get_instagram();

  IF v_instagram IS NULL THEN
    RETURN;
  END IF;

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
  WHERE c.cliente_instagram = v_instagram
  ORDER BY c.updated_at DESC;
END;
$$;

-- ── 3. Listar mensagens de uma conversa ─────────────────────────────
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
  v_encontrou BOOLEAN;
BEGIN
  v_instagram := portal_get_instagram();

  IF v_instagram IS NULL THEN
    RETURN;
  END IF;

  -- Verifica se a conversa pertence ao cliente
  SELECT EXISTS(
    SELECT 1
    FROM conversas
    WHERE conversas.id = p_conversa_id
      AND conversas.cliente_instagram = v_instagram
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

-- ── 4. Responder conversa ───────────────────────────────────────────
CREATE OR REPLACE FUNCTION portal_responder_conversa(
  p_conversa_id UUID,
  p_texto TEXT
)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_instagram TEXT;
  v_encontrou BOOLEAN;
BEGIN
  v_instagram := portal_get_instagram();

  IF v_instagram IS NULL THEN
    RAISE EXCEPTION 'Cliente não autenticado';
  END IF;

  -- Verifica permissão
  SELECT EXISTS(
    SELECT 1
    FROM conversas
    WHERE conversas.id = p_conversa_id
      AND conversas.cliente_instagram = v_instagram
      AND conversas.encerrado = FALSE
  ) INTO v_encontrou;

  IF NOT v_encontrou THEN
    RAISE EXCEPTION 'Conversa não encontrada ou encerrada';
  END IF;

  -- Insere mensagem
  INSERT INTO mensagens_contato (
    conversa_id,
    remetente,
    texto
  ) VALUES (
    p_conversa_id,
    'cliente',
    p_texto
  );

  -- Atualiza conversa
  UPDATE conversas
  SET
    updated_at = NOW(),
    nao_lidas = nao_lidas + 1,
    nao_lidas_cliente = 0
  WHERE id = p_conversa_id;
END;
$$;

-- ── 5. Marcar conversa como lida ────────────────────────────────────
CREATE OR REPLACE FUNCTION portal_marcar_lida(p_conversa_id UUID)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_instagram TEXT;
BEGIN
  v_instagram := portal_get_instagram();

  IF v_instagram IS NULL THEN
    RETURN;
  END IF;

  UPDATE conversas
  SET nao_lidas_cliente = 0
  WHERE id = p_conversa_id
    AND cliente_instagram = v_instagram;
END;
$$;

-- ══════════════════════════════════════════════════════════════════
-- DONE! Execute este SQL no Supabase e teste /contatos e /portal
-- ══════════════════════════════════════════════════════════════════
