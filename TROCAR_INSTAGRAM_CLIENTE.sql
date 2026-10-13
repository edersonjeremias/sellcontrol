-- ============================================================================
-- TROCAR O @INSTAGRAM DE UM CLIENTE (e levar junto todo o histórico)
-- ============================================================================
-- Caso: as vendas foram lançadas em  rose_ciavarelli_
--       e precisam ficar em         _rose_ciavarelli_   (com underline na frente)
--
-- Para reaproveitar com outro cliente, troque os dois valores no PASSO 2.
-- Rode um passo de cada vez no SQL Editor do Supabase.
-- ============================================================================


-- ────────────────────────────────────────────────────────────────────────────
-- PASSO 1 — DIAGNÓSTICO (não altera nada, rode primeiro)
-- Mostra onde cada @ aparece hoje.
-- ────────────────────────────────────────────────────────────────────────────
SELECT 'clientes'           AS tabela, instagram         AS arroba, COUNT(*) AS registros FROM clientes            WHERE instagram         IN ('rose_ciavarelli_', '_rose_ciavarelli_') GROUP BY instagram
UNION ALL SELECT 'vendas',             cliente_nome,      COUNT(*) FROM vendas             WHERE cliente_nome      IN ('rose_ciavarelli_', '_rose_ciavarelli_') GROUP BY cliente_nome
UNION ALL SELECT 'producao_pedidos',   cliente_nome,      COUNT(*) FROM producao_pedidos   WHERE cliente_nome      IN ('rose_ciavarelli_', '_rose_ciavarelli_') GROUP BY cliente_nome
UNION ALL SELECT 'pedidos_itens',      cliente_nome,      COUNT(*) FROM pedidos_itens      WHERE cliente_nome      IN ('rose_ciavarelli_', '_rose_ciavarelli_') GROUP BY cliente_nome
UNION ALL SELECT 'enderecos_clientes', cliente_instagram, COUNT(*) FROM enderecos_clientes WHERE cliente_instagram IN ('rose_ciavarelli_', '_rose_ciavarelli_') GROUP BY cliente_instagram
UNION ALL SELECT 'romaneios',          cliente_instagram, COUNT(*) FROM romaneios          WHERE cliente_instagram IN ('rose_ciavarelli_', '_rose_ciavarelli_') GROUP BY cliente_instagram
UNION ALL SELECT 'cobrancas',          cliente,           COUNT(*) FROM cobrancas          WHERE cliente           IN ('rose_ciavarelli_', '_rose_ciavarelli_') GROUP BY cliente
UNION ALL SELECT 'creditos',           cliente,           COUNT(*) FROM creditos           WHERE cliente           IN ('rose_ciavarelli_', '_rose_ciavarelli_') GROUP BY cliente
UNION ALL SELECT 'creditos_historico', cliente,           COUNT(*) FROM creditos_historico WHERE cliente           IN ('rose_ciavarelli_', '_rose_ciavarelli_') GROUP BY cliente
UNION ALL SELECT 'portal_clientes',    instagram,         COUNT(*) FROM portal_clientes    WHERE instagram         IN ('rose_ciavarelli_', '_rose_ciavarelli_') GROUP BY instagram
ORDER BY tabela, arroba;


-- ────────────────────────────────────────────────────────────────────────────
-- PASSO 2 — A TROCA
-- Roda tudo dentro de uma transação: ou passa inteiro, ou não muda nada.
-- Funciona nos dois casos: se o @ novo ainda não existe, só renomeia;
-- se já existe (criado pela importação do Bling), junta os dois num só.
-- ────────────────────────────────────────────────────────────────────────────
BEGIN;

