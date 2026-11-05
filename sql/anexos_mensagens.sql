-- ════════════════════════════════════════════════════════════════
-- ANEXOS EM MENSAGENS (Contatos, Notificações e Portal do cliente)
-- Cole este bloco INTEIRO no SQL Editor do Supabase e execute.
--
-- O que faz:
--   1. Cria a coluna `anexos` (jsonb) nas tabelas de mensagens
--   2. Cria o bucket público `anexos` no Storage + políticas
--   3. Recria as funções do portal para aceitarem/retornarem anexos
--
-- Formato de cada anexo salvo no jsonb:
--   { "url": "...", "nome": "foto.jpg", "tipo": "image/jpeg", "tamanho": 12345 }
-- ════════════════════════════════════════════════════════════════

-- ── 1. COLUNAS ──────────────────────────────────────────────────
ALTER TABLE mensagens_contato
  ADD COLUMN IF NOT EXISTS anexos JSONB DEFAULT '[]'::jsonb;

ALTER TABLE notificacoes_mensagens
  ADD COLUMN IF NOT EXISTS anexos JSONB DEFAULT '[]'::jsonb;

ALTER TABLE notificacoes
  ADD COLUMN IF NOT EXISTS anexos JSONB DEFAULT '[]'::jsonb;

-- Mensagem só com anexo não tem texto — libera o NOT NULL se existir
ALTER TABLE mensagens_contato ALTER COLUMN texto DROP NOT NULL;
ALTER TABLE notificacoes_mensagens ALTER COLUMN mensagem DROP NOT NULL;


-- ── 2. BUCKET DE ARQUIVOS ───────────────────────────────────────
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'anexos', 'anexos', TRUE, 10485760,
  ARRAY['image/jpeg','image/png','image/webp','image/gif','application/pdf']
)
ON CONFLICT (id) DO UPDATE SET
  public = TRUE,
  file_size_limit = 10485760,
  allowed_mime_types = ARRAY['image/jpeg','image/png','image/webp','image/gif','application/pdf'];

-- Políticas do bucket (leitura pública, envio por quem está logado —
-- vale tanto para o painel quanto para o cliente no portal)
DROP POLICY IF EXISTS "anexos leitura publica"   ON storage.objects;
DROP POLICY IF EXISTS "anexos upload logado"     ON storage.objects;
DROP POLICY IF EXISTS "anexos delete logado"     ON storage.objects;

CREATE POLICY "anexos leitura publica"
  ON storage.objects FOR SELECT TO public
  USING (bucket_id = 'anexos');

CREATE POLICY "anexos upload logado"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'anexos');

CREATE POLICY "anexos delete logado"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'anexos');


-- ── 3. FUNÇÕES DO PORTAL ────────────────────────────────────────

-- 3.1 Criar conversa com anexos
DROP FUNCTION IF EXISTS portal_criar_conversa(TEXT, TEXT);
DROP FUNCTION IF EXISTS portal_criar_conversa(TEXT, TEXT, JSONB);

CREATE FUNCTION portal_criar_conversa(
  p_assunto TEXT,
  p_mensagem TEXT,
  p_anexos JSONB DEFAULT '[]'::jsonb
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
  SELECT instagram INTO v_instagram
  FROM portal_clientes
  WHERE user_id = auth.uid();

  IF v_instagram IS NULL THEN
    RAISE EXCEPTION 'Cliente não encontrado no portal';
  END IF;

  v_instagram_normalizado := REPLACE(v_instagram, '@', '');

  SELECT tenant_id INTO v_tenant_id FROM configuracoes LIMIT 1;

  IF v_tenant_id IS NULL THEN
    RAISE EXCEPTION 'Tenant não encontrado';
  END IF;

  INSERT INTO conversas (tenant_id, cliente_instagram, assunto, coluna, nao_lidas)
  VALUES (v_tenant_id, v_instagram_normalizado, p_assunto, 'Novo', 1)
  RETURNING id INTO v_conversa_id;

  INSERT INTO mensagens_contato (conversa_id, remetente, texto, anexos)
  VALUES (v_conversa_id, 'cliente', COALESCE(p_mensagem, ''), COALESCE(p_anexos, '[]'::jsonb));

  RETURN v_conversa_id;
END;
$$;

-- 3.2 Responder conversa com anexos
DROP FUNCTION IF EXISTS portal_responder_conversa(UUID, TEXT);
DROP FUNCTION IF EXISTS portal_responder_conversa(UUID, TEXT, JSONB);

CREATE FUNCTION portal_responder_conversa(
  p_conversa_id UUID,
  p_texto TEXT,
  p_anexos JSONB DEFAULT '[]'::jsonb
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

  v_instagram_normalizado := REPLACE(v_instagram, '@', '');

  SELECT EXISTS(
    SELECT 1 FROM conversas
    WHERE conversas.id = p_conversa_id
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
$$;

-- 3.3 Listar mensagens já com os anexos
DROP FUNCTION IF EXISTS portal_get_mensagens(UUID);

CREATE FUNCTION portal_get_mensagens(p_conversa_id UUID)
RETURNS TABLE(
  id UUID,
  remetente TEXT,
  texto TEXT,
  anexos JSONB,
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

  v_instagram_normalizado := REPLACE(v_instagram, '@', '');

  SELECT EXISTS(
    SELECT 1 FROM conversas
    WHERE conversas.id = p_conversa_id
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
    m.created_at
  FROM mensagens_contato m
  WHERE m.conversa_id = p_conversa_id
  ORDER BY m.created_at;
END;
$$;

-- 3.4 Lista de conversas — prévia mostra "Anexo" quando a última mensagem
--     for só arquivo, para não aparecer linha em branco
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
  WHERE REPLACE(c.cliente_instagram, '@', '') = v_instagram_normalizado
  ORDER BY c.updated_at DESC;
END;
$$;

GRANT EXECUTE ON FUNCTION portal_criar_conversa(TEXT, TEXT, JSONB)        TO authenticated;
GRANT EXECUTE ON FUNCTION portal_responder_conversa(UUID, TEXT, JSONB)    TO authenticated;
GRANT EXECUTE ON FUNCTION portal_get_mensagens(UUID)                      TO authenticated;
GRANT EXECUTE ON FUNCTION portal_get_minhas_conversas()                   TO authenticated;

-- Faz o PostgREST enxergar as funções e colunas novas na hora
NOTIFY pgrst, 'reload schema';

-- ════════════════════════════════════════════════════════════════
-- PRONTO. Se o bloco das políticas (passo 2) der erro de permissão,
-- crie o bucket `anexos` pelo painel (Storage > New bucket, público,
-- limite 10MB) e rode o resto do arquivo normalmente.
-- ════════════════════════════════════════════════════════════════
