-- ============================================================================
-- CORRIGIR @INSTAGRAM TRUNCADOS EM 15 CARACTERES
-- ============================================================================
-- A primeira versao do importador do Bling usava a coluna "Codigo", que o
-- Bling corta no 15o caractere. Isso gravou @ pela metade (ex.: as vendas da
-- Rose sairam como _rose_ciavarell em vez de _rose_ciavarelli_).
-- ============================================================================

-- PASSO 1 - DETECCAO (nao altera nada)
WITH usados AS (
  SELECT tenant_id, cliente_nome AS arroba FROM vendas             WHERE length(cliente_nome)      = 15
  UNION SELECT tenant_id, cliente_nome      FROM producao_pedidos   WHERE length(cliente_nome)      = 15
  UNION SELECT tenant_id, cliente_nome      FROM pedidos_itens      WHERE length(cliente_nome)      = 15
  UNION SELECT tenant_id, cliente_instagram FROM enderecos_clientes WHERE length(cliente_instagram) = 15
  UNION SELECT tenant_id, cliente_instagram FROM romaneios          WHERE length(cliente_instagram) = 15
  UNION SELECT tenant_id, cliente           FROM cobrancas          WHERE length(cliente)           = 15
  UNION SELECT tenant_id, cliente           FROM creditos           WHERE length(cliente)           = 15
  UNION SELECT tenant_id, cliente           FROM creditos_historico WHERE length(cliente)           = 15
),
pares AS (
  SELECT u.tenant_id, u.arroba AS truncado, c.instagram AS completo,
         COUNT(*) OVER (PARTITION BY u.tenant_id, u.arroba) AS candidatos
  FROM usados u
  JOIN clientes c
    ON c.tenant_id = u.tenant_id
   AND left(c.instagram, 15) = u.arroba
   AND length(c.instagram) > 15
)
SELECT p.truncado, p.completo,
       CASE WHEN p.candidatos = 1 THEN 1 ELSE 0 END AS seguro,
       (SELECT COUNT(*) FROM vendas    v WHERE v.tenant_id = p.tenant_id AND v.cliente_nome = p.truncado) AS vendas,
       (SELECT COUNT(*) FROM cobrancas b WHERE b.tenant_id = p.tenant_id AND b.cliente      = p.truncado) AS cobrancas
FROM pares p
ORDER BY p.candidatos DESC, vendas DESC;


-- ────────────────────────────────────────────────────────────────────────────
-- PASSO 2 - CORRECAO EM MASSA
-- So trata os pares com candidatos = 1 (um unico cadastro completo possivel).
-- ────────────────────────────────────────────────────────────────────────────
BEGIN;

DO $$
DECLARE
  v_par  RECORD;
  v_alvo RECORD;
  v_id   UUID;
  v_bom  UUID;
  v_qtd  INTEGER;
BEGIN
  FOR v_par IN
    WITH usados AS (
      SELECT tenant_id, cliente_nome AS arroba FROM vendas             WHERE length(cliente_nome)      = 15
      UNION SELECT tenant_id, cliente_nome      FROM producao_pedidos   WHERE length(cliente_nome)      = 15
      UNION SELECT tenant_id, cliente_nome      FROM pedidos_itens      WHERE length(cliente_nome)      = 15
      UNION SELECT tenant_id, cliente_instagram FROM enderecos_clientes WHERE length(cliente_instagram) = 15
      UNION SELECT tenant_id, cliente_instagram FROM romaneios          WHERE length(cliente_instagram) = 15
      UNION SELECT tenant_id, cliente           FROM cobrancas          WHERE length(cliente)           = 15
      UNION SELECT tenant_id, cliente           FROM creditos           WHERE length(cliente)           = 15
      UNION SELECT tenant_id, cliente           FROM creditos_historico WHERE length(cliente)           = 15
    ),
    pares AS (
      SELECT u.tenant_id, u.arroba AS truncado, c.instagram AS completo,
             COUNT(*) OVER (PARTITION BY u.tenant_id, u.arroba) AS candidatos
      FROM usados u
      JOIN clientes c
        ON c.tenant_id = u.tenant_id
       AND left(c.instagram, 15) = u.arroba
       AND length(c.instagram) > 15
    )
    SELECT tenant_id, truncado, completo FROM pares WHERE candidatos = 1
  LOOP
    FOR v_alvo IN
      SELECT * FROM (VALUES
        ('vendas',             'cliente_nome'),
        ('producao_pedidos',   'cliente_nome'),
        ('pedidos_itens',      'cliente_nome'),
        ('enderecos_clientes', 'cliente_instagram'),
        ('romaneios',          'cliente_instagram'),
        ('cobrancas',          'cliente'),
        ('creditos',           'cliente'),
        ('creditos_historico', 'cliente')
      ) AS t(tabela, coluna)
    LOOP
      CONTINUE WHEN to_regclass('public.' || v_alvo.tabela) IS NULL;
      EXECUTE format('UPDATE %I SET %I = $1 WHERE tenant_id = $2 AND %I = $3',
                     v_alvo.tabela, v_alvo.coluna, v_alvo.coluna)
        USING v_par.completo, v_par.tenant_id, v_par.truncado;
      GET DIAGNOSTICS v_qtd = ROW_COUNT;
      IF v_qtd > 0 THEN
        RAISE NOTICE '% : % -> % (% linhas)', v_alvo.tabela, v_par.truncado, v_par.completo, v_qtd;
      END IF;
    END LOOP;

    SELECT id INTO v_bom FROM clientes WHERE tenant_id = v_par.tenant_id AND instagram = v_par.completo;
    SELECT id INTO v_id  FROM clientes WHERE tenant_id = v_par.tenant_id AND instagram = v_par.truncado;

    IF v_id IS NOT NULL AND v_bom IS NOT NULL THEN
      UPDATE clientes AS bom SET
        whatsapp      = COALESCE(NULLIF(bom.whatsapp, ''),      ruim.whatsapp),
        telefone      = COALESCE(NULLIF(bom.telefone, ''),      ruim.telefone),
        email         = COALESCE(NULLIF(bom.email, ''),         ruim.email),
        nome_completo = COALESCE(NULLIF(bom.nome_completo, ''), ruim.nome_completo),
        cpf_cnpj      = COALESCE(NULLIF(bom.cpf_cnpj, ''),      ruim.cpf_cnpj),
        data_cadastro = LEAST(bom.data_cadastro, ruim.data_cadastro),
        bloqueado     = bom.bloqueado OR ruim.bloqueado,
        msg_bloqueio  = COALESCE(NULLIF(bom.msg_bloqueio, ''),  ruim.msg_bloqueio)
      FROM clientes AS ruim
      WHERE ruim.id = v_id AND bom.id = v_bom;

      UPDATE vendas         SET cliente_id = v_bom WHERE cliente_id = v_id;
      UPDATE inadimplencias SET cliente_id = v_bom WHERE cliente_id = v_id;
      DELETE FROM clientes WHERE id = v_id;
      RAISE NOTICE 'cadastro truncado % removido', v_par.truncado;
    END IF;
  END LOOP;

  UPDATE vendas v SET cliente_id = c.id
  FROM clientes c
  WHERE c.tenant_id = v.tenant_id AND c.instagram = v.cliente_nome
    AND v.cliente_id IS DISTINCT FROM c.id;
END $$;

COMMIT;
