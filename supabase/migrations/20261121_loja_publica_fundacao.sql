-- ============================================================================
-- LOJA PÚBLICA — FASE 1, ETAPA 1: fundação
-- ============================================================================
-- Cria o que a loja precisa antes de existir página nenhuma:
--   1. produtos: a flag "Publicar na loja" e o peso próprio da peça
--   2. configuracoes: pesos por categoria, caixas e tempo de reserva
--   3. loja_pedidos / loja_pedido_itens: o carrinho e o pedido da loja
--   4. funções de peso, reserva e expiração
--
-- Idempotente: pode rodar de novo sem quebrar nada.
-- ============================================================================

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. PRODUTO: o que vai ao ar e quanto pesa
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE produtos
  ADD COLUMN IF NOT EXISTS publicado_loja boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS peso_gramas     integer;

COMMENT ON COLUMN produtos.publicado_loja IS
  'Peça aparece no catálogo público /loja/<slug>. Ligada peça a peça pela tela de Produtos.';
COMMENT ON COLUMN produtos.peso_gramas IS
  'Peso próprio da peça, em gramas. Vence o peso da categoria e o peso padrão na cotação do frete.';

-- Catálogo: lê só o que está publicado e ativo
CREATE INDEX IF NOT EXISTS idx_produtos_loja
  ON produtos (tenant_id)
  WHERE publicado_loja AND ativo;

-- O link da peça é /loja/<slug>/p/<codigo>, então dois produtos publicados não
-- podem dividir o mesmo código. O UNIQUE geral da tabela foi removido um dia
-- (remove_unique_codigo_produtos.sql) porque o cadastro interno repete código;
-- aqui a exigência vale só para quem está no ar.
CREATE UNIQUE INDEX IF NOT EXISTS idx_produtos_codigo_publicado
  ON produtos (tenant_id, lower(btrim(codigo)))
  WHERE publicado_loja;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. CONFIGURAÇÕES DA LOJA
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE configuracoes
  ADD COLUMN IF NOT EXISTS loja_ativa              boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS loja_peso_padrao_gramas integer NOT NULL DEFAULT 300,
  ADD COLUMN IF NOT EXISTS loja_pesos_categoria    jsonb   NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS loja_caixas             jsonb   NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS loja_reserva_minutos    integer NOT NULL DEFAULT 15;

COMMENT ON COLUMN configuracoes.loja_ativa IS
  'Catálogo público no ar. Desligado, /loja/<slug> responde que a loja está fechada.';
COMMENT ON COLUMN configuracoes.loja_pesos_categoria IS
  'Peso por tipo de peça: [{"produto":"Camiseta","gramas":200}]. Casa pelo campo Produto do cadastro.';
COMMENT ON COLUMN configuracoes.loja_caixas IS
  'Faixas de caixa: [{"ate_gramas":500,"max_pecas":3,"altura":10,"largura":15,"comprimento":20}]. A última tem ate_gramas null.';
COMMENT ON COLUMN configuracoes.loja_reserva_minutos IS
  'Minutos que a peça fica reservada no carrinho antes de voltar ao catálogo.';

-- Semeia os valores do plano, só onde ainda está vazio
UPDATE configuracoes
SET loja_pesos_categoria = '[
  {"produto":"Body","gramas":150},
  {"produto":"Regata","gramas":150},
  {"produto":"Camiseta","gramas":200},
  {"produto":"Calça","gramas":600},
  {"produto":"Moletom","gramas":600},
  {"produto":"Casaco","gramas":600}
]'::jsonb
WHERE loja_pesos_categoria = '[]'::jsonb;

