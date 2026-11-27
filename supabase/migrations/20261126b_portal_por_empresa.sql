-- ============================================================================
-- PORTAL DA CLIENTE POR EMPRESA — a conta deixa de ser global
-- ============================================================================
-- O portal nasceu quando havia uma empresa só. A conta da cliente era
-- identificada apenas pelo @ do Instagram:
--
--   portal_clientes.instagram  era ÚNICO no sistema inteiro
--   portal_get_minha_sacolinha buscava em `vendas` sem filtrar tenant_id
--
-- Com o sistema vendido para várias empresas, isso dava dois problemas:
--
--   1. A @maria cliente da empresa A e a @maria cliente da empresa B eram a
--      MESMA conta. Quem cadastrasse depois trocava a senha da outra.
--   2. A @maria logada via, na sacolinha, as peças das duas empresas juntas —
--      dado de uma loja aparecendo na tela da cliente de outra.
--
-- Esta migration faz a identidade da cliente ser **(empresa, @)**:
--
--   - portal_clientes, portal_cobrancas, portal_producao e portal_produtos
--     ganham tenant_id
--   - a unicidade passa a ser (tenant_id, instagram)
--   - portal_get_tenant() diz de qual empresa é a conta logada
--   - as leituras do portal filtram por essa empresa
--
-- As contas que já existem continuam funcionando: recebem o tenant_id da
-- empresa onde a cliente está cadastrada, e o e-mail antigo (sem empresa no
-- endereço) continua válido — o login tenta o formato novo e depois o antigo.
--
-- Idempotente: pode rodar de novo sem quebrar nada.
-- ============================================================================

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. A COLUNA
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE portal_clientes  ADD COLUMN IF NOT EXISTS tenant_id uuid REFERENCES tenants(id) ON DELETE CASCADE;
ALTER TABLE portal_cobrancas ADD COLUMN IF NOT EXISTS tenant_id uuid REFERENCES tenants(id) ON DELETE CASCADE;
ALTER TABLE portal_producao  ADD COLUMN IF NOT EXISTS tenant_id uuid REFERENCES tenants(id) ON DELETE CASCADE;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables
              WHERE table_schema = 'public' AND table_name = 'portal_produtos') THEN
    ALTER TABLE portal_produtos ADD COLUMN IF NOT EXISTS tenant_id uuid REFERENCES tenants(id) ON DELETE CASCADE;
  END IF;
END $$;

COMMENT ON COLUMN portal_clientes.tenant_id IS 'Empresa da conta. A identidade da cliente no portal é (tenant_id, instagram).';

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. DE QUEM É CADA CONTA QUE JÁ EXISTE
-- ─────────────────────────────────────────────────────────────────────────────
-- A empresa é aquela onde a cliente está cadastrada em `clientes`. Se o mesmo
-- @ estiver em duas, pega uma — hoje isso não acontece, e o caso fica
-- registrado no aviso do fim desta seção.
UPDATE portal_clientes pc
   SET tenant_id = c.tenant_id
  FROM clientes c
 WHERE pc.tenant_id IS NULL
   AND lower(btrim(replace(c.instagram, '@', ''))) = lower(btrim(replace(pc.instagram, '@', '')));

-- Conta sem cadastro correspondente: se o sistema só tem uma empresa, é dela.
DO $$
DECLARE
  v_qtd   integer;
  v_unico uuid;
  v_orfas integer;
BEGIN
  -- Sem min(id): o Postgres não tem MIN para uuid.
  SELECT count(*) INTO v_qtd FROM tenants;

  IF v_qtd = 1 THEN
    SELECT id INTO v_unico FROM tenants LIMIT 1;
    UPDATE portal_clientes SET tenant_id = v_unico WHERE tenant_id IS NULL;
  END IF;

  SELECT count(*) INTO v_orfas FROM portal_clientes WHERE tenant_id IS NULL;
  IF v_orfas > 0 THEN
    RAISE NOTICE '% conta(s) do portal sem empresa definida. Elas não abrem o portal até receberem tenant_id.', v_orfas;
  END IF;
END $$;

-- As tabelas legadas herdam a empresa da conta.
UPDATE portal_cobrancas pcob
   SET tenant_id = pc.tenant_id
  FROM portal_clientes pc
 WHERE pcob.tenant_id IS NULL
   AND lower(btrim(replace(pc.instagram, '@', ''))) = lower(btrim(replace(pcob.cliente_instagram, '@', '')));

