-- ============================================================================
-- CORREÇÃO URGENTE — o auto-save da live baixava estoque a cada 3 segundos
-- ============================================================================
-- O trigger de ontem (20261121b) baixava uma peça por SALVAMENTO, e não por
-- venda. Produtos chegaram a -120.
--
-- Por quê: salvarVendas grava com upsert, que em Postgres é
-- INSERT ... ON CONFLICT (id) DO UPDATE. O BEFORE INSERT dispara na linha
-- proposta ANTES de o banco descobrir que ela já existe — e ali TG_OP é
-- 'INSERT', sem registro OLD para comparar. A regra de transição ("só baixa
-- quando a linha ganha cliente") não tinha como valer, e a linha com cliente
-- baixava de novo. Depois o conflito virava UPDATE, que via OLD com cliente e
-- não fazia nada. Como a tela de Vendas salva sozinha a cada 3 segundos, cada
-- salvamento tirava mais uma peça do estoque.
--
-- A correção é olhar se a linha já existe: se existe, este INSERT é a metade
-- de um upsert e quem decide é o BEFORE UPDATE que vem logo atrás.
--
-- Idempotente. O conserto das quantidades já erradas está em
-- CORRIGIR_ESTOQUE_NEGATIVO.sql, que é rodado depois desta.
-- ============================================================================

CREATE OR REPLACE FUNCTION vendas_sincroniza_estoque()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tinha boolean;
  v_tem   boolean;
  v_prod  uuid;
BEGIN
  IF TG_OP = 'DELETE' THEN
    -- Linha apagada com baixa no lombo: devolve a peça ao estoque
    IF OLD.estoque_produto_id IS NOT NULL THEN
      UPDATE produtos
         SET quantidade = quantidade + 1
       WHERE id = OLD.estoque_produto_id;
    END IF;
    RETURN OLD;
  END IF;

  -- Upsert de linha que já existe: o BEFORE INSERT roda primeiro, mas quem
  -- manda é o BEFORE UPDATE logo em seguida. Sem esta saída, todo salvamento
  -- automático da tela de Vendas baixaria o estoque de novo.
  IF TG_OP = 'INSERT' AND NEW.id IS NOT NULL
     AND EXISTS (SELECT 1 FROM vendas v WHERE v.id = NEW.id) THEN
    RETURN NEW;
  END IF;

  v_tem   := btrim(coalesce(NEW.cliente_nome, '')) <> '';
  v_tinha := TG_OP = 'UPDATE' AND btrim(coalesce(OLD.cliente_nome, '')) <> '';

  -- Ganhou cliente agora: baixa uma peça
  IF v_tem AND NOT v_tinha AND NEW.estoque_produto_id IS NULL THEN
    v_prod := vendas_produto_do_codigo(NEW.tenant_id, NEW.codigo);
    IF v_prod IS NOT NULL THEN
      -- Baixa mesmo que o saldo fique negativo: a tela já trata quantidade
      -- negativa como "saiu além do estoque", e o que não pode acontecer é a
      -- peça vendida continuar disponível na loja.
      UPDATE produtos
         SET quantidade = quantidade - 1
       WHERE id = v_prod;
      NEW.estoque_produto_id := v_prod;
    END IF;
    RETURN NEW;
  END IF;

  -- Perdeu o cliente (linha limpa na digitação): devolve.
  -- O TG_OP tem de vir antes: em INSERT o registro OLD não existe, e ler
  -- OLD.alguma_coisa ali derruba o insert inteiro.
  IF TG_OP = 'UPDATE' AND NOT v_tem AND OLD.estoque_produto_id IS NOT NULL THEN
    UPDATE produtos
       SET quantidade = quantidade + 1
     WHERE id = OLD.estoque_produto_id;
    NEW.estoque_produto_id := NULL;
  END IF;

  RETURN NEW;
END;
$$;