UPDATE configuracoes
SET loja_caixas = '[
  {"ate_gramas":500,"max_pecas":3,"altura":10,"largura":15,"comprimento":20},
  {"ate_gramas":1500,"max_pecas":8,"altura":15,"largura":20,"comprimento":30},
  {"ate_gramas":null,"max_pecas":null,"altura":20,"largura":30,"comprimento":40}
]'::jsonb
WHERE loja_caixas = '[]'::jsonb;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. PEDIDO DA LOJA
-- ─────────────────────────────────────────────────────────────────────────────
-- O carrinho É o pedido, com status 'carrinho'. É dele que sai a reserva: a
-- peça só volta ao catálogo quando reserva_expira_em passa. Sem tabela de
-- reserva à parte, o carrinho e a reserva nunca ficam fora de sincronia.
CREATE TABLE IF NOT EXISTS loja_pedidos (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id          uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  codigo             text NOT NULL,

  -- carrinho | aguardando_pagamento | pago | expirado | cancelado
  status             text NOT NULL DEFAULT 'carrinho',
  -- entrega (frete pago agora) | sacolinha (cliente do portal acumula o frete)
  destino            text NOT NULL DEFAULT 'entrega',

  -- Quem compra
  cliente_nome       text,
  cliente_whatsapp   text,
  cliente_cpf        text,
  cliente_email      text,
  cliente_instagram  text,
  cliente_user_id    uuid,

  -- Entrega
  endereco_id        uuid REFERENCES enderecos_clientes(id) ON DELETE SET NULL,
  endereco           jsonb,
  frete_escolhido    jsonb,
  caixa              jsonb,
  peso_gramas        integer,

  -- Dinheiro
  valor_itens        numeric(10,2) NOT NULL DEFAULT 0,
  valor_frete        numeric(10,2) NOT NULL DEFAULT 0,
  total              numeric(10,2) NOT NULL DEFAULT 0,
  forma_pagamento    text,
  mp_payment_id      text,
  mp_preference_id   text,
  pix_qr_code        text,
  pix_qr_code_base64 text,
  pix_expiracao      timestamptz,

  -- Controle
  reserva_expira_em  timestamptz,
  pago_em            timestamptz,
  numero_pedido      integer,
  romaneio_id        uuid REFERENCES romaneios(id) ON DELETE SET NULL,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_loja_pedidos_codigo
  ON loja_pedidos (tenant_id, codigo);
CREATE INDEX IF NOT EXISTS idx_loja_pedidos_status
  ON loja_pedidos (tenant_id, status, reserva_expira_em);
CREATE INDEX IF NOT EXISTS idx_loja_pedidos_mp
  ON loja_pedidos (mp_payment_id);

CREATE TABLE IF NOT EXISTS loja_pedido_itens (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pedido_id   uuid NOT NULL REFERENCES loja_pedidos(id) ON DELETE CASCADE,
  tenant_id   uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  produto_id  uuid NOT NULL REFERENCES produtos(id) ON DELETE RESTRICT,

  -- Cópia do cadastro na hora da compra: o preço da peça pode mudar depois
  codigo      text,
  produto     text,
  modelo      text,
  cor         text,
  marca       text,
  tamanho     text,
  imagem      text,
  preco       numeric(10,2) NOT NULL DEFAULT 0,
  peso_gramas integer,

  -- Linha de `vendas` criada quando o pagamento foi confirmado
  venda_id    uuid,
  created_at  timestamptz NOT NULL DEFAULT now(),

  UNIQUE (pedido_id, produto_id)
);

CREATE INDEX IF NOT EXISTS idx_loja_itens_produto
  ON loja_pedido_itens (produto_id);

-- updated_at
CREATE OR REPLACE FUNCTION loja_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_loja_pedidos_updated_at ON loja_pedidos;
CREATE TRIGGER trg_loja_pedidos_updated_at
  BEFORE UPDATE ON loja_pedidos
  FOR EACH ROW EXECUTE FUNCTION loja_set_updated_at();

-- RLS: quem opera a loja é a Edge Function (service role, ignora RLS).
-- O painel autenticado lê os pedidos do próprio tenant, como nas outras tabelas.
ALTER TABLE loja_pedidos      ENABLE ROW LEVEL SECURITY;
ALTER TABLE loja_pedido_itens ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS loja_pedidos_tenant ON loja_pedidos;
CREATE POLICY loja_pedidos_tenant ON loja_pedidos
  FOR ALL TO authenticated
  USING (tenant_id IN (SELECT tenant_id FROM users_perfil WHERE id = auth.uid()));

DROP POLICY IF EXISTS loja_pedido_itens_tenant ON loja_pedido_itens;
CREATE POLICY loja_pedido_itens_tenant ON loja_pedido_itens
  FOR ALL TO authenticated
  USING (tenant_id IN (SELECT tenant_id FROM users_perfil WHERE id = auth.uid()));

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. PESO DA PEÇA — as três fontes, numa só função
-- ─────────────────────────────────────────────────────────────────────────────
-- 1) peso próprio da peça  2) peso da categoria (campo Produto)  3) peso padrão
CREATE OR REPLACE FUNCTION loja_peso_peca(p_tenant_id uuid, p_produto_id uuid)
RETURNS integer
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_proprio integer;
  v_nome    text;
  v_cat     integer;
  v_padrao  integer;
