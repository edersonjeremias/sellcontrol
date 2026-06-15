-- ════════════════════════════════════════════════════════════════
-- FIX: Atualiza TODAS as funções portal_* para usar portal_clientes
-- ════════════════════════════════════════════════════════════════

-- 1. Atualiza portal_get_instagram para buscar em portal_clientes
-- (não pode dropar porque policies dependem dela)
CREATE OR REPLACE FUNCTION portal_get_instagram()
RETURNS TEXT
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_instagram TEXT;
BEGIN
  SELECT instagram INTO v_instagram
  FROM portal_clientes
  WHERE user_id = auth.uid();

  RETURN v_instagram;
END;
$$;

-- 2. Atualiza portal_responder_conversa (já usa portal_get_instagram)
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
  v_instagram_normalizado TEXT;
  v_encontrou BOOLEAN;
BEGIN
  v_instagram := portal_get_instagram();

  IF v_instagram IS NULL THEN
    RAISE EXCEPTION 'Cliente não autenticado';
  END IF;

  -- Normaliza removendo @
  v_instagram_normalizado := REPLACE(v_instagram, '@', '');

  -- Verifica permissão (comparando sem @)
  SELECT EXISTS(
    SELECT 1
    FROM conversas
    WHERE conversas.id = p_conversa_id
      AND REPLACE(conversas.cliente_instagram, '@', '') = v_instagram_normalizado
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

-- 3. Atualiza portal_marcar_lida
CREATE OR REPLACE FUNCTION portal_marcar_lida(p_conversa_id UUID)
RETURNS VOID
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

  v_instagram_normalizado := REPLACE(v_instagram, '@', '');

  UPDATE conversas
  SET nao_lidas_cliente = 0
  WHERE id = p_conversa_id
    AND REPLACE(cliente_instagram, '@', '') = v_instagram_normalizado;
END;
$$;

-- ══════════════════════════════════════════════════════════════════
-- DONE! Execute e teste responder no portal
-- ══════════════════════════════════════════════════════════════════
