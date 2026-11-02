-- ============================================================================
-- HISTÓRICO DE STATUS DOS ROMANEIOS
-- ============================================================================
-- Data: 02/11/2026
--
-- Mesmo desenho do vendas_historico: gravado por trigger, então pega a
-- mudança venha de onde vier — da tela de etiquetas, do webhook do Mercado
-- Pago, da sincronização com o Melhor Envio ou do link público do cliente.
-- Quando a mudança vem de uma Edge Function (service role) não há usuário
-- logado, e o histórico mostra "Sistema".
-- ============================================================================

CREATE TABLE IF NOT EXISTS romaneios_historico (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  romaneio_id       UUID NOT NULL REFERENCES romaneios(id) ON DELETE CASCADE,
  tenant_id         UUID,
  status_anterior   TEXT,
  status_novo       TEXT,
  alterado_por      UUID,
  alterado_por_nome TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_romaneios_historico_romaneio
  ON romaneios_historico (romaneio_id, created_at DESC);

ALTER TABLE romaneios_historico ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "romaneios_historico_authenticated" ON romaneios_historico;

CREATE POLICY "romaneios_historico_authenticated"
  ON romaneios_historico FOR ALL TO authenticated
  USING (true) WITH CHECK (true);

-- Trigger: registra toda troca de status
CREATE OR REPLACE FUNCTION registra_historico_status_romaneio()
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

    INSERT INTO romaneios_historico (
      romaneio_id, tenant_id, status_anterior, status_novo, alterado_por, alterado_por_nome
    ) VALUES (
      NEW.id, NEW.tenant_id, OLD.status, NEW.status, auth.uid(), v_nome
    );
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_romaneios_historico_status ON romaneios;

CREATE TRIGGER trg_romaneios_historico_status
  AFTER UPDATE ON romaneios
  FOR EACH ROW
  EXECUTE FUNCTION registra_historico_status_romaneio();

-- Primeiro registro de cada romaneio: o status em que ele está hoje
INSERT INTO romaneios_historico (romaneio_id, tenant_id, status_anterior, status_novo, created_at)
SELECT id, tenant_id, NULL, status, COALESCE(updated_at, created_at)
  FROM romaneios
 WHERE NOT EXISTS (
   SELECT 1 FROM romaneios_historico h WHERE h.romaneio_id = romaneios.id
 );

COMMENT ON TABLE romaneios_historico IS
  'Historico de mudancas de status dos romaneios, alimentado por trigger';
