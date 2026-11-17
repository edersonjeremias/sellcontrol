-- Acesso do admin ao backup de live dos vendedores.
--
-- A policy original so deixava cada um ver o proprio backup. Se o vendedor
-- vai embora sem salvar a live, o que ficou na tela dele era inalcancavel:
-- o dono da loja nao conseguia recuperar a venda por estar no login do outro.
--
-- Esta policy e SOMENTE LEITURA e vale so dentro do mesmo tenant: admin e
-- master enxergam o backup dos vendedores da propria loja, e ninguem passa a
-- escrever no backup alheio (a policy de escrita continua sendo a original).

DROP POLICY IF EXISTS "vendas_backup_admin_le_do_tenant" ON vendas_backup;

CREATE POLICY "vendas_backup_admin_le_do_tenant"
  ON vendas_backup FOR SELECT TO authenticated
  USING (
    tenant_id = (SELECT tenant_id FROM users_perfil WHERE id = auth.uid())
    AND (SELECT role FROM users_perfil WHERE id = auth.uid()) IN ('admin', 'master')
  );

COMMENT ON POLICY "vendas_backup_admin_le_do_tenant" ON vendas_backup IS
  'Admin e master leem (nunca escrevem) o backup de live dos vendedores do proprio tenant';
