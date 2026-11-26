-- ============================================================================
-- MÓDULOS POR EMPRESA — o que cada empresa contratou da assinatura
-- ============================================================================
-- O sistema é vendido por mês e cada empresa paga pelo que usa. Até aqui, o
-- que a empresa podia abrir vivia só na tabela `pages` (as telas de menu) e
-- os canais públicos (loja, link da bio, portal, link de frete, rastreio) não
-- tinham trava nenhuma: bastava saber o endereço.
--
-- Esta migration cria o lugar único onde isso fica registrado:
--
--   tenant_modulos — uma linha por (empresa, módulo), com ativo e preço
--
-- O catálogo do que existe para vender fica no código (src/lib/modulos.js).
-- Aqui guardamos só o que cada empresa tem e quanto paga por isso, porque é
-- o que o banco precisa saber para barrar o acesso.
--
-- REGRA DE OURO: sem linha ativa em tenant_modulos, o módulo não existe para
-- a empresa. Empresa nova começa sem nada além do essencial — é o master que
-- liga o que foi negociado.
--
-- `pages` continua existindo e continua mandando no menu e nas permissões de
-- cada usuário. A diferença é que ela passa a ser consequência: habilitar um
-- módulo de página cria a linha em `pages`, desabilitar remove.
--
-- Idempotente: pode rodar de novo sem quebrar nada.
-- ============================================================================

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. A TABELA
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS tenant_modulos (
  tenant_id     uuid    NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,

  -- O mesmo slug do catálogo em src/lib/modulos.js. Para módulo de página é
  -- também o slug em `pages` e a rota (/<slug>).
  slug          text    NOT NULL,

  ativo         boolean NOT NULL DEFAULT false,

  -- Preço negociado com esta empresa. NULL = o preço padrão do catálogo.
  -- Fica aqui, e não no catálogo, porque cada empresa negocia o seu.
  preco_mensal  numeric(10,2),

  habilitado_em timestamptz,

  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),

  PRIMARY KEY (tenant_id, slug)
);

COMMENT ON TABLE  tenant_modulos IS 'O que cada empresa contratou da assinatura. Sem linha ativa, o módulo não existe para ela.';
COMMENT ON COLUMN tenant_modulos.slug IS 'Slug do catálogo (src/lib/modulos.js). Em módulo de página, é também a rota.';
COMMENT ON COLUMN tenant_modulos.preco_mensal IS 'Preço negociado com esta empresa. NULL = preço padrão do catálogo.';

-- A pergunta mais feita é "o que esta empresa tem ligado"
CREATE INDEX IF NOT EXISTS idx_tenant_modulos_ativos
  ON tenant_modulos (tenant_id) WHERE ativo;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. updated_at
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION tenant_modulos_set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_tenant_modulos_updated_at ON tenant_modulos;
CREATE TRIGGER trg_tenant_modulos_updated_at
  BEFORE UPDATE ON tenant_modulos
  FOR EACH ROW EXECUTE FUNCTION tenant_modulos_set_updated_at();

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. RLS — contrato e preço são assunto do dono do sistema
-- ─────────────────────────────────────────────────────────────────────────────
-- A tabela inteira é do master: é aqui que está quanto cada empresa paga.
-- A empresa não lê esta tabela; ela pergunta o que tem pela função
-- meus_modulos(), que devolve só os slugs e nenhum preço.
ALTER TABLE tenant_modulos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_modulos_master ON tenant_modulos;
CREATE POLICY tenant_modulos_master ON tenant_modulos
  FOR ALL TO authenticated
  USING      (public.get_user_role() = 'master')
  WITH CHECK (public.get_user_role() = 'master');

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. O QUE A EMPRESA TEM — sem preço
-- ─────────────────────────────────────────────────────────────────────────────
-- O sistema pergunta isto a cada login, para montar o menu e barrar a rota de
-- quem digita o endereço na mão. Devolve só os slugs ligados do próprio
-- tenant de quem está logado: nada de preço, nada de outra empresa.
CREATE OR REPLACE FUNCTION meus_modulos()
RETURNS SETOF text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT m.slug
    FROM tenant_modulos m
   WHERE m.ativo
     AND m.tenant_id = (SELECT tenant_id FROM users_perfil WHERE id = auth.uid());
