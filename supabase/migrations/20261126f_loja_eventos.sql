-- ============================================================================
-- PAINEL DA LOJA — quem entrou, o que olhou e o que virou venda
-- ============================================================================
-- A loja não deixava rastro: dava para saber o que vendeu, nunca quantas
-- pessoas entraram e desistiram. Sem isso não há como responder a pergunta
-- que decide a divulgação — de cada cem que entram, quantas compram.
--
-- A visita é registrada pela Edge Function da loja, no servidor. Não há script
-- de rastreio na página: bloqueador de anúncio derruba script de terceiro e o
-- número sairia menor que o real, além de não cruzar com venda nenhuma.
--
-- O resto do funil já existia em loja_pedidos: sacola montada é um pedido em
-- 'carrinho', e pago é 'pago'. Aqui só se acrescenta a ponta de cima.
--
-- NÃO guardamos IP, nome nem nada que identifique a pessoa: o visitante é um
-- número sorteado no navegador dela, que serve para não contar a mesma pessoa
-- dez vezes e para nada além disso.
--
-- Idempotente.
-- ============================================================================

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. O registro
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS loja_eventos (
  id         bigserial PRIMARY KEY,
  tenant_id  uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,

  -- 'catalogo' = abriu a vitrine | 'peca' = abriu a página de uma peça
  tipo       text NOT NULL,

  produto_id uuid REFERENCES produtos(id) ON DELETE SET NULL,
  codigo     text,

  -- Número sorteado no navegador da visitante. Não identifica ninguém: serve
  -- para separar "100 visitas" de "100 pessoas".
  visitante  text,

  -- De onde ela veio: instagram, whatsapp, google, direto, outro
  origem     text,

  criado_em  timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE loja_eventos IS
  'Visitas da loja pública. Sem dado pessoal: o visitante é um número sorteado no navegador.';

CREATE INDEX IF NOT EXISTS idx_loja_eventos_tenant_data
  ON loja_eventos (tenant_id, criado_em DESC);

CREATE INDEX IF NOT EXISTS idx_loja_eventos_produto
  ON loja_eventos (tenant_id, produto_id, criado_em DESC)
  WHERE produto_id IS NOT NULL;

ALTER TABLE loja_eventos ENABLE ROW LEVEL SECURITY;

-- Quem grava é a Edge Function (service role, ignora RLS). O painel lê os
-- eventos da própria empresa, como nas demais tabelas.
DROP POLICY IF EXISTS loja_eventos_tenant ON loja_eventos;
CREATE POLICY loja_eventos_tenant ON loja_eventos
  FOR SELECT TO authenticated
  USING (tenant_id IN (SELECT tenant_id FROM users_perfil WHERE id = auth.uid()));

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Registrar a visita
-- ─────────────────────────────────────────────────────────────────────────────
-- Guarda uma visita por visitante a cada 30 minutos no mesmo alvo. Sem isso,
-- quem volta ao catálogo depois de olhar três peças contaria quatro visitas, e
-- a taxa de conversão sairia menor do que é.
CREATE OR REPLACE FUNCTION loja_registrar_evento(
  p_tenant_id  uuid,
  p_tipo       text,
  p_produto_id uuid    DEFAULT NULL,
  p_codigo     text    DEFAULT NULL,
  p_visitante  text    DEFAULT NULL,
  p_origem     text    DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_visitante text := nullif(btrim(coalesce(p_visitante, '')), '');
BEGIN
  IF p_tenant_id IS NULL OR p_tipo NOT IN ('catalogo', 'peca') THEN
    RETURN;
  END IF;

  IF v_visitante IS NOT NULL AND EXISTS (
    SELECT 1 FROM loja_eventos e
     WHERE e.tenant_id = p_tenant_id
       AND e.tipo = p_tipo
       AND e.visitante = v_visitante
       AND e.produto_id IS NOT DISTINCT FROM p_produto_id
       AND e.criado_em > now() - interval '30 minutes'
  ) THEN
    RETURN;
  END IF;

  INSERT INTO loja_eventos (tenant_id, tipo, produto_id, codigo, visitante, origem)
  VALUES (
    p_tenant_id,
    p_tipo,
    p_produto_id,
    nullif(btrim(coalesce(p_codigo, '')), ''),
    v_visitante,
    coalesce(nullif(btrim(coalesce(p_origem, '')), ''), 'direto')
  );
END;
$$;

REVOKE ALL ON FUNCTION loja_registrar_evento(uuid, text, uuid, text, text, text) FROM anon, authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. O painel
-- ─────────────────────────────────────────────────────────────────────────────
-- Uma função só, uma ida ao banco: a tela mostra tudo junto e separar em sete
-- consultas deixaria o painel montando aos pedaços na frente de quem abriu.
--
-- O período é fechado nas duas pontas, em data (não em hora): quem escolhe
-- "26/11 a 26/11" quer o dia inteiro.
CREATE OR REPLACE FUNCTION loja_painel(
  p_tenant_id uuid,
  p_desde     date,
  p_ate       date
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_inicio timestamptz;
  v_fim    timestamptz;
  v_result jsonb;
BEGIN
  -- Só quem é da empresa enxerga o painel dela. SECURITY DEFINER ignora RLS,
  -- então a checagem tem de ser feita aqui dentro.
  IF NOT EXISTS (
    SELECT 1 FROM users_perfil u
     WHERE u.id = auth.uid()
       AND (u.tenant_id = p_tenant_id OR u.role = 'master')
  ) THEN
    RAISE EXCEPTION 'Sem acesso ao painel desta empresa';
  END IF;

  v_inicio := (coalesce(p_desde, (now() AT TIME ZONE 'America/Sao_Paulo')::date - 29))::timestamptz;
  v_fim    := ((coalesce(p_ate, (now() AT TIME ZONE 'America/Sao_Paulo')::date) + 1))::timestamptz;

  WITH eventos AS (
    SELECT * FROM loja_eventos
     WHERE tenant_id = p_tenant_id
       AND criado_em >= v_inicio
       AND criado_em < v_fim
  ),
  pedidos AS (
    SELECT * FROM loja_pedidos
     WHERE tenant_id = p_tenant_id
       AND created_at >= v_inicio
       AND created_at < v_fim
  )
  SELECT jsonb_build_object(
    -- ── Topo do funil ──────────────────────────────────────────────────────
    'visitas',        (SELECT count(*) FROM eventos WHERE tipo = 'catalogo'),
    'visitantes',     (SELECT count(DISTINCT visitante) FROM eventos WHERE visitante IS NOT NULL),
    'pecas_vistas',   (SELECT count(*) FROM eventos WHERE tipo = 'peca'),

    -- ── Funil de compra ────────────────────────────────────────────────────
    'sacolas',        (SELECT count(*) FROM pedidos p
                        WHERE EXISTS (SELECT 1 FROM loja_pedido_itens i WHERE i.pedido_id = p.id)),
    'checkouts',      (SELECT count(*) FROM pedidos WHERE status IN ('aguardando_pagamento', 'pago')),
    'pagos',          (SELECT count(*) FROM pedidos WHERE status = 'pago'),
    'abandonadas',    (SELECT count(*) FROM pedidos WHERE status = 'expirado'),

    -- ── Dinheiro ───────────────────────────────────────────────────────────
    'faturamento',    (SELECT coalesce(sum(total), 0) FROM pedidos WHERE status = 'pago'),
    'em_pecas',       (SELECT coalesce(sum(valor_itens), 0) FROM pedidos WHERE status = 'pago'),
    'em_frete',       (SELECT coalesce(sum(valor_frete), 0) FROM pedidos WHERE status = 'pago'),
    'ticket',         (SELECT coalesce(avg(total), 0) FROM pedidos WHERE status = 'pago'),

    -- ── Dia a dia, para o gráfico ──────────────────────────────────────────
    'por_dia', (
      SELECT coalesce(jsonb_agg(d ORDER BY d->>'dia'), '[]'::jsonb) FROM (
        SELECT jsonb_build_object(
                 -- ::date antes de ::text: generate_series devolve timestamp,
                 -- e sem isso o dia viria como "2026-11-26 00:00:00"
                 'dia', dia::date::text,
                 'visitas', coalesce(v.visitas, 0),
                 'pagos', coalesce(pg.pagos, 0),
                 'faturamento', coalesce(pg.faturamento, 0)
               ) AS d
          FROM generate_series(v_inicio::date, (v_fim - interval '1 day')::date, interval '1 day') AS dia
          LEFT JOIN (
            SELECT (criado_em AT TIME ZONE 'America/Sao_Paulo')::date AS dia, count(*) AS visitas
              FROM eventos WHERE tipo = 'catalogo' GROUP BY 1
          ) v ON v.dia = dia::date
          LEFT JOIN (
            SELECT (pago_em AT TIME ZONE 'America/Sao_Paulo')::date AS dia,
                   count(*) AS pagos, sum(total) AS faturamento
              FROM pedidos WHERE status = 'pago' AND pago_em IS NOT NULL GROUP BY 1
          ) pg ON pg.dia = dia::date
      ) s
    ),

    -- ── Peças mais olhadas, com o que aconteceu depois ─────────────────────
    'mais_vistas', (
      SELECT coalesce(jsonb_agg(p ORDER BY (p->>'vistas')::int DESC), '[]'::jsonb) FROM (
        SELECT jsonb_build_object(
                 'produto_id', e.produto_id,
                 'codigo',     max(e.codigo),
                 'descricao',  max(coalesce(pr.produto, '') || ' ' || coalesce(pr.modelo, '') || ' ' || coalesce(pr.cor, '')),
                 'vistas',     count(*)::int,
                 'publicado',  bool_or(coalesce(pr.publicado_loja, false)),
                 'vendida',    EXISTS (
                   SELECT 1 FROM loja_pedido_itens i
                     JOIN loja_pedidos d ON d.id = i.pedido_id
                    WHERE i.produto_id = e.produto_id AND d.status = 'pago'
                 )
               ) AS p
          FROM eventos e
          LEFT JOIN produtos pr ON pr.id = e.produto_id
         WHERE e.tipo = 'peca' AND e.produto_id IS NOT NULL
         GROUP BY e.produto_id
         -- Ordenar antes de cortar: com LIMIT sem ORDER BY o banco escolhe
         -- 15 peças quaisquer, e a lista das "mais olhadas" sairia aleatória
         ORDER BY count(*) DESC
         LIMIT 15
      ) s
    ),

    -- ── De onde vieram ─────────────────────────────────────────────────────
    'origens', (
      SELECT coalesce(jsonb_agg(o ORDER BY (o->>'visitas')::int DESC), '[]'::jsonb) FROM (
        SELECT jsonb_build_object('origem', coalesce(origem, 'direto'), 'visitas', count(*)::int) AS o
          FROM eventos WHERE tipo = 'catalogo' GROUP BY 1
      ) s
    )
  ) INTO v_result;

  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION loja_painel(uuid, date, date) FROM anon;
GRANT EXECUTE ON FUNCTION loja_painel(uuid, date, date) TO authenticated;
