-- Backup da live em andamento, espelhado no banco.
--
-- Hoje o backup vive só no localStorage do navegador: se a máquina morre,
-- o backup morre junto. Esta tabela guarda exatamente o MESMO payload no
-- servidor, então a live pode ser recuperada de qualquer computador.
--
-- Um registro por usuário/tenant, porque duas pessoas da mesma loja podem
-- estar rodando lives diferentes ao mesmo tempo e não podem se sobrescrever.

CREATE TABLE IF NOT EXISTS vendas_backup (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id     UUID NOT NULL,
  usuario_id    UUID NOT NULL,
  payload       JSONB NOT NULL,
  atualizado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE (tenant_id, usuario_id)
);

CREATE INDEX IF NOT EXISTS idx_vendas_backup_usuario
  ON vendas_backup (tenant_id, usuario_id);

ALTER TABLE vendas_backup ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "vendas_backup_proprio_usuario" ON vendas_backup;

CREATE POLICY "vendas_backup_proprio_usuario"
  ON vendas_backup FOR ALL TO authenticated
  USING (
    usuario_id = auth.uid()
    AND tenant_id IN (SELECT tenant_id FROM users_perfil WHERE id = auth.uid())
  )
  WITH CHECK (
    usuario_id = auth.uid()
    AND tenant_id IN (SELECT tenant_id FROM users_perfil WHERE id = auth.uid())
  );

COMMENT ON TABLE vendas_backup IS
  'Backup da live em andamento (espelho do localStorage) para recuperar de qualquer maquina';