DO $$
DECLARE
  v_antigo    TEXT := 'rose_ciavarelli_';    -- <<< @ errado, de onde sai
  v_novo      TEXT := '_rose_ciavarelli_';   -- <<< @ certo, para onde vai

  v_alvo      RECORD;
  v_tenant    UUID;
  v_id_antigo UUID;
  v_id_novo   UUID;
  v_qtd       INTEGER;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM clientes WHERE instagram IN (v_antigo, v_novo)) THEN
    RAISE EXCEPTION 'Nenhum cliente encontrado com % nem com %', v_antigo, v_novo;
  END IF;

  -- 2.1 — Move o histórico: tudo que guarda o @ como texto
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

    EXECUTE format('UPDATE %I SET %I = $1 WHERE %I = $2', v_alvo.tabela, v_alvo.coluna, v_alvo.coluna)
      USING v_novo, v_antigo;

    GET DIAGNOSTICS v_qtd = ROW_COUNT;
    IF v_qtd > 0 THEN
      RAISE NOTICE '% -> % linha(s) movida(s)', v_alvo.tabela, v_qtd;
    END IF;
  END LOOP;

  -- 2.2 — Resolve o cadastro do cliente, empresa por empresa
  FOR v_tenant IN
    SELECT DISTINCT tenant_id FROM clientes WHERE instagram IN (v_antigo, v_novo)
  LOOP
    SELECT id INTO v_id_antigo FROM clientes WHERE tenant_id = v_tenant AND instagram = v_antigo;
    SELECT id INTO v_id_novo   FROM clientes WHERE tenant_id = v_tenant AND instagram = v_novo;

    CONTINUE WHEN v_id_antigo IS NULL;   -- já está tudo no @ certo

    IF v_id_novo IS NULL THEN
      -- Só existe o cadastro antigo: renomear resolve
      UPDATE clientes SET instagram = v_novo WHERE id = v_id_antigo;
      RAISE NOTICE 'Cadastro renomeado de % para %', v_antigo, v_novo;

    ELSE
      -- Existem os dois: o cadastro certo herda o que só o antigo tinha
      UPDATE clientes AS novo SET
        whatsapp      = COALESCE(NULLIF(novo.whatsapp, ''),      antigo.whatsapp),
        telefone      = COALESCE(NULLIF(novo.telefone, ''),      antigo.telefone),
        email         = COALESCE(NULLIF(novo.email, ''),         antigo.email),
        nome_completo = COALESCE(NULLIF(novo.nome_completo, ''), antigo.nome_completo),
        cpf_cnpj      = COALESCE(NULLIF(novo.cpf_cnpj, ''),      antigo.cpf_cnpj),
        data_cadastro = LEAST(novo.data_cadastro, antigo.data_cadastro),
        bloqueado     = novo.bloqueado OR antigo.bloqueado,
        msg_bloqueio  = COALESCE(NULLIF(novo.msg_bloqueio, ''),  antigo.msg_bloqueio)
      FROM clientes AS antigo
      WHERE novo.id = v_id_novo AND antigo.id = v_id_antigo;

      -- Repontar as chaves que apontavam para o cadastro antigo
      UPDATE vendas         SET cliente_id = v_id_novo WHERE cliente_id = v_id_antigo;
      UPDATE inadimplencias SET cliente_id = v_id_novo WHERE cliente_id = v_id_antigo;

      DELETE FROM clientes WHERE id = v_id_antigo;
      RAISE NOTICE 'Cadastros unidos: % absorvido por %', v_antigo, v_novo;
    END IF;
  END LOOP;

  -- 2.3 — Tira endereço repetido, se a junção deixou dois iguais
  DELETE FROM enderecos_clientes e
  USING enderecos_clientes manter
  WHERE e.cliente_instagram = v_novo
    AND manter.cliente_instagram = e.cliente_instagram
    AND manter.tenant_id = e.tenant_id
    AND regexp_replace(manter.cep, '\D', '', 'g') = regexp_replace(e.cep, '\D', '', 'g')
    AND btrim(manter.numero) = btrim(e.numero)
    AND manter.id < e.id;
END $$;

COMMIT;
-- Se algo der errado antes do COMMIT, rode:  ROLLBACK;


-- ────────────────────────────────────────────────────────────────────────────
-- PASSO 3 — CONFERÊNCIA
-- Rode o PASSO 1 de novo: tudo tem que aparecer só em _rose_ciavarelli_.
-- E confira o cadastro final:
-- ────────────────────────────────────────────────────────────────────────────
SELECT c.instagram, c.nome_completo, c.whatsapp, c.cpf_cnpj, c.data_cadastro, c.bloqueado,
       (SELECT COUNT(*) FROM vendas v             WHERE v.cliente_nome      = c.instagram) AS vendas,
       (SELECT COUNT(*) FROM enderecos_clientes e WHERE e.cliente_instagram = c.instagram) AS enderecos
FROM clientes c
WHERE c.instagram IN ('rose_ciavarelli_', '_rose_ciavarelli_');


-- ────────────────────────────────────────────────────────────────────────────
-- PASSO 4 — PORTAL (só se o PASSO 1 mostrou linha em portal_clientes)
-- ATENÇÃO: isto muda o login da cliente no portal — ela passa a entrar com o
-- @ novo. As tabelas do portal não têm ON UPDATE CASCADE, por isso o ALTER.
-- ────────────────────────────────────────────────────────────────────────────
-- BEGIN;
--
-- ALTER TABLE portal_produtos  DROP CONSTRAINT portal_produtos_cliente_instagram_fkey,
--   ADD CONSTRAINT portal_produtos_cliente_instagram_fkey
--   FOREIGN KEY (cliente_instagram) REFERENCES portal_clientes(instagram) ON UPDATE CASCADE ON DELETE CASCADE;
--
-- ALTER TABLE portal_cobrancas DROP CONSTRAINT portal_cobrancas_cliente_instagram_fkey,
--   ADD CONSTRAINT portal_cobrancas_cliente_instagram_fkey
--   FOREIGN KEY (cliente_instagram) REFERENCES portal_clientes(instagram) ON UPDATE CASCADE ON DELETE CASCADE;
--
-- ALTER TABLE portal_producao  DROP CONSTRAINT portal_producao_cliente_instagram_fkey,
--   ADD CONSTRAINT portal_producao_cliente_instagram_fkey
--   FOREIGN KEY (cliente_instagram) REFERENCES portal_clientes(instagram) ON UPDATE CASCADE ON DELETE CASCADE;
--
-- UPDATE portal_clientes SET instagram = '_rose_ciavarelli_' WHERE instagram = 'rose_ciavarelli_';
--
-- COMMIT;
