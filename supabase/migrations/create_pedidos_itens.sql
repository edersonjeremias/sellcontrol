-- ============================================================
-- EXECUTE NO SUPABASE: SQL Editor → New Query → Run
-- Cria tabela pedidos_itens para o módulo Controle de Pedidos
-- ============================================================

-- 1) Cria a tabela
CREATE TABLE IF NOT EXISTS pedidos_itens (
  id              UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID          NOT NULL,
  produto         TEXT          NOT NULL DEFAULT '',
  modelo          TEXT          NOT NULL DEFAULT '',
  cor             TEXT          NOT NULL DEFAULT '',
  marca           TEXT          NOT NULL DEFAULT '',
  tamanho         TEXT          NOT NULL DEFAULT '',
  preco           DECIMAL(10,2),
  codigo_peca     TEXT          NOT NULL DEFAULT '',
  cliente_nome    TEXT          NOT NULL DEFAULT '',
  data_live       DATE,
  observacao      TEXT          NOT NULL DEFAULT '',
  status          TEXT          NOT NULL DEFAULT '',
  rastreio        TEXT          NOT NULL DEFAULT '',
  data_envio      DATE,
  data_devolucao  DATE,
  numero_pedido   INTEGER,
  updated_at      TIMESTAMPTZ   NOT NULL DEFAULT now(),
  created_at      TIMESTAMPTZ   NOT NULL DEFAULT now()
);

-- 2) Índices
CREATE INDEX IF NOT EXISTS idx_pedidos_itens_tenant
  ON pedidos_itens(tenant_id);

CREATE INDEX IF NOT EXISTS idx_pedidos_itens_tenant_live
  ON pedidos_itens(tenant_id, data_live DESC);

CREATE INDEX IF NOT EXISTS idx_pedidos_itens_tenant_pedido
  ON pedidos_itens(tenant_id, numero_pedido);

CREATE INDEX IF NOT EXISTS idx_pedidos_itens_tenant_status
  ON pedidos_itens(tenant_id, status);

-- 3) Habilita RLS
ALTER TABLE pedidos_itens ENABLE ROW LEVEL SECURITY;

-- Remove políticas antigas se existirem
DROP POLICY IF EXISTS "pedidos_itens_authenticated" ON pedidos_itens;

-- 4) Política: qualquer usuário autenticado tem acesso total
--    (filtro por tenant_id é feito no app, igual ao padrão do sistema)
CREATE POLICY "pedidos_itens_authenticated"
  ON pedidos_itens
  FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- 5) Trigger: ao mudar status para 'Gerar Crédito', cria crédito automaticamente
CREATE OR REPLACE FUNCTION fn_pedidos_gerar_credito()
RETURNS TRIGGER AS $$
BEGIN
  -- Só dispara quando status muda para 'Gerar Crédito' com preço definido
  IF NEW.status = 'Gerar Crédito'
     AND (OLD.status IS DISTINCT FROM 'Gerar Crédito')
     AND NEW.preco IS NOT NULL AND NEW.preco > 0
  THEN
    INSERT INTO creditos (
      tenant_id, cliente, valor_original, motivo, saldo_restante, valor_utilizado
    ) VALUES (
      NEW.tenant_id,
      NEW.cliente_nome,
      NEW.preco,
      'Devolução pedido - ' || COALESCE(NEW.produto, '') || ' ' || COALESCE(NEW.modelo, ''),
      NEW.preco,
      0
    );
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_pedidos_gerar_credito ON pedidos_itens;

CREATE TRIGGER trg_pedidos_gerar_credito
  AFTER UPDATE OF status ON pedidos_itens
  FOR EACH ROW
  EXECUTE FUNCTION fn_pedidos_gerar_credito();

-- 6) Recarrega cache do PostgREST
NOTIFY pgrst, 'reload schema';
