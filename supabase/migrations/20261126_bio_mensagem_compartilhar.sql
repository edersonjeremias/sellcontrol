-- ============================================================================
-- LINK DA BIO — a mensagem que acompanha o link ao compartilhar
-- ============================================================================
-- Compartilhar mandando só o endereço entrega uma linha azul sem contexto na
-- conversa. Com uma frase antes, quem recebe sabe de quem é a loja e por que
-- deve tocar — e a loja escreve essa frase com as próprias palavras.
--
-- Vazia, o sistema monta uma frase a partir do nome da página. Ninguém
-- precisa preencher para o botão funcionar.
--
-- Idempotente.
-- ============================================================================

ALTER TABLE bio_paginas
  ADD COLUMN IF NOT EXISTS mensagem_compartilhar text;

COMMENT ON COLUMN bio_paginas.mensagem_compartilhar IS
  'Texto enviado junto com o link no botão de compartilhar. Vazio, o sistema monta a partir do título.';

-- ─────────────────────────────────────────────────────────────────────────────
-- A função pública, agora devolvendo a mensagem
-- ─────────────────────────────────────────────────────────────────────────────
-- Recriada inteira de propósito: ver a resposta completa num lugar só é o que
-- evita que um campo novo entre na tabela e fique faltando aqui.
CREATE OR REPLACE FUNCTION bio_publica(p_slug text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_pagina bio_paginas;
  v_links  jsonb;
BEGIN
  SELECT * INTO v_pagina
    FROM bio_paginas
   WHERE lower(slug) = lower(btrim(coalesce(p_slug, '')))
   LIMIT 1;

  IF v_pagina.id IS NULL THEN
    RETURN jsonb_build_object('encontrada', false);
  END IF;

  -- Fora do ar: a página avisa, em vez de mostrar uma lista vazia que
  -- pareceria erro de quem clicou.
  IF NOT v_pagina.ativa THEN
    RETURN jsonb_build_object('encontrada', true, 'ativa', false);
  END IF;

  -- Link desligado ou sem destino não sai daqui: na página ele seria um
  -- botão que não leva a lugar nenhum.
  SELECT coalesce(
           jsonb_agg(
             jsonb_build_object(
               'id',        l.id,
               'grupo',     l.grupo,
               'tipo',      l.tipo,
               'titulo',    l.titulo,
               'subtitulo', l.subtitulo,
               'url',       l.url,
               'destaque',  l.destaque
             )
             ORDER BY l.ordem, l.created_at
           ),
           '[]'::jsonb
         )
    INTO v_links
    FROM bio_links l
   WHERE l.tenant_id = v_pagina.tenant_id
     AND l.ativo
     AND coalesce(btrim(l.url), '') <> '';

  RETURN jsonb_build_object(
    'encontrada', true,
    'ativa', true,
    'pagina', jsonb_build_object(
      'slug',                  v_pagina.slug,
      'titulo',                v_pagina.titulo,
      'descricao',             v_pagina.descricao,
      'logo_url',              v_pagina.logo_url,
      'logo_formato',          v_pagina.logo_formato,
      'fundo_tipo',            v_pagina.fundo_tipo,
      'cor_fundo',             v_pagina.cor_fundo,
      'cor_fundo2',            v_pagina.cor_fundo2,
      'cor_texto',             v_pagina.cor_texto,
      'cor_botao',             v_pagina.cor_botao,
      'cor_texto_botao',       v_pagina.cor_texto_botao,
      'botao_estilo',          v_pagina.botao_estilo,
      'botao_raio',            v_pagina.botao_raio,
      'mostrar_compartilhar',  v_pagina.mostrar_compartilhar,
      'mostrar_marca',         v_pagina.mostrar_marca,
      'mensagem_compartilhar', v_pagina.mensagem_compartilhar
    ),
    'links', v_links
  );
END;
$$;

GRANT EXECUTE ON FUNCTION bio_publica(text) TO anon, authenticated;
