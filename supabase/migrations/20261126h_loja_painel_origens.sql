-- ============================================================================
-- CORREÇÃO — "aggregate functions are not allowed in GROUP BY" no Painel
-- ============================================================================
-- Segundo tropeço da mesma função (o primeiro foi o `dia` ambíguo, em
-- 20261126g). No bloco "De onde vieram", o SELECT tinha uma coluna só:
--
--   SELECT jsonb_build_object('origem', coalesce(origem,'direto'),
--                             'visitas', count(*)::int) AS o
--     FROM eventos WHERE tipo = 'catalogo' GROUP BY 1
--
-- `GROUP BY 1` agrupa pela PRIMEIRA COLUNA DO SELECT — que aqui é o
-- jsonb_build_object inteiro, com o count(*) dentro. Agrupar por uma expressão
-- que contém agregação é proibido, e o painel voltava o erro em vez dos dados.
--
-- Nos outros dois `GROUP BY 1` da função (visitas por dia e pagos por dia) a
-- primeira coluna é a data, então aqueles estão certos.
--
-- Agora o agrupamento nomeia a expressão de verdade: coalesce(origem,'direto').
-- O resto da função é idêntico a 20261126g.
--
-- Idempotente: pode rodar de novo sem quebrar nada.
-- ============================================================================

CREATE OR REPLACE FUNCTION loja_painel(
  p_tenant_id uuid,
  p_desde date DEFAULT NULL,
  p_ate   date DEFAULT NULL
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
    -- Cada fonte com seu nome: a série é g(dia), e as subconsultas devolvem
    -- dia_visita e dia_pago. Três colunas `dia` no mesmo escopo foi o que
    -- derrubou a primeira versão.
    'por_dia', (
      SELECT coalesce(jsonb_agg(d ORDER BY d->>'dia'), '[]'::jsonb) FROM (
        SELECT jsonb_build_object(
                 -- ::date antes de ::text: generate_series devolve timestamp,
                 -- e sem isso o dia viria como "2026-11-26 00:00:00"
                 'dia', g.dia::date::text,
                 'visitas', coalesce(v.visitas, 0),
                 'pagos', coalesce(pg.pagos, 0),
                 'faturamento', coalesce(pg.faturamento, 0)
               ) AS d
          FROM generate_series(
                 v_inicio::date,
                 (v_fim - interval '1 day')::date,
                 interval '1 day'
               ) AS g(dia)
          LEFT JOIN (
            -- Aqui o GROUP BY 1 está certo: a primeira coluna é a data
            SELECT (criado_em AT TIME ZONE 'America/Sao_Paulo')::date AS dia_visita,
                   count(*) AS visitas
              FROM eventos WHERE tipo = 'catalogo' GROUP BY 1
          ) v ON v.dia_visita = g.dia::date
          LEFT JOIN (
            SELECT (pago_em AT TIME ZONE 'America/Sao_Paulo')::date AS dia_pago,
                   count(*) AS pagos, sum(total) AS faturamento
              FROM pedidos WHERE status = 'pago' AND pago_em IS NOT NULL GROUP BY 1
          ) pg ON pg.dia_pago = g.dia::date
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
    -- O agrupamento é pela origem, escrita por extenso. `GROUP BY 1` aqui
    -- apontava para o jsonb_build_object, que tem count(*) dentro.
    'origens', (
      SELECT coalesce(jsonb_agg(o ORDER BY (o->>'visitas')::int DESC), '[]'::jsonb) FROM (
        SELECT jsonb_build_object(
                 'origem',  coalesce(origem, 'direto'),
                 'visitas', count(*)::int
               ) AS o
          FROM eventos
         WHERE tipo = 'catalogo'
         GROUP BY coalesce(origem, 'direto')
      ) s
    )
  ) INTO v_result;

  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION loja_painel(uuid, date, date) FROM anon;
GRANT EXECUTE ON FUNCTION loja_painel(uuid, date, date) TO authenticated;

NOTIFY pgrst, 'reload schema';

-- ============================================================================
-- CONFERÊNCIA — roda a função e mostra o resumo (troque o tenant se precisar)
-- ============================================================================
-- SELECT loja_painel(
--   (SELECT tenant_id FROM configuracoes WHERE nome_loja ILIKE 'EA SECOND HAND' LIMIT 1)
-- );
-- ============================================================================
-- FIM DA MIGRATION
-- ============================================================================
