-- ============================================================================
-- LOJA — disponibilidade do pedido já pago
-- ============================================================================
-- Na fundação, item de pedido pago contava como reservado para sempre. Isso
-- fica errado nas duas pontas quando o pagamento vira venda:
--
--   - a venda baixa produtos.quantidade (trigger trg_vendas_estoque), então o
--     item pago contado como reserva descontaria a mesma peça duas vezes —
--     visível em peça com estoque maior que 1;
--   - se o item pago deixasse de contar na hora do pagamento, a peça voltaria
--     ao catálogo no intervalo entre confirmar o PIX e gravar a venda.
--
-- A saída é olhar o item, não o pedido: enquanto venda_id está vazio, a peça
-- segue reservada; quando a venda existe, quem segura é o estoque.
--
-- Idempotente.
-- ============================================================================

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
           (d.status IN ('carrinho', 'aguardando_pagamento')
            AND coalesce(d.reserva_expira_em, now()) > now())
           OR (d.status = 'pago' AND i.venda_id IS NULL)
         )
       GROUP BY i.produto_id
    ) r ON r.produto_id = p.id
   WHERE p.tenant_id = p_tenant_id;
$$;

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
     AND d.id <> p_pedido_id
     AND (
       (d.status IN ('carrinho', 'aguardando_pagamento')
        AND coalesce(d.reserva_expira_em, now()) > now())
       OR (d.status = 'pago' AND i.venda_id IS NULL)
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

  -- Cada peça adicionada renova a reserva do carrinho inteiro
  UPDATE loja_pedidos
     SET reserva_expira_em = v_expira,
         valor_itens = (SELECT coalesce(sum(preco), 0)       FROM loja_pedido_itens WHERE pedido_id = p_pedido_id),
         peso_gramas = (SELECT coalesce(sum(peso_gramas), 0) FROM loja_pedido_itens WHERE pedido_id = p_pedido_id)
   WHERE id = p_pedido_id AND tenant_id = p_tenant_id;

  RETURN jsonb_build_object('ok', true, 'reserva_expira_em', v_expira, 'peso_gramas', v_peso);
END;
$$;

REVOKE ALL ON FUNCTION loja_reservar_peca(uuid, uuid, uuid) FROM anon, authenticated;
REVOKE ALL ON FUNCTION loja_disponivel(uuid)                FROM anon;
