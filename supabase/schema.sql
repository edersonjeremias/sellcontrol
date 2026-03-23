-- ============================================================
-- SELLCONTROL - SCHEMA COMPLETO
-- Execute no: Supabase > SQL Editor > New Query
-- ============================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================
-- TENANTS (empresas que assinam o SaaS)
-- ============================================================
CREATE TABLE IF NOT EXISTS tenants (
  id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  nome       TEXT NOT NULL,
  plano      TEXT NOT NULL DEFAULT 'basico',
  ativo      BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- PERFIS DE USUÁRIO (complementa o auth.users do Supabase)
-- ============================================================
CREATE TABLE IF NOT EXISTS users_perfil (
  id         UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  tenant_id  UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  role       TEXT NOT NULL DEFAULT 'usuario', -- 'master' | 'admin' | 'usuario'
  nome       TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- CLIENTES
-- instagram = identificador principal usado nas vendas
-- ============================================================
CREATE TABLE IF NOT EXISTS clientes (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id     UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  instagram     TEXT NOT NULL,
  whatsapp      TEXT NOT NULL DEFAULT '',
  data_cadastro DATE NOT NULL DEFAULT CURRENT_DATE,
  bloqueado     BOOLEAN NOT NULL DEFAULT FALSE,
  msg_bloqueio  TEXT NOT NULL DEFAULT '',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(tenant_id, instagram)
);

-- ============================================================
-- INADIMPLÊNCIAS
-- ============================================================
CREATE TABLE IF NOT EXISTS inadimplencias (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  cliente_id      UUID NOT NULL REFERENCES clientes(id) ON DELETE CASCADE,
  data_referencia DATE NOT NULL,
  valor           NUMERIC(10,2) NOT NULL DEFAULT 0,
  status          TEXT NOT NULL DEFAULT 'pendente', -- 'pendente' | 'pago'
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- LISTAS DE AUTOCOMPLETE
-- ============================================================
CREATE TABLE IF NOT EXISTS listas_produtos (
  id        UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  nome      TEXT NOT NULL,
  UNIQUE(tenant_id, nome)
);

CREATE TABLE IF NOT EXISTS listas_modelos (
  id        UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  nome      TEXT NOT NULL,
  UNIQUE(tenant_id, nome)
);

CREATE TABLE IF NOT EXISTS listas_cores (
  id        UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  nome      TEXT NOT NULL,
  UNIQUE(tenant_id, nome)
);

CREATE TABLE IF NOT EXISTS listas_marcas (
  id        UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  nome      TEXT NOT NULL,
  UNIQUE(tenant_id, nome)
);

-- ============================================================
-- LIVES
-- ============================================================
CREATE TABLE IF NOT EXISTS lives (
  id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id  UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  nome       TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(tenant_id, nome)
);

-- ============================================================
-- VENDAS (tabela única — sem banco temporário/definitivo)
-- status: '' = pendente | 'ENVIADO' = confirmado
-- tipo_envio: 'individual' | 'lote'
-- ============================================================
CREATE TABLE IF NOT EXISTS vendas (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id     UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  produto       TEXT NOT NULL DEFAULT '',
  modelo        TEXT NOT NULL DEFAULT '',
  cor           TEXT NOT NULL DEFAULT '',
  marca         TEXT NOT NULL DEFAULT '',
  tamanho       TEXT NOT NULL DEFAULT '',
  preco         NUMERIC(10,2),
  codigo        TEXT NOT NULL DEFAULT '',
  cliente_nome  TEXT NOT NULL DEFAULT '',
  cliente_id    UUID REFERENCES clientes(id) ON DELETE SET NULL,
  data_live     DATE,
  live_nome     TEXT NOT NULL DEFAULT '',
  sacolinha     INTEGER,
  status        TEXT NOT NULL DEFAULT '',
  tipo_envio    TEXT NOT NULL DEFAULT '',
  fila1         TEXT NOT NULL DEFAULT '',
  fila2         TEXT NOT NULL DEFAULT '',
  fila3         TEXT NOT NULL DEFAULT '',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- TRIGGER: atualiza updated_at automaticamente
-- ============================================================
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_vendas_updated_at ON vendas;
CREATE TRIGGER trg_vendas_updated_at
  BEFORE UPDATE ON vendas
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ============================================================
-- ÍNDICES
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_vendas_tenant_data    ON vendas(tenant_id, data_live);
CREATE INDEX IF NOT EXISTS idx_vendas_tenant_live    ON vendas(tenant_id, live_nome);
CREATE INDEX IF NOT EXISTS idx_vendas_status         ON vendas(tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_clientes_instagram    ON clientes(tenant_id, instagram);
CREATE INDEX IF NOT EXISTS idx_inad_cliente_status   ON inadimplencias(cliente_id, status);

-- ============================================================
-- ROW LEVEL SECURITY (RLS)
-- ============================================================
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

-- Funções auxiliares
CREATE OR REPLACE FUNCTION get_tenant_id()
RETURNS UUID AS $$
  SELECT tenant_id FROM users_perfil WHERE id = auth.uid();
$$ LANGUAGE SQL STABLE SECURITY DEFINER;

CREATE OR REPLACE FUNCTION get_user_role()
RETURNS TEXT AS $$
  SELECT role FROM users_perfil WHERE id = auth.uid();
$$ LANGUAGE SQL STABLE SECURITY DEFINER;

-- Políticas SELECT
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

-- Políticas INSERT
CREATE POLICY "ins_clientes"   ON clientes        FOR INSERT WITH CHECK (tenant_id = get_tenant_id());
CREATE POLICY "ins_vendas"     ON vendas          FOR INSERT WITH CHECK (tenant_id = get_tenant_id());
CREATE POLICY "ins_inad"       ON inadimplencias  FOR INSERT WITH CHECK (tenant_id = get_tenant_id());
CREATE POLICY "ins_produtos"   ON listas_produtos FOR INSERT WITH CHECK (tenant_id = get_tenant_id());
CREATE POLICY "ins_modelos"    ON listas_modelos  FOR INSERT WITH CHECK (tenant_id = get_tenant_id());
CREATE POLICY "ins_cores"      ON listas_cores    FOR INSERT WITH CHECK (tenant_id = get_tenant_id());
CREATE POLICY "ins_marcas"     ON listas_marcas   FOR INSERT WITH CHECK (tenant_id = get_tenant_id());
CREATE POLICY "ins_lives"      ON lives           FOR INSERT WITH CHECK (tenant_id = get_tenant_id());

-- Políticas UPDATE
CREATE POLICY "upd_vendas"     ON vendas          FOR UPDATE USING (tenant_id = get_tenant_id());
CREATE POLICY "upd_clientes"   ON clientes        FOR UPDATE USING (tenant_id = get_tenant_id());

-- Políticas DELETE
CREATE POLICY "del_vendas"     ON vendas          FOR DELETE USING (tenant_id = get_tenant_id());

-- ============================================================
-- FIM DO SCHEMA
-- Próximo passo: INSERT INTO tenants (nome) VALUES ('Sua Empresa') RETURNING id;
-- ============================================================