$$;

COMMENT ON FUNCTION meus_modulos() IS 'Slugs dos módulos ligados para a empresa de quem está logado. Sem preço.';

GRANT EXECUTE ON FUNCTION meus_modulos() TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. A TRAVA DOS CANAIS PÚBLICOS
-- ─────────────────────────────────────────────────────────────────────────────
-- A loja, o link da bio, o portal, o link de frete e o rastreio abrem sem
-- login: a trava não pode morar no front, senão basta saber o endereço. Quem
-- responde a essas páginas (função SECURITY DEFINER ou Edge Function com
-- service role) chama esta função antes de devolver qualquer coisa.
CREATE OR REPLACE FUNCTION tenant_tem_modulo(p_tenant_id uuid, p_slug text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM tenant_modulos
     WHERE tenant_id = p_tenant_id
       AND slug = p_slug
       AND ativo
  );
$$;

COMMENT ON FUNCTION tenant_tem_modulo(uuid, text) IS 'A empresa contratou este módulo? Trava dos canais públicos (loja, bio, portal, frete, rastreio).';

GRANT EXECUTE ON FUNCTION tenant_tem_modulo(uuid, text) TO anon, authenticated, service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- 5.1 O PORTÃO DOS CANAIS QUE ABREM POR SLUG
-- ─────────────────────────────────────────────────────────────────────────────
-- O portal da cliente abre por /portal/<slug> e precisa do tenant_id para
-- montar a tela. Até aqui ele lia a view configuracoes_public, que não sabe
-- nada de contrato. Esta função resolve o slug e só responde se a empresa tem
-- o canal contratado — quem não tem recebe o mesmo que endereço inexistente.
CREATE OR REPLACE FUNCTION canal_publico(p_slug text, p_canal text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant_id uuid;
  v_nome      text;
BEGIN
  SELECT c.tenant_id, c.nome_loja
    INTO v_tenant_id, v_nome
    FROM configuracoes c
   WHERE lower(btrim(c.slug)) = lower(btrim(coalesce(p_slug, '')))
   LIMIT 1;

  IF v_tenant_id IS NULL THEN
    RETURN jsonb_build_object('encontrado', false);
  END IF;

  IF NOT tenant_tem_modulo(v_tenant_id, p_canal) THEN
    RETURN jsonb_build_object('encontrado', false);
  END IF;

  RETURN jsonb_build_object(
    'encontrado', true,
    'tenant_id',  v_tenant_id,
    'nome_loja',  v_nome
  );
END;
$$;

COMMENT ON FUNCTION canal_publico(text, text) IS 'Resolve o slug de um canal público (portal, loja) e só responde se a empresa contratou o módulo.';

GRANT EXECUTE ON FUNCTION canal_publico(text, text) TO anon, authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 6. AS EMPRESAS QUE JÁ EXISTEM — ninguém perde acesso hoje
-- ─────────────────────────────────────────────────────────────────────────────
-- Quem já está rodando continua igual: tudo que a empresa já podia abrir vira
-- módulo ligado. O preço fica NULL (= preço padrão do catálogo) e o master
-- ajusta empresa por empresa depois. Só empresa NOVA começa do zero.

-- 6.1 Toda página que a empresa já tem em `pages`.
--     master/empresas, admin e debug ficam de fora: são telas do dono do
--     sistema, não módulo de venda.
INSERT INTO tenant_modulos (tenant_id, slug, ativo, habilitado_em)
SELECT DISTINCT p.tenant_id, p.slug, true, now()
  FROM pages p
 WHERE p.slug NOT IN ('master/empresas', 'admin', 'debug')
ON CONFLICT (tenant_id, slug) DO NOTHING;

-- 6.2 O essencial, que vai junto com a assinatura e nunca é desligado.
--     A lista também está em src/lib/modulos.js (campo essencial) — são duas
--     linhas, e aqui elas garantem que ninguém fique trancado fora.
INSERT INTO tenant_modulos (tenant_id, slug, ativo, preco_mensal, habilitado_em)
SELECT t.id, s.slug, true, 0, now()
  FROM tenants t
 CROSS JOIN (VALUES ('dashboard'), ('configuracoes')) AS s(slug)
ON CONFLICT (tenant_id, slug) DO UPDATE
  SET ativo = true,
      habilitado_em = COALESCE(tenant_modulos.habilitado_em, now());

-- 6.3 Loja: liga para quem já tem endereço de loja configurado.
INSERT INTO tenant_modulos (tenant_id, slug, ativo, habilitado_em)
SELECT c.tenant_id, 'loja', true, now()
  FROM configuracoes c
 WHERE COALESCE(btrim(c.slug), '') <> ''
ON CONFLICT (tenant_id, slug) DO NOTHING;

-- 6.4 Link da bio: liga para quem já montou a página.
--     A tabela só existe depois da migration do link da bio.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables
              WHERE table_schema = 'public' AND table_name = 'bio_paginas') THEN
    INSERT INTO tenant_modulos (tenant_id, slug, ativo, habilitado_em)
    SELECT DISTINCT b.tenant_id, 'bio', true, now()
      FROM bio_paginas b
    ON CONFLICT (tenant_id, slug) DO NOTHING;
  END IF;