UPDATE portal_producao pprod
   SET tenant_id = pc.tenant_id
  FROM portal_clientes pc
 WHERE pprod.tenant_id IS NULL
   AND lower(btrim(replace(pc.instagram, '@', ''))) = lower(btrim(replace(pprod.cliente_instagram, '@', '')));

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. A UNICIDADE PASSA A SER (EMPRESA, @)
-- ─────────────────────────────────────────────────────────────────────────────
-- As tabelas legadas apontavam para portal_clientes(instagram), e é essa FK
-- que obrigava o @ a ser único no sistema inteiro. Elas saem: a ligação
-- continua pelo par (tenant_id, cliente_instagram), recriado logo abaixo.
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT con.conname, cl.relname
      FROM pg_constraint con
      JOIN pg_class cl ON cl.oid = con.conrelid
     WHERE con.contype = 'f'
       AND con.confrelid = 'portal_clientes'::regclass
  LOOP
    EXECUTE format('ALTER TABLE public.%I DROP CONSTRAINT %I', r.relname, r.conname);
    RAISE NOTICE 'FK % removida de %', r.conname, r.relname;
  END LOOP;
END $$;

-- Agora a unicidade antiga do @ pode cair.
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT con.conname
      FROM pg_constraint con
     WHERE con.conrelid = 'portal_clientes'::regclass
       AND con.contype IN ('u', 'p')
       AND (SELECT array_agg(att.attname::text ORDER BY att.attnum)
              FROM pg_attribute att
             WHERE att.attrelid = con.conrelid
               AND att.attnum = ANY (con.conkey)) = ARRAY['instagram']
  LOOP
    EXECUTE format('ALTER TABLE portal_clientes DROP CONSTRAINT %I', r.conname);
    RAISE NOTICE 'Unicidade antiga % (instagram) removida', r.conname;
  END LOOP;
END $$;

DROP INDEX IF EXISTS portal_clientes_instagram_key;
DROP INDEX IF EXISTS idx_portal_clientes_instagram;

-- Uma conta por (empresa, @). Sem lower() porque o sistema sempre grava o @
-- em minúsculas e a FK composta abaixo precisa deste índice exato.
CREATE UNIQUE INDEX IF NOT EXISTS idx_portal_clientes_tenant_instagram
  ON portal_clientes (tenant_id, instagram);

-- Uma conta do Auth atende uma empresa só.
CREATE UNIQUE INDEX IF NOT EXISTS idx_portal_clientes_user
  ON portal_clientes (user_id);

-- Integridade das tabelas legadas pelo par. Se o dado antigo não fechar, a
-- migration segue sem a FK em vez de parar: o filtro por empresa, que é o
-- que importa aqui, já está nas políticas.
DO $$
BEGIN
  BEGIN
    ALTER TABLE portal_cobrancas
      ADD CONSTRAINT portal_cobrancas_cliente_fk
      FOREIGN KEY (tenant_id, cliente_instagram)
      REFERENCES portal_clientes (tenant_id, instagram) ON DELETE CASCADE;
  EXCEPTION WHEN duplicate_object THEN NULL;
            WHEN others THEN RAISE NOTICE 'FK de portal_cobrancas não criada: %', SQLERRM;
  END;

  BEGIN
    ALTER TABLE portal_producao
      ADD CONSTRAINT portal_producao_cliente_fk
      FOREIGN KEY (tenant_id, cliente_instagram)
      REFERENCES portal_clientes (tenant_id, instagram) ON DELETE CASCADE;
  EXCEPTION WHEN duplicate_object THEN NULL;
            WHEN others THEN RAISE NOTICE 'FK de portal_producao não criada: %', SQLERRM;
  END;
END $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. DE QUAL EMPRESA É QUEM ESTÁ LOGADO
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION portal_get_tenant()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT tenant_id
    FROM portal_clientes
   WHERE user_id = auth.uid()
     AND bloqueado = false
   LIMIT 1;
$$;

COMMENT ON FUNCTION portal_get_tenant() IS 'Empresa da conta de portal logada. Toda leitura do portal filtra por ela.';

