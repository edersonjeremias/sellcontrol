-- ============================================================================
-- LINK DA BIO — a página de links que vai na bio do Instagram
-- ============================================================================
-- O mesmo papel do Linktree, dentro do sistema: a loja monta a própria página
-- com logo, redes e botões, e divulga /bio/<slug>. Sem propaganda de terceiro
-- e sem a loja depender de uma conta fora daqui.
--
-- Multi-tenant: uma página por empresa, com slug próprio. O slug é endereço
-- público, então é único no sistema inteiro, não por tenant.
--
-- A página aberta NÃO lê estas tabelas direto: quem responde é a função
-- bio_publica, que devolve só o que a página mostra (sem tenant_id, sem
-- contagem de cliques, sem o que está desligado).
--
-- Idempotente: pode rodar de novo sem quebrar nada.
-- ============================================================================

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. A PÁGINA
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS bio_paginas (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id            uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,

  -- Endereço público: /bio/<slug>
  slug                 text NOT NULL,
  ativa                boolean NOT NULL DEFAULT false,

  -- Identidade
  titulo               text,
  descricao            text,
  logo_url             text,
  logo_formato         text NOT NULL DEFAULT 'circulo',      -- circulo | quadrado

  -- Aparência
  fundo_tipo           text NOT NULL DEFAULT 'cor',          -- cor | gradiente
  cor_fundo            text NOT NULL DEFAULT '#121212',
  cor_fundo2           text NOT NULL DEFAULT '#2a2a2a',      -- só no gradiente
  cor_texto            text NOT NULL DEFAULT '#ffffff',
  cor_botao            text NOT NULL DEFAULT '#1e1e1e',
  cor_texto_botao      text NOT NULL DEFAULT '#ffffff',
  botao_estilo         text NOT NULL DEFAULT 'solido',       -- solido | contorno | suave
  botao_raio           text NOT NULL DEFAULT 'arredondado',  -- reto | arredondado | pilula

  -- Extras
  mostrar_compartilhar boolean NOT NULL DEFAULT true,
  mostrar_marca        boolean NOT NULL DEFAULT true,

  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now()
);

-- Uma página por empresa
CREATE UNIQUE INDEX IF NOT EXISTS idx_bio_paginas_tenant
  ON bio_paginas (tenant_id);

-- O slug é o endereço: duas empresas não podem dividir o mesmo.
-- Sem lower(), "EaSecond" e "easecond" abririam páginas diferentes.
CREATE UNIQUE INDEX IF NOT EXISTS idx_bio_paginas_slug
  ON bio_paginas (lower(slug));