END $$;

-- 6.5 Portal, link de frete e rastreio: já estão em uso pelas clientes das
--     empresas de hoje. Desligar agora quebraria link já enviado no WhatsApp.
INSERT INTO tenant_modulos (tenant_id, slug, ativo, habilitado_em)
SELECT t.id, s.slug, true, now()
  FROM tenants t
 CROSS JOIN (VALUES ('portal'), ('frete-link'), ('rastreio')) AS s(slug)
ON CONFLICT (tenant_id, slug) DO NOTHING;

-- ─────────────────────────────────────────────────────────────────────────────
-- 7. LINK DA BIO — a página aberta passa a conferir o contrato
-- ─────────────────────────────────────────────────────────────────────────────
-- Empresa sem o módulo responde o mesmo que endereço inexistente. Dizer
-- "existe, mas não pagou" entregaria o cliente dela a quem perguntasse.
--
-- A função é recriada inteira (é o jeito de ver a resposta completa num lugar
-- só), partindo da versão de 20261126_bio_mensagem_compartilhar.sql. Por isso
-- aquela migration tem que ter rodado antes: se a coluna
-- bio_paginas.mensagem_compartilhar não estiver lá, paramos aqui em vez de
-- publicar uma função que quebra na primeira visita à página.
DO $$
BEGIN
  -- Bio nunca instalado nesta base: não há o que travar.
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables
                  WHERE table_schema = 'public' AND table_name = 'bio_paginas') THEN
    RAISE NOTICE 'bio_paginas não existe — nada a fazer no link da bio.';
    RETURN;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                  WHERE table_schema = 'public'
                    AND table_name = 'bio_paginas'
                    AND column_name = 'mensagem_compartilhar') THEN
    RAISE EXCEPTION 'Rode primeiro a migration 20261126_bio_mensagem_compartilhar.sql e execute esta de novo.';
  END IF;

  CREATE OR REPLACE FUNCTION bio_publica(p_slug text)
  RETURNS jsonb
  LANGUAGE plpgsql
  STABLE
  SECURITY DEFINER
  SET search_path = public
  AS $fn$
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

    -- Sem o módulo na assinatura, a página não existe para quem abre.
    IF NOT tenant_tem_modulo(v_pagina.tenant_id, 'bio') THEN
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
  $fn$;

  GRANT EXECUTE ON FUNCTION bio_publica(text) TO anon, authenticated;
END $$;

-- ============================================================================
-- CONFERÊNCIA — o que cada empresa tem ligado e quantos módulos são
-- ============================================================================
-- SELECT c.nome_loja,
--        count(*) FILTER (WHERE m.ativo) AS modulos_ligados
--   FROM tenant_modulos m
--   JOIN configuracoes c ON c.tenant_id = m.tenant_id
--  GROUP BY c.nome_loja
--  ORDER BY c.nome_loja;
-- ============================================================================
-- FIM DA MIGRATION
-- ============================================================================