BEGIN
  SELECT NULLIF(peso_gramas, 0), lower(btrim(coalesce(produto, '')))
    INTO v_proprio, v_nome
    FROM produtos
   WHERE id = p_produto_id AND tenant_id = p_tenant_id;

  IF v_proprio IS NOT NULL AND v_proprio > 0 THEN
    RETURN v_proprio;
  END IF;

  SELECT coalesce(loja_peso_padrao_gramas, 300)
    INTO v_padrao
    FROM configuracoes
   WHERE tenant_id = p_tenant_id;

  SELECT (item->>'gramas')::integer
    INTO v_cat
    FROM configuracoes c,
         jsonb_array_elements(coalesce(c.loja_pesos_categoria, '[]'::jsonb)) AS item
   WHERE c.tenant_id = p_tenant_id
     AND v_nome <> ''
     AND lower(btrim(item->>'produto')) = v_nome
   LIMIT 1;

  RETURN coalesce(v_cat, v_padrao, 300);
END;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. RESERVA — é o que impede duas clientes de levarem a mesma peça
-- ─────────────────────────────────────────────────────────────────────────────
-- Expiração preguiçosa: roda antes de montar o catálogo e antes de reservar.
-- Nada depende de cron, então a loja não quebra se o agendador parar.
CREATE OR REPLACE FUNCTION loja_expirar_pedidos(p_tenant_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_qtd integer;
BEGIN
  WITH expirados AS (
    UPDATE loja_pedidos
       SET status = 'expirado'
     WHERE tenant_id = p_tenant_id
       AND status IN ('carrinho', 'aguardando_pagamento')
       AND reserva_expira_em IS NOT NULL
       AND reserva_expira_em < now()
    RETURNING 1
  )
  SELECT count(*)::integer INTO v_qtd FROM expirados;
  RETURN v_qtd;
END;
$$;

-- Quanto sobra de cada peça: estoque menos o que está reservado agora
CREATE OR REPLACE FUNCTION loja_disponivel(p_tenant_id uuid)
RETURNS TABLE (produto_id uuid, disponivel integer)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p.id,
         (p.quantidade - coalesce(r.reservados, 0))::integer
    FROM produtos p
    LEFT JOIN (
      SELECT i.produto_id, count(*)::integer AS reservados
        FROM loja_pedido_itens i
        JOIN loja_pedidos d ON d.id = i.pedido_id
       WHERE d.tenant_id = p_tenant_id
         AND (
           d.status = 'pago'
           OR (d.status IN ('carrinho', 'aguardando_pagamento')
               AND coalesce(d.reserva_expira_em, now()) > now())
         )
       GROUP BY i.produto_id
    ) r ON r.produto_id = p.id
   WHERE p.tenant_id = p_tenant_id;
$$;

-- Põe a peça no carrinho e segura a reserva.
-- O FOR UPDATE na linha do produto serializa duas clientes no mesmo segundo:
-- a segunda só é avaliada depois que a primeira terminou.
CREATE OR REPLACE FUNCTION loja_reservar_peca(
  p_tenant_id  uuid,
  p_pedido_id  uuid,
  p_produto_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_prod       produtos;
  v_minutos    integer;
  v_reservados integer;
  v_expira     timestamptz;
  v_peso       integer;
BEGIN
  PERFORM loja_expirar_pedidos(p_tenant_id);

  SELECT coalesce(loja_reserva_minutos, 15) INTO v_minutos
    FROM configuracoes WHERE tenant_id = p_tenant_id;
  v_minutos := coalesce(v_minutos, 15);

  SELECT * INTO v_prod
    FROM produtos
   WHERE id = p_produto_id AND tenant_id = p_tenant_id
     FOR UPDATE;

  IF v_prod.id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'Peça não encontrada');
  END IF;
  IF NOT v_prod.publicado_loja OR NOT v_prod.ativo THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'Esta peça não está mais na loja');
  END IF;
  IF coalesce(v_prod.preco, 0) <= 0 THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'Esta peça está sem preço');
  END IF;

  SELECT count(*)::integer INTO v_reservados
    FROM loja_pedido_itens i
    JOIN loja_pedidos d ON d.id = i.pedido_id
   WHERE i.produto_id = p_produto_id
     AND d.tenant_id = p_tenant_id
     AND (
       d.status = 'pago'
       OR (d.status IN ('carrinho', 'aguardando_pagamento')
           AND coalesce(d.reserva_expira_em, now()) > now())
     );

  IF v_prod.quantidade - v_reservados <= 0 THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'Alguém levou esta peça agora');
  END IF;

  v_expira := now() + make_interval(mins => v_minutos);
  v_peso   := loja_peso_peca(p_tenant_id, p_produto_id);

  INSERT INTO loja_pedido_itens (
    pedido_id, tenant_id, produto_id, codigo, produto, modelo, cor, marca,
    tamanho, imagem, preco, peso_gramas
  )
  VALUES (
    p_pedido_id, p_tenant_id, p_produto_id, v_prod.codigo, v_prod.produto,
    v_prod.modelo, v_prod.cor, v_prod.marca, v_prod.tamanho,
    (v_prod.imagens->>0),
    CASE WHEN coalesce(v_prod.preco_promocional, 0) > 0
         THEN v_prod.preco_promocional ELSE v_prod.preco END,
    v_peso
  )
  ON CONFLICT (pedido_id, produto_id) DO NOTHING;

  -- Cada peça adicionada renova os 15 minutos do carrinho inteiro
  UPDATE loja_pedidos
     SET reserva_expira_em = v_expira,
         valor_itens = (SELECT coalesce(sum(preco), 0)       FROM loja_pedido_itens WHERE pedido_id = p_pedido_id),
         peso_gramas = (SELECT coalesce(sum(peso_gramas), 0) FROM loja_pedido_itens WHERE pedido_id = p_pedido_id)
   WHERE id = p_pedido_id AND tenant_id = p_tenant_id;

  RETURN jsonb_build_object('ok', true, 'reserva_expira_em', v_expira, 'peso_gramas', v_peso);