GRANT EXECUTE ON FUNCTION portal_get_tenant() TO anon, authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. A SACOLINHA SÓ MOSTRA PEÇAS DA EMPRESA DA CONTA
-- ─────────────────────────────────────────────────────────────────────────────
-- Recriada a partir de 20261123_sacolinha_romaneio_e_rastreio.sql, com uma
-- mudança: o WHERE passou a filtrar v.tenant_id. Sem isso, a cliente com o
-- mesmo @ em duas empresas via as peças das duas na mesma tela.
DROP FUNCTION IF EXISTS portal_get_minha_sacolinha();

CREATE FUNCTION portal_get_minha_sacolinha()
RETURNS TABLE (
  id               UUID,
  cliente_instagram TEXT,
  codigo_peca       TEXT,
  descricao_completa TEXT,
  valor             NUMERIC,
  status_peca       TEXT,
  data_insercao     DATE,
  observacao        TEXT,
  data_envio        DATE,
  rastreio          TEXT,
  romaneio          TEXT,
  transportadora    TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_instagram TEXT;
  v_slug      TEXT;
  v_tenant    UUID;
BEGIN
  -- Identifica o instagram do usuário logado no portal
  v_instagram := portal_get_instagram();
  IF v_instagram IS NULL THEN RETURN; END IF;

  -- E a empresa da conta: sem ela, nada é devolvido. Conta antiga que ficou
  -- sem tenant_id cai aqui, e é melhor a tela vazia do que a tela com peça
  -- de outra loja.
  v_tenant := portal_get_tenant();
  IF v_tenant IS NULL THEN RETURN; END IF;

  -- Normaliza: remove @ e lowercase para comparar (o vendedor pode ter digitado com ou sem @)
  v_slug := LOWER(TRIM(REPLACE(v_instagram, '@', '')));

  RETURN QUERY
  SELECT
    v.id,
    v.cliente_nome                                          AS cliente_instagram,
    v.codigo                                                AS codigo_peca,
    TRIM(CONCAT_WS(' ',
      NULLIF(TRIM(COALESCE(v.produto, '')), ''),
      NULLIF(TRIM(COALESCE(v.modelo,  '')), ''),
      NULLIF(TRIM(COALESCE(v.cor,     '')), ''),
      NULLIF(TRIM(COALESCE(v.marca,   '')), ''),
      NULLIF(TRIM(COALESCE(v.tamanho, '')), '')
    ))                                                      AS descricao_completa,
    -- Usa PROMOÇÃO se existir E > 0, senão usa PREÇO normal
    CASE
      WHEN v.preco_promocional IS NOT NULL AND v.preco_promocional > 0
      THEN v.preco_promocional
      ELSE v.preco
    END                                                     AS valor,
    CASE
      -- Despacho do romaneio: o único sinal de que o pacote saiu
      WHEN r.status IN ('despachado', 'em_transito', 'entregue') THEN 'Enviado'
      -- Sem romaneio: peça do fluxo antigo, onde 'Enviado' era o envio real
      -- data_envio distingue o envio real do 'ENVIADO' da cobrança
      WHEN r.id IS NULL
           AND UPPER(TRIM(COALESCE(v.status, ''))) = 'ENVIADO'
           AND v.data_envio IS NOT NULL THEN 'Enviado'
      ELSE COALESCE(p.status_entrega, '')
    END                                                     AS status_peca,
    COALESCE(
      v.data_live,
      (v.created_at AT TIME ZONE 'America/Sao_Paulo')::date
    )                                                       AS data_insercao,
    NULL::TEXT                                              AS observacao,
    CASE
      WHEN r.status IN ('despachado', 'em_transito', 'entregue')
        THEN COALESCE(r.despachado_em, r.entregue_em)::date
      WHEN r.id IS NULL
           AND UPPER(TRIM(COALESCE(v.status, ''))) = 'ENVIADO'
           AND v.data_envio IS NOT NULL
        THEN v.data_envio
      ELSE p.data_enviado
    END                                                     AS data_envio,
    COALESCE(NULLIF(r.codigo_rastreio, ''), p.rastreio, '') AS rastreio,
    COALESCE(r.numero, '')                                  AS romaneio,
    COALESCE(r.transportadora, '')                          AS transportadora
  FROM vendas v
  LEFT JOIN producao_pedidos p
    ON v.codigo = p.pedido_codigo
    AND p.tenant_id = v.tenant_id
    AND LOWER(TRIM(REPLACE(COALESCE(p.cliente_nome, ''), '@', ''))) = v_slug
    AND v.data_live = p.data_solicitado
  -- romaneios.numero é texto ("ROM-155"); vendas.numero_pedido é o inteiro 155.
  -- O cliente entra na condição: o número sozinho se repete entre pessoas
  -- diferentes e marcava como enviada a peça de quem nunca recebeu nada.
  LEFT JOIN romaneios r
    ON r.tenant_id = v.tenant_id
    AND LOWER(TRIM(REPLACE(COALESCE(r.cliente_instagram, ''), '@', ''))) = v_slug
    AND v.numero_pedido IS NOT NULL
    AND NULLIF(regexp_replace(r.numero, '[^0-9]', '', 'g'), '')::int = v.numero_pedido
  WHERE v.tenant_id = v_tenant
    AND LOWER(TRIM(REPLACE(COALESCE(v.cliente_nome, ''), '@', ''))) = v_slug
    AND UPPER(TRIM(COALESCE(v.status, ''))) NOT IN (
      'CANCELADO',
      'DEVOLUÇÃO', 'DEVOLUCAO',
      'GERAR CRÉDITO', 'GERAR CREDITO'
    )
  ORDER BY v.created_at DESC;
END;
$$;

GRANT EXECUTE ON FUNCTION portal_get_minha_sacolinha() TO anon, authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 6. AS POLÍTICAS DAS TABELAS LEGADAS PASSAM A OLHAR A EMPRESA
-- ─────────────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "portal: cliente lê próprias cobranças" ON portal_cobrancas;
CREATE POLICY "portal: cliente lê próprias cobranças"
  ON portal_cobrancas FOR SELECT
  USING (tenant_id = portal_get_tenant() AND cliente_instagram = portal_get_instagram());

DROP POLICY IF EXISTS "portal: cliente lê própria produção" ON portal_producao;
CREATE POLICY "portal: cliente lê própria produção"
  ON portal_producao FOR SELECT
  USING (tenant_id = portal_get_tenant() AND cliente_instagram = portal_get_instagram());

DROP POLICY IF EXISTS "portal: cliente insere produção" ON portal_producao;
CREATE POLICY "portal: cliente insere produção"
  ON portal_producao FOR INSERT
  WITH CHECK (tenant_id = portal_get_tenant() AND cliente_instagram = portal_get_instagram());

DROP POLICY IF EXISTS "portal: cliente atualiza frete" ON portal_producao;
CREATE POLICY "portal: cliente atualiza frete"
  ON portal_producao FOR UPDATE
  USING (tenant_id = portal_get_tenant() AND cliente_instagram = portal_get_instagram());

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables
              WHERE table_schema = 'public' AND table_name = 'portal_produtos') THEN
    DROP POLICY IF EXISTS "portal: cliente lê próprios produtos" ON portal_produtos;
    CREATE POLICY "portal: cliente lê próprios produtos"
      ON portal_produtos FOR SELECT
      USING (tenant_id = portal_get_tenant() AND cliente_instagram = portal_get_instagram());
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';

