-- Historico de alteracoes de status de cada peca na expedicao.
-- Gravado por trigger: pega qualquer mudanca de status, venha da tela
-- de expedicao, da geracao de romaneio ou de qualquer outro ponto.

CREATE TABLE IF NOT EXISTS vendas_historico (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  venda_id          UUID NOT NULL REFERENCES vendas(id) ON DELETE CASCADE,
  tenant_id         UUID,
  status_anterior   TEXT,
  status_novo       TEXT,
  alterado_por      UUID,
  alterado_por_nome TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_vendas_historico_venda
  ON vendas_historico (venda_id, created_at DESC);

ALTER TABLE vendas_historico ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "vendas_historico_authenticated" ON vendas_historico;

CREATE POLICY "vendas_historico_authenticated"
  ON vendas_historico FOR ALL TO authenticated
  USING (true) WITH CHECK (true);

-- Trigger: registra toda troca de status
CREATE OR REPLACE FUNCTION registra_historico_status_venda()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_nome TEXT;
BEGIN
  IF COALESCE(OLD.status, '') IS DISTINCT FROM COALESCE(NEW.status, '') THEN
    SELECT nome INTO v_nome FROM users_perfil WHERE id = auth.uid();

    INSERT INTO vendas_historico (
      venda_id, tenant_id, status_anterior, status_novo, alterado_por, alterado_por_nome
    ) VALUES (
      NEW.id, NEW.tenant_id, OLD.status, NEW.status, auth.uid(), v_nome
    );
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_vendas_historico_status ON vendas;

CREATE TRIGGER trg_vendas_historico_status
  AFTER UPDATE ON vendas
  FOR EACH ROW
  EXECUTE FUNCTION registra_historico_status_venda();

COMMENT ON TABLE vendas_historico IS
  'Historico de mudancas de status das pecas, alimentado por trigger em vendas';
