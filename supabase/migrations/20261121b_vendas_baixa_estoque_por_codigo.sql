-- ============================================================================
-- BAIXA DE ESTOQUE POR CÓDIGO — trava contra venda dupla
-- ============================================================================
-- Até aqui o estoque do cadastro só baixava quando a linha da live tinha vindo
-- da busca de produtos (VendasPage guardava o id em memória). Peça digitada à
-- mão não baixava nada: ela continuava com estoque e, publicada na loja,
-- continuaria no catálogo depois de vendida na live — duas clientes na mesma
-- peça, que é o risco que a loja existe para evitar.
--
-- Agora quem baixa é o banco, casando pelo código. Vale para os dois caminhos,
-- e sobrevive a recarregar a página.
--
-- A regra é de TRANSIÇÃO, não de estado: só baixa quando a linha passa de sem
-- cliente para com cliente. Editar uma venda antiga (que já tem cliente desde
-- antes desta migration) não mexe em estoque nenhum.
--
-- Idempotente.
-- ============================================================================

ALTER TABLE vendas
  ADD COLUMN IF NOT EXISTS estoque_produto_id uuid;

COMMENT ON COLUMN vendas.estoque_produto_id IS
  'Produto de onde esta linha baixou estoque. Preenchido pelo trigger; é o que garante uma baixa só e a devolução correta.';

CREATE INDEX IF NOT EXISTS idx_vendas_estoque_produto
  ON vendas (estoque_produto_id)
  WHERE estoque_produto_id IS NOT NULL;

-- ─────────────────────────────────────────────────────────────────────────────
-- Qual produto responde por este código
-- ─────────────────────────────────────────────────────────────────────────────
-- O cadastro aceita código repetido (remove_unique_codigo_produtos.sql), então
-- a escolha é por prioridade: quem está no ar na loja primeiro — é a peça que
-- precisa sair do catálogo —, depois quem tem estoque, depois a mais recente.
CREATE OR REPLACE FUNCTION vendas_produto_do_codigo(p_tenant_id uuid, p_codigo text)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT id
    FROM produtos
   WHERE tenant_id = p_tenant_id
     AND btrim(coalesce(p_codigo, '')) <> ''
     AND lower(btrim(codigo)) = lower(btrim(p_codigo))
   ORDER BY publicado_loja DESC, quantidade DESC, created_at DESC
   LIMIT 1;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- Trigger
-- ─────────────────────────────────────────────────────────────────────────────
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

DROP TRIGGER IF EXISTS trg_vendas_estoque        ON vendas;
DROP TRIGGER IF EXISTS trg_vendas_estoque_delete ON vendas;

CREATE TRIGGER trg_vendas_estoque
  BEFORE INSERT OR UPDATE OF cliente_nome, codigo ON vendas
  FOR EACH ROW EXECUTE FUNCTION vendas_sincroniza_estoque();

CREATE TRIGGER trg_vendas_estoque_delete
  AFTER DELETE ON vendas
  FOR EACH ROW EXECUTE FUNCTION vendas_sincroniza_estoque();