-- ============================================================================
-- AINDA FALTA (e por isso este aviso fica aqui)
-- ============================================================================
-- Estas funções do portal foram criadas direto no banco e não têm o código
-- versionado no repositório, então não foram recriadas aqui — elas continuam
-- sem filtro por empresa:
--
--   portal_get_meus_debitos
--   portal_encerrar_sacolinha
--   portal_get_minhas_conversas, portal_criar_conversa,
--   portal_responder_conversa, portal_get_mensagens, portal_marcar_lida
--
-- Para fechar, rode o SELECT abaixo e guarde a saída no repositório
-- (supabase/migrations/), que é de onde a correção sai:
--
--   SELECT p.proname, pg_get_functiondef(p.oid)
--     FROM pg_proc p
--     JOIN pg_namespace n ON n.oid = p.pronamespace
--    WHERE n.nspname = 'public'
--      AND p.proname LIKE 'portal_%'
--    ORDER BY p.proname;
--
-- ============================================================================
-- CONFERÊNCIA
-- ============================================================================
-- SELECT c.nome_loja, count(*) AS contas_de_portal
--   FROM portal_clientes pc
--   LEFT JOIN configuracoes c ON c.tenant_id = pc.tenant_id
--  GROUP BY c.nome_loja ORDER BY c.nome_loja;
-- ============================================================================
-- FIM DA MIGRATION
-- ============================================================================