END;
$$;

-- Tira a peça do carrinho e devolve ao catálogo na hora
CREATE OR REPLACE FUNCTION loja_liberar_peca(
  p_tenant_id  uuid,
  p_pedido_id  uuid,
  p_produto_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  DELETE FROM loja_pedido_itens
   WHERE pedido_id = p_pedido_id
     AND produto_id = p_produto_id
     AND tenant_id = p_tenant_id;

  UPDATE loja_pedidos
     SET valor_itens = (SELECT coalesce(sum(preco), 0)       FROM loja_pedido_itens WHERE pedido_id = p_pedido_id),
         peso_gramas = (SELECT coalesce(sum(peso_gramas), 0) FROM loja_pedido_itens WHERE pedido_id = p_pedido_id)
   WHERE id = p_pedido_id AND tenant_id = p_tenant_id;

  RETURN jsonb_build_object('ok', true);
END;
$$;

-- Só o service role (Edge Function) chama estas funções. anon e authenticated
-- não precisam: a loja pública não fala com o banco direto, igual ao /frete.
REVOKE ALL ON FUNCTION loja_reservar_peca(uuid, uuid, uuid) FROM anon, authenticated;
REVOKE ALL ON FUNCTION loja_liberar_peca(uuid, uuid, uuid)  FROM anon, authenticated;
REVOKE ALL ON FUNCTION loja_expirar_pedidos(uuid)           FROM anon, authenticated;
REVOKE ALL ON FUNCTION loja_disponivel(uuid)                FROM anon;
REVOKE ALL ON FUNCTION loja_peso_peca(uuid, uuid)           FROM anon;
