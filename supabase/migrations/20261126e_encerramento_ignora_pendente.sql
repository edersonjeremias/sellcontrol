-- ============================================================
-- ENCERRAMENTO AUTOMÁTICO: peça pendente ou com crédito não conta o prazo
--
-- Recria encerrar_sacolinhas_vencidas (de 20261125) mudando uma coisa: a
-- peça com status 'Pendente' sai da conta do prazo, como já saíam as de
-- 'Gerar Crédito' e 'Crédito gerado'.
--
-- Nenhuma delas é peça para enviar. Contando o prazo por elas, a rotina
-- encerrava a sacolinha de quem só tinha peça pendente e a Produção
-- recebia um pedido sem nada para montar.
--
-- A regra vale SÓ aqui. Na coluna PEÇAS, na lista que a seta abre e no
-- filtro "Não enviados" da Expedição a peça pendente continua aparecendo:
-- ela ainda tem que ser resolvida, e sumir da tela seria pior.
--
-- Efeito: quem só tem peça pendente ou com crédito nunca é encerrada
-- sozinha. Quem tem também peça normal é encerrada pelo prazo da peça
-- normal mais antiga.
--
-- Cole e execute no SQL Editor do Supabase.
-- ============================================================

CREATE OR REPLACE FUNCTION encerrar_sacolinhas_vencidas(p_tenant_id UUID)
RETURNS TABLE (cliente_nome TEXT, peca_mais_antiga DATE, pecas BIGINT)
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_ligado BOOLEAN;
  v_prazo  INTEGER;
  v_hoje   DATE := (now() AT TIME ZONE 'America/Sao_Paulo')::date;
BEGIN
  SELECT COALESCE(c.sacolinha_encerrar_auto, FALSE),
         GREATEST(COALESCE(c.sacolinha_prazo_dias, 60), 1)
    INTO v_ligado, v_prazo
    FROM configuracoes c
   WHERE c.tenant_id = p_tenant_id;

  IF NOT COALESCE(v_ligado, FALSE) THEN
    RETURN;
  END IF;

  RETURN QUERY
  WITH sacolinha AS (
    -- Só o que é peça para enviar de verdade. Pendente e crédito ficam de
    -- fora: não vão ser montadas, então não podem disparar o prazo.
    SELECT
      LOWER(TRIM(REPLACE(COALESCE(v.cliente_nome, ''), '@', ''))) AS slug,
      MIN(COALESCE(v.data_live, (v.created_at AT TIME ZONE 'America/Sao_Paulo')::date)) AS mais_antiga,
      COUNT(*) AS qtd
    FROM vendas v
    WHERE v.tenant_id = p_tenant_id
      AND COALESCE(v.etapa, '') <> 'rascunho'
      AND UPPER(TRANSLATE(
            TRIM(COALESCE(v.status, '')),
            'áàâãäéèêëíìîïóòôõöúùûüçÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇ',
            'aaaaaeeeeiiiiooooouuuucAAAAAEEEEIIIIOOOOOUUUUC'
          )) NOT IN (
            'ENVIADO', 'CANCELADO', 'DEVOLUCAO',
            'GERAR CREDITO', 'CREDITO GERADO',
            'PENDENTE'
          )
      AND TRIM(COALESCE(v.cliente_nome, '')) <> ''
    GROUP BY 1
  ),
  vencidas AS (
    SELECT s.*
      FROM sacolinha s
     WHERE s.mais_antiga IS NOT NULL
       AND s.mais_antiga + v_prazo <= v_hoje
       -- Já tem pedido esperando montagem: a sacolinha já está encerrada
       AND NOT EXISTS (
         SELECT 1 FROM producao_pedidos p
          WHERE p.tenant_id = p_tenant_id
            AND LOWER(TRIM(REPLACE(COALESCE(p.cliente_nome, ''), '@', ''))) = s.slug
            AND COALESCE(p.status_entrega, '') NOT IN ('Enviado', 'Retirou', 'Voltou estoque', 'Cliente Retira')
            AND COALESCE(p.status_prod, '') <> 'Repetido'
       )
       -- Sobrou peça velha depois de um envio? Não reabre todo dia:
       -- espera o prazo inteiro correr de novo.
       AND NOT EXISTS (
         SELECT 1 FROM producao_pedidos p
          WHERE p.tenant_id = p_tenant_id
            AND LOWER(TRIM(REPLACE(COALESCE(p.cliente_nome, ''), '@', ''))) = s.slug
            AND COALESCE(p.encerrado_automatico, FALSE)
            AND p.data_solicitado > v_hoje - v_prazo
       )
  ),
  criados AS (
    INSERT INTO producao_pedidos (tenant_id, cliente_nome, data_solicitado, encerrado_automatico)
    SELECT p_tenant_id, v.slug, v_hoje, TRUE
      FROM vencidas v
    RETURNING producao_pedidos.cliente_nome AS nome
  )
  -- Cast explícito: o tipo da coluna precisa casar com o RETURNS TABLE
  SELECT c.nome::TEXT, v.mais_antiga::DATE, v.qtd::BIGINT
    FROM criados c
    JOIN vencidas v ON v.slug = c.nome;
END;
$$;

GRANT EXECUTE ON FUNCTION encerrar_sacolinhas_vencidas(UUID) TO authenticated;

NOTIFY pgrst, 'reload schema';
