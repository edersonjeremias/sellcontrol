-- ============================================================
-- SELLCONTROL — SCRIPT DE REPARO
-- Execute este script se o schema.sql deu erro no trigger
-- Cole no Supabase > SQL Editor > New Query e clique Run
-- ============================================================

-- 1. Corrige o trigger
DROP TRIGGER IF EXISTS trg_vendas_updated_at ON vendas;
CREATE TRIGGER trg_vendas_updated_at
  BEFORE UPDATE ON vendas
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE IF NOT EXISTS producao_pedidos (
  id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id      UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  cliente_nome   TEXT NOT NULL DEFAULT '',
  status_prod    TEXT NOT NULL DEFAULT '',
  obs_cliente    TEXT NOT NULL DEFAULT '',
  obs_prod       TEXT NOT NULL DEFAULT '',
  peso           TEXT NOT NULL DEFAULT '',
  pacote         TEXT NOT NULL DEFAULT '',
  data_solicitado DATE NOT NULL DEFAULT CURRENT_DATE,
  dias           INTEGER NOT NULL DEFAULT 0,
  data_pronto    DATE,
  status_entrega TEXT NOT NULL DEFAULT '',
  pedido_codigo  TEXT NOT NULL DEFAULT '',
  valor_frete    NUMERIC(10,2),
  valor_dec      NUMERIC(10,2),
  msg_cobranca   TEXT NOT NULL DEFAULT '',
  data_enviado   DATE,
  rastreio       TEXT NOT NULL DEFAULT '',
  link_rastreio  TEXT NOT NULL DEFAULT '',
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DROP TRIGGER IF EXISTS trg_producao_updated_at ON producao_pedidos;
CREATE TRIGGER trg_producao_updated_at
  BEFORE UPDATE ON producao_pedidos
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- 2. Índices (IF NOT EXISTS = seguro rodar de novo)
CREATE INDEX IF NOT EXISTS idx_vendas_tenant_data    ON vendas(tenant_id, data_live);
CREATE INDEX IF NOT EXISTS idx_vendas_tenant_live    ON vendas(tenant_id, live_nome);
CREATE INDEX IF NOT EXISTS idx_vendas_status         ON vendas(tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_clientes_instagram    ON clientes(tenant_id, instagram);
CREATE INDEX IF NOT EXISTS idx_inad_cliente_status   ON inadimplencias(cliente_id, status);
CREATE INDEX IF NOT EXISTS idx_producao_tenant_data  ON producao_pedidos(tenant_id, data_solicitado);
CREATE INDEX IF NOT EXISTS idx_producao_status_prod  ON producao_pedidos(tenant_id, status_prod);
CREATE INDEX IF NOT EXISTS idx_producao_entrega      ON producao_pedidos(tenant_id, status_entrega);

ALTER TABLE tenants         ENABLE ROW LEVEL SECURITY;
ALTER TABLE users_perfil    ENABLE ROW LEVEL SECURITY;
ALTER TABLE clientes        ENABLE ROW LEVEL SECURITY;
ALTER TABLE inadimplencias  ENABLE ROW LEVEL SECURITY;
ALTER TABLE listas_produtos ENABLE ROW LEVEL SECURITY;
ALTER TABLE listas_modelos  ENABLE ROW LEVEL SECURITY;
ALTER TABLE listas_cores    ENABLE ROW LEVEL SECURITY;
ALTER TABLE listas_marcas   ENABLE ROW LEVEL SECURITY;
ALTER TABLE lives           ENABLE ROW LEVEL SECURITY;
ALTER TABLE vendas          ENABLE ROW LEVEL SECURITY;
ALTER TABLE producao_pedidos ENABLE ROW LEVEL SECURITY;

ALTER TABLE tenants
  ADD COLUMN IF NOT EXISTS cnpj TEXT,
  ADD COLUMN IF NOT EXISTS contato_celular TEXT;

ALTER TABLE users_perfil
  ADD COLUMN IF NOT EXISTS email TEXT,
  ADD COLUMN IF NOT EXISTS cpf TEXT,
  ADD COLUMN IF NOT EXISTS celular TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_tenants_cnpj_unique ON tenants (cnpj) WHERE cnpj IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_perfil_email_unique ON users_perfil (email) WHERE email IS NOT NULL;

-- 4. Funções auxiliares (OR REPLACE = seguro rodar de novo)
CREATE OR REPLACE FUNCTION get_tenant_id()
RETURNS UUID AS $$
  SELECT tenant_id FROM users_perfil WHERE id = auth.uid();
$$ LANGUAGE SQL STABLE SECURITY DEFINER;

CREATE OR REPLACE FUNCTION get_user_role()
RETURNS TEXT AS $$
  SELECT role FROM users_perfil WHERE id = auth.uid();
$$ LANGUAGE SQL STABLE SECURITY DEFINER;

-- 5. Políticas (apaga se existir e recria)
DO $$ DECLARE pol TEXT;
BEGIN
  FOR pol IN SELECT policyname FROM pg_policies WHERE tablename IN
    ('clientes','vendas','inadimplencias','listas_produtos','listas_modelos',
      'listas_cores','listas_marcas','lives','users_perfil','tenants','producao_pedidos')
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I', pol,
      (SELECT tablename FROM pg_policies WHERE policyname = pol LIMIT 1));
  END LOOP;
END $$;

-- SELECT
CREATE POLICY "sel_clientes"   ON clientes        FOR SELECT USING (tenant_id = get_tenant_id() OR get_user_role() = 'master');
CREATE POLICY "sel_vendas"     ON vendas          FOR SELECT USING (tenant_id = get_tenant_id() OR get_user_role() = 'master');
CREATE POLICY "sel_inad"       ON inadimplencias  FOR SELECT USING (tenant_id = get_tenant_id() OR get_user_role() = 'master');
CREATE POLICY "sel_produtos"   ON listas_produtos FOR SELECT USING (tenant_id = get_tenant_id() OR get_user_role() = 'master');
CREATE POLICY "sel_modelos"    ON listas_modelos  FOR SELECT USING (tenant_id = get_tenant_id() OR get_user_role() = 'master');
CREATE POLICY "sel_cores"      ON listas_cores    FOR SELECT USING (tenant_id = get_tenant_id() OR get_user_role() = 'master');
CREATE POLICY "sel_marcas"     ON listas_marcas   FOR SELECT USING (tenant_id = get_tenant_id() OR get_user_role() = 'master');
CREATE POLICY "sel_lives"      ON lives           FOR SELECT USING (tenant_id = get_tenant_id() OR get_user_role() = 'master');
CREATE POLICY "sel_perfil"     ON users_perfil    FOR SELECT USING (id = auth.uid() OR get_user_role() = 'master');
CREATE POLICY "sel_tenants"    ON tenants         FOR SELECT USING (get_user_role() = 'master');
CREATE POLICY "sel_producao"   ON producao_pedidos FOR SELECT USING (tenant_id = get_tenant_id() OR get_user_role() = 'master');

-- INSERT
CREATE POLICY "ins_clientes"   ON clientes        FOR INSERT WITH CHECK (tenant_id = get_tenant_id());
CREATE POLICY "ins_vendas"     ON vendas          FOR INSERT WITH CHECK (tenant_id = get_tenant_id());
CREATE POLICY "ins_inad"       ON inadimplencias  FOR INSERT WITH CHECK (tenant_id = get_tenant_id());
CREATE POLICY "ins_produtos"   ON listas_produtos FOR INSERT WITH CHECK (tenant_id = get_tenant_id());
CREATE POLICY "ins_modelos"    ON listas_modelos  FOR INSERT WITH CHECK (tenant_id = get_tenant_id());
CREATE POLICY "ins_cores"      ON listas_cores    FOR INSERT WITH CHECK (tenant_id = get_tenant_id());
CREATE POLICY "ins_marcas"     ON listas_marcas   FOR INSERT WITH CHECK (tenant_id = get_tenant_id());
CREATE POLICY "ins_lives"      ON lives           FOR INSERT WITH CHECK (tenant_id = get_tenant_id());
CREATE POLICY "ins_producao"   ON producao_pedidos FOR INSERT WITH CHECK (tenant_id = get_tenant_id());

-- UPDATE
CREATE POLICY "upd_vendas"     ON vendas          FOR UPDATE USING (tenant_id = get_tenant_id());
CREATE POLICY "upd_clientes"   ON clientes        FOR UPDATE USING (tenant_id = get_tenant_id());
CREATE POLICY "upd_producao"   ON producao_pedidos FOR UPDATE USING (tenant_id = get_tenant_id());

-- DELETE
CREATE POLICY "del_vendas"     ON vendas          FOR DELETE USING (tenant_id = get_tenant_id());
CREATE POLICY "del_producao"   ON producao_pedidos FOR DELETE USING (tenant_id = get_tenant_id());

-- ============================================================
-- PRONTO! Agora rode o INSERT abaixo para criar seu tenant:
-- ============================================================
-- INSERT INTO tenants (nome) VALUES ('VM Second Hand') RETURNING id;
