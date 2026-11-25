-- ============================================================
-- ENCERRAMENTO AUTOMÁTICO DA SACOLINHA
--
-- A loja guarda a sacolinha por um prazo, mas tem cliente que esquece de
-- pedir o envio e a peça fica parada. Esta rotina encerra sozinha: cria o
-- pedido na página de Produção quando a peça mais antiga da cliente passa
-- do prazo, e marca o pedido como automático para a equipe saber explicar
-- à cliente que não foi ela quem pediu.
--
-- Tudo é por empresa, em configuracoes:
--   sacolinha_encerrar_auto  — liga ou desliga a rotina (nasce desligada)
--   sacolinha_prazo_dias     — o prazo (60 dias ≈ 2 meses)
--
-- Cole e execute no SQL Editor do Supabase.
-- ============================================================

-- 1) Configuração por empresa
ALTER TABLE configuracoes
  ADD COLUMN IF NOT EXISTS sacolinha_encerrar_auto BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS sacolinha_prazo_dias    INTEGER DEFAULT 60;

COMMENT ON COLUMN configuracoes.sacolinha_encerrar_auto IS
  'Encerrar a sacolinha sozinho quando a peça mais antiga passa do prazo';
COMMENT ON COLUMN configuracoes.sacolinha_prazo_dias IS
  'Dias que a loja guarda a sacolinha antes de encerrar sozinha';

-- 2) Marca do pedido criado pela rotina
ALTER TABLE producao_pedidos
  ADD COLUMN IF NOT EXISTS encerrado_automatico BOOLEAN DEFAULT FALSE;

COMMENT ON COLUMN producao_pedidos.encerrado_automatico IS
  'Pedido criado pela rotina de prazo, não pela cliente. A equipe vê o selo na tela';

-- 3) A rotina
--
-- Devolve uma linha por cliente encerrada, para a tela poder avisar.
-- É idempotente: não encerra duas vezes a mesma cliente dentro do prazo,
-- nem encerra quem já tem pedido em aberto esperando montagem.
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
    -- Mesma regra da coluna PEÇAS: o que ainda espera envio
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
          )) NOT IN ('ENVIADO', 'CANCELADO', 'DEVOLUCAO', 'GERAR CREDITO', 'CREDITO GERADO')
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

-- ============================================================
-- 4) Colunas opcionais da Produção: a escolha passa a ser da empresa
--
-- A engrenagem guardava a escolha no navegador, então cada aparelho — e
-- cada limpeza de cache — voltava a mostrar Peso e Pacote. Guardada aqui,
-- vale para todo mundo e sobrevive a trocar de computador.
-- ============================================================
ALTER TABLE configuracoes
  ADD COLUMN IF NOT EXISTS producao_colunas JSONB;

COMMENT ON COLUMN configuracoes.producao_colunas IS
  'Colunas opcionais da página de Produção, ex: {"peso": false, "pacote": true}';

NOTIFY pgrst, 'reload schema';
