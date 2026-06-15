-- ════════════════════════════════════════════════════════════════
-- FIX FINAL: Corrige portal_criar_conversa para buscar em portal_clientes
-- ════════════════════════════════════════════════════════════════

DROP FUNCTION IF EXISTS portal_criar_conversa(TEXT, TEXT);

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
  -- Busca instagram do PORTAL (portal_clientes, não clientes!)
  SELECT instagram INTO v_instagram
  FROM portal_clientes
  WHERE user_id = auth.uid();

  IF v_instagram IS NULL THEN
    RAISE EXCEPTION 'Cliente não encontrado no portal';
  END IF;

  -- Normaliza instagram (remove @)
  v_instagram_normalizado := REPLACE(v_instagram, '@', '');

  -- Busca tenant_id das configurações (assumindo tenant único)
  SELECT tenant_id INTO v_tenant_id
  FROM configuracoes
  LIMIT 1;

  IF v_tenant_id IS NULL THEN
    RAISE EXCEPTION 'Tenant não encontrado';
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
-- DONE! Execute e teste criar conversa no portal
-- ══════════════════════════════════════════════════════════════════
