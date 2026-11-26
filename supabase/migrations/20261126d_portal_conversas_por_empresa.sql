-- ============================================================================
-- PORTAL — CONVERSAS E ENCERRAMENTO DE SACOLINHA POR EMPRESA
-- ============================================================================
-- Fecha o que faltava de 20261126b_portal_por_empresa.sql (que precisa ter
-- rodado antes: é de lá que vem portal_get_tenant()).
--
-- Estas seis funções existiam só dentro do banco, sem código no repositório.
-- Elas vêm para cá como estavam, com três correções:
--
--   1. CONVERSA IA PARA A EMPRESA ERRADA. portal_criar_conversa descobria a
--      empresa com `SELECT tenant_id FROM configuracoes LIMIT 1` — a primeira
--      linha da tabela, de qualquer empresa. Com mais de uma no sistema, a
--      cliente escrevia para uma loja e a mensagem caía no atendimento de
--      outra. Agora a empresa é a da conta de quem está logado.
--
--   2. CONVERSA DE OUTRA EMPRESA. As funções de leitura e resposta achavam a
--      conversa só pelo @ da cliente. Duas lojas com a mesma @ cliente
--      compartilhavam as conversas. Todas passaram a filtrar a empresa.
--
--   3. ENCERRAR A SACOLINHA DE OUTRA PESSOA. portal_encerrar_sacolinha
--      confiava no @ recebido como parâmetro: bastava chamar a função com o @
--      de outra cliente para fechar a sacolinha dela. O @ agora é sempre o de
--      quem está logado; o parâmetro continua existindo para não quebrar a
--      chamada do portal, mas é ignorado.
--
-- Idempotente: pode rodar de novo sem quebrar nada.
-- ============================================================================

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. ABRIR CONVERSA
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.portal_criar_conversa(
  p_assunto  text,
  p_mensagem text,
  p_anexos   jsonb DEFAULT '[]'::jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_instagram TEXT;
  v_instagram_normalizado TEXT;
  v_tenant_id UUID;
  v_conversa_id UUID;
BEGIN
  -- portal_get_instagram() no lugar da leitura direta: ele também barra quem
  -- está com o acesso bloqueado.
  v_instagram := portal_get_instagram();

  IF v_instagram IS NULL THEN
    RAISE EXCEPTION 'Cliente não encontrado no portal';
  END IF;

  v_instagram_normalizado := REPLACE(v_instagram, '@', '');

  -- A empresa é a da conta logada. Antes era a primeira linha de
  -- `configuracoes`, o que mandava a mensagem para a loja errada.
  v_tenant_id := portal_get_tenant();

  IF v_tenant_id IS NULL THEN
    RAISE EXCEPTION 'Empresa não encontrada para esta conta';
  END IF;

  INSERT INTO conversas (tenant_id, cliente_instagram, assunto, coluna, nao_lidas)
  VALUES (v_tenant_id, v_instagram_normalizado, p_assunto, 'Novo', 1)
  RETURNING id INTO v_conversa_id;

  INSERT INTO mensagens_contato (conversa_id, remetente, texto, anexos)
  VALUES (v_conversa_id, 'cliente', COALESCE(p_mensagem, ''), COALESCE(p_anexos, '[]'::jsonb));

  RETURN v_conversa_id;
END;
$function$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. MINHAS CONVERSAS
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.portal_get_minhas_conversas()
RETURNS TABLE(
  id uuid,
  assunto text,
  coluna text,
  nao_lidas_cliente integer,
  encerrado boolean,
  created_at timestamp with time zone,
  updated_at timestamp with time zone,
  ultima_msg text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_instagram TEXT;
  v_instagram_normalizado TEXT;
  v_tenant_id UUID;
BEGIN
  v_instagram := portal_get_instagram();

  IF v_instagram IS NULL THEN
    RETURN;
  END IF;

  v_tenant_id := portal_get_tenant();
  IF v_tenant_id IS NULL THEN
    RETURN;
  END IF;

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
      SELECT COALESCE(
        NULLIF(TRIM(COALESCE(m.texto, '')), ''),
        CASE WHEN jsonb_array_length(COALESCE(m.anexos, '[]'::jsonb)) > 0
             THEN 'Anexo' ELSE '' END
      )
      FROM mensagens_contato m
      WHERE m.conversa_id = c.id
      ORDER BY m.created_at DESC
      LIMIT 1
    ) AS ultima_msg
  FROM conversas c
  WHERE c.tenant_id = v_tenant_id
    AND REPLACE(c.cliente_instagram, '@', '') = v_instagram_normalizado
  ORDER BY c.updated_at DESC;
END;
$function$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. MENSAGENS DE UMA CONVERSA
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.portal_get_mensagens(p_conversa_id uuid)
RETURNS TABLE(
  id uuid,
  remetente text,
  texto text,
  anexos jsonb,
  created_at timestamp with time zone,
  autor_nome text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_instagram TEXT;
  v_instagram_normalizado TEXT;
  v_tenant_id UUID;
  v_encontrou BOOLEAN;
BEGIN
  v_instagram := portal_get_instagram();

  IF v_instagram IS NULL THEN
    RETURN;
  END IF;

  v_tenant_id := portal_get_tenant();
  IF v_tenant_id IS NULL THEN
    RETURN;
  END IF;

  v_instagram_normalizado := REPLACE(v_instagram, '@', '');

  -- A conversa tem que ser desta cliente E desta empresa.
  SELECT EXISTS(
    SELECT 1 FROM conversas
    WHERE conversas.id = p_conversa_id
      AND conversas.tenant_id = v_tenant_id
      AND REPLACE(conversas.cliente_instagram, '@', '') = v_instagram_normalizado
  ) INTO v_encontrou;

  IF NOT v_encontrou THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT
    m.id,
    m.remetente,
    COALESCE(m.texto, '') AS texto,
    COALESCE(m.anexos, '[]'::jsonb) AS anexos,
    m.created_at,
    m.autor_nome
  FROM mensagens_contato m
  WHERE m.conversa_id = p_conversa_id
  ORDER BY m.created_at;
END;
$function$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. MARCAR COMO LIDA
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.portal_marcar_lida(p_conversa_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_instagram TEXT;
  v_instagram_normalizado TEXT;
  v_tenant_id UUID;
BEGIN
  v_instagram := portal_get_instagram();

  IF v_instagram IS NULL THEN
    RETURN;
  END IF;

  v_tenant_id := portal_get_tenant();
  IF v_tenant_id IS NULL THEN
    RETURN;
  END IF;

  v_instagram_normalizado := REPLACE(v_instagram, '@', '');

  UPDATE conversas
  SET nao_lidas_cliente = 0
  WHERE id = p_conversa_id
    AND tenant_id = v_tenant_id
    AND REPLACE(cliente_instagram, '@', '') = v_instagram_normalizado;
END;
$function$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. RESPONDER
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.portal_responder_conversa(
  p_conversa_id uuid,
  p_texto text,
  p_anexos jsonb DEFAULT '[]'::jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_instagram TEXT;
  v_instagram_normalizado TEXT;
  v_tenant_id UUID;
  v_encontrou BOOLEAN;
BEGIN
  v_instagram := portal_get_instagram();

  IF v_instagram IS NULL THEN
    RAISE EXCEPTION 'Cliente não autenticado';
  END IF;

  v_tenant_id := portal_get_tenant();
  IF v_tenant_id IS NULL THEN
    RAISE EXCEPTION 'Empresa não encontrada para esta conta';
  END IF;

  v_instagram_normalizado := REPLACE(v_instagram, '@', '');

  SELECT EXISTS(
    SELECT 1 FROM conversas
    WHERE conversas.id = p_conversa_id
      AND conversas.tenant_id = v_tenant_id
      AND REPLACE(conversas.cliente_instagram, '@', '') = v_instagram_normalizado
      AND conversas.encerrado = FALSE
  ) INTO v_encontrou;

  IF NOT v_encontrou THEN
    RAISE EXCEPTION 'Conversa não encontrada ou encerrada';
  END IF;

  INSERT INTO mensagens_contato (conversa_id, remetente, texto, anexos)
  VALUES (p_conversa_id, 'cliente', COALESCE(p_texto, ''), COALESCE(p_anexos, '[]'::jsonb));

  UPDATE conversas
  SET updated_at = NOW(),
      nao_lidas = nao_lidas + 1,
      nao_lidas_cliente = 0
  WHERE id = p_conversa_id;
END;
$function$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 6. ENCERRAR A SACOLINHA
-- ─────────────────────────────────────────────────────────────────────────────
-- O parâmetro p_instagram continua na assinatura para a chamada do portal não
-- quebrar, mas não é mais usado para decidir de quem é a sacolinha: quem
-- encerra é sempre quem está logado. Antes, chamar a função com o @ de outra
-- pessoa fechava a sacolinha dela.
CREATE OR REPLACE FUNCTION public.portal_encerrar_sacolinha(
  p_instagram text,
  p_tipo_entrega text,
  p_obs text
)
RETURNS TABLE(producao_id uuid, portal_producao_id uuid)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_instagram TEXT;
  v_tenant_id UUID;
  v_obs_texto TEXT;
  v_data_hoje DATE;
  v_prod_id UUID;
  v_portal_id UUID;
BEGIN
  -- Quem está logado, não quem o parâmetro disser.
  v_instagram := portal_get_instagram();

  IF v_instagram IS NULL THEN
    RAISE EXCEPTION 'Cliente não autenticado';
  END IF;

  v_instagram := LOWER(TRIM(REPLACE(v_instagram, '@', '')));

  -- A empresa é a da conta. Antes vinha de uma busca pelo @ em `clientes`,
  -- que com a mesma @ em duas lojas podia cair na errada.
  v_tenant_id := portal_get_tenant();

  IF v_tenant_id IS NULL THEN
    RAISE EXCEPTION 'Empresa não encontrada para esta conta';
  END IF;

  -- Monta observação
  v_obs_texto := CASE
    WHEN TRIM(COALESCE(p_obs, '')) != '' THEN '[' || p_tipo_entrega || '] ' || TRIM(p_obs)
    ELSE '[' || p_tipo_entrega || ']'
  END;

  v_data_hoje := CURRENT_DATE;

  -- Insere em producao_pedidos (tabela oficial)
  INSERT INTO producao_pedidos (
    tenant_id,
    cliente_nome,
    data_solicitado,
    status_prod,
    status_entrega,
    obs_cliente
  )
  VALUES (
    v_tenant_id,
    '@' || v_instagram,
    v_data_hoje,
    'Em fila',
    'Aguardando',
    v_obs_texto
  )
  RETURNING id INTO v_prod_id;

  -- Insere em portal_producao (para visualização do portal).
  -- O tenant_id passou a ser obrigatório aqui: a tabela é lida com filtro de
  -- empresa, e linha sem empresa não aparece para ninguém.
  INSERT INTO portal_producao (
    tenant_id,
    cliente_instagram,
    status_producao,
    status_entrega,
    obs_cliente
  )
  VALUES (
    v_tenant_id,
    v_instagram,
    'Em fila',
    'Aguardando',
    v_obs_texto
  )
  RETURNING id INTO v_portal_id;

  RETURN QUERY SELECT v_prod_id, v_portal_id;
END;
$function$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 7. PERMISSÕES
-- ─────────────────────────────────────────────────────────────────────────────
GRANT EXECUTE ON FUNCTION public.portal_criar_conversa(text, text, jsonb)      TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.portal_get_minhas_conversas()                 TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.portal_get_mensagens(uuid)                    TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.portal_marcar_lida(uuid)                      TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.portal_responder_conversa(uuid, text, jsonb)  TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.portal_encerrar_sacolinha(text, text, text)   TO anon, authenticated;

NOTIFY pgrst, 'reload schema';

-- ============================================================================
-- FIM DA MIGRATION
-- ============================================================================