COMMENT ON TABLE  bio_paginas IS 'Página de links públicos (link da bio) de cada empresa.';
COMMENT ON COLUMN bio_paginas.slug IS 'Endereço público: /bio/<slug>. Único no sistema inteiro.';
COMMENT ON COLUMN bio_paginas.ativa IS 'Desligada, /bio/<slug> responde que a página está fora do ar.';

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. OS LINKS
-- ─────────────────────────────────────────────────────────────────────────────
-- Dois grupos na mesma tabela, porque a edição é idêntica:
--   social → ícone pequeno na linha abaixo do nome
--   botao  → botão largo no corpo da página
CREATE TABLE IF NOT EXISTS bio_links (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id  uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,

  grupo      text NOT NULL DEFAULT 'botao',  -- botao | social
  -- link | loja | whatsapp | instagram | tiktok | facebook | youtube
  -- | email | telefone | endereco | portal
  tipo       text NOT NULL DEFAULT 'link',

  titulo     text,
  subtitulo  text,
  url        text,

  ativo      boolean NOT NULL DEFAULT true,
  destaque   boolean NOT NULL DEFAULT false,
  ordem      integer NOT NULL DEFAULT 0,
  cliques    integer NOT NULL DEFAULT 0,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- A página monta a lista por grupo e ordem: é sempre esta leitura
CREATE INDEX IF NOT EXISTS idx_bio_links_tenant
  ON bio_links (tenant_id, grupo, ordem);

COMMENT ON COLUMN bio_links.grupo IS 'social = ícone no topo; botao = botão largo no corpo.';
COMMENT ON COLUMN bio_links.tipo IS 'Define o ícone e como a URL foi montada (whatsapp vira wa.me, etc).';
COMMENT ON COLUMN bio_links.cliques IS 'Quantas vezes o link foi aberto. Contado pela função bio_clique.';

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. updated_at
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION bio_set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_bio_paginas_updated_at ON bio_paginas;
CREATE TRIGGER trg_bio_paginas_updated_at
  BEFORE UPDATE ON bio_paginas
  FOR EACH ROW EXECUTE FUNCTION bio_set_updated_at();

DROP TRIGGER IF EXISTS trg_bio_links_updated_at ON bio_links;
CREATE TRIGGER trg_bio_links_updated_at
  BEFORE UPDATE ON bio_links
  FOR EACH ROW EXECUTE FUNCTION bio_set_updated_at();

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. RLS — o painel mexe só na própria empresa; a página aberta não entra aqui
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE bio_paginas ENABLE ROW LEVEL SECURITY;
ALTER TABLE bio_links   ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS bio_paginas_tenant ON bio_paginas;
CREATE POLICY bio_paginas_tenant ON bio_paginas
  FOR ALL TO authenticated
  USING      (tenant_id IN (SELECT tenant_id FROM users_perfil WHERE id = auth.uid()))
  WITH CHECK (tenant_id IN (SELECT tenant_id FROM users_perfil WHERE id = auth.uid()));

DROP POLICY IF EXISTS bio_links_tenant ON bio_links;
CREATE POLICY bio_links_tenant ON bio_links
  FOR ALL TO authenticated
  USING      (tenant_id IN (SELECT tenant_id FROM users_perfil WHERE id = auth.uid()))
  WITH CHECK (tenant_id IN (SELECT tenant_id FROM users_perfil WHERE id = auth.uid()));

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. A PÁGINA ABERTA — uma função, uma resposta
-- ─────────────────────────────────────────────────────────────────────────────
-- Devolve o que /bio/<slug> mostra. O tenant_id e a contagem de cliques não
-- saem daqui: quem abre o link não tem o que fazer com eles.
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
      'slug',                 v_pagina.slug,
      'titulo',               v_pagina.titulo,
      'descricao',            v_pagina.descricao,
      'logo_url',             v_pagina.logo_url,
      'logo_formato',         v_pagina.logo_formato,
      'fundo_tipo',           v_pagina.fundo_tipo,
      'cor_fundo',            v_pagina.cor_fundo,
      'cor_fundo2',           v_pagina.cor_fundo2,
      'cor_texto',            v_pagina.cor_texto,
      'cor_botao',            v_pagina.cor_botao,
      'cor_texto_botao',      v_pagina.cor_texto_botao,
      'botao_estilo',         v_pagina.botao_estilo,
      'botao_raio',           v_pagina.botao_raio,
      'mostrar_compartilhar', v_pagina.mostrar_compartilhar,
      'mostrar_marca',        v_pagina.mostrar_marca
    ),
    'links', v_links
  );
END;
$$;

-- Conta o clique. Sem retorno útil de propósito: é um aviso, não uma consulta,
-- e a página não espera a resposta para abrir o link.
CREATE OR REPLACE FUNCTION bio_clique(p_link_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE bio_links
     SET cliques = cliques + 1
   WHERE id = p_link_id
     AND ativo;
END;
$$;

GRANT EXECUTE ON FUNCTION bio_publica(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION bio_clique(uuid)  TO anon, authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 6. STORAGE — o logo da página
-- ─────────────────────────────────────────────────────────────────────────────
-- Bucket público: o logo aparece para quem não tem login nenhum. SVG fica de
-- fora de propósito — é XML com script dentro, e aqui ele seria servido a
-- qualquer um.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'bio-imagens', 'bio-imagens', true, 5242880,
  ARRAY['image/jpeg', 'image/png', 'image/webp']
)
ON CONFLICT (id) DO UPDATE
  SET public             = TRUE,
      file_size_limit    = 5242880,
      allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'image/webp'];

-- A primeira pasta do caminho é o tenant_id: cada empresa só mexe na sua.
DROP POLICY IF EXISTS "bio_imagens_select" ON storage.objects;
DROP POLICY IF EXISTS "bio_imagens_insert" ON storage.objects;
DROP POLICY IF EXISTS "bio_imagens_update" ON storage.objects;
DROP POLICY IF EXISTS "bio_imagens_delete" ON storage.objects;

CREATE POLICY "bio_imagens_select" ON storage.objects
  FOR SELECT TO public
  USING (bucket_id = 'bio-imagens');

CREATE POLICY "bio_imagens_insert" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'bio-imagens'
    AND (
      (storage.foldername(name))[1] = public.get_tenant_id()::text
      OR public.get_user_role() = 'master'
    )
  );

CREATE POLICY "bio_imagens_update" ON storage.objects
  FOR UPDATE TO authenticated
  USING (
    bucket_id = 'bio-imagens'
    AND (
      (storage.foldername(name))[1] = public.get_tenant_id()::text
      OR public.get_user_role() = 'master'
    )
  );

CREATE POLICY "bio_imagens_delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'bio-imagens'
    AND (
      (storage.foldername(name))[1] = public.get_tenant_id()::text
      OR public.get_user_role() = 'master'
    )
  );
