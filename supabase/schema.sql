-- ================================================================
-- VMKIDS SAAS — SCHEMA COMPLETO
-- Como executar:
--   1. Acesse seu projeto no Supabase
--   2. Vá em SQL Editor → New Query
--   3. Cole todo este conteúdo e clique em Run
-- ================================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ----------------------------------------------------------------
-- TENANTS (empresas que assinam o SaaS)
-- ----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS tenants (
  id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  nome       TEXT NOT NULL,
  plano      TEXT NOT NULL DEFAULT 'basico',
  ativo      BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ----------------------------------------------------------------
-- PERFIS DE USUÁRIO (complementa auth.users do Supabase)
-- ----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS users_perfil (
  id         UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  tenant_id  UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  role       TEXT NOT NULL DEFAULT 'usuario',  -- 'master' | 'admin' | 'usuario'
  nome       TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ----------------------------------------------------------------
-- CLIENTES
-- instagram = identificador principal usado nas vendas da live
-- ----------------------------------------------------------------
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

-- ----------------------------------------------------------------
-- INADIMPLÊNCIAS (gera bloqueio automático)
-- ----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS inadimplencias (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  cliente_id      UUID NOT NULL REFERENCES clientes(id) ON DELETE CASCADE,
  data_referencia DATE NOT NULL,
  valor           NUMERIC(10,2) NOT NULL DEFAULT 0,
  status          TEXT NOT NULL DEFAULT 'pendente',  -- 'pendente' | 'pago'
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ----------------------------------------------------------------
-- LISTAS DE AUTOCOMPLETE
-- ----------------------------------------------------------------
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

-- ----------------------------------------------------------------
-- LIVES
-- ----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS lives (
  id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id  UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  nome       TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(tenant_id, nome)
);

-- ----------------------------------------------------------------
-- VENDAS
-- Tabela única — sem banco temporário/definitivo separado.
-- status: ''  = pendente (ainda na tela da live)
--         'ENVIADO' = confirmado
-- ----------------------------------------------------------------
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

  status        TEXT NOT NULL DEFAULT '',      -- '' | 'ENVIADO'
  tipo_envio    TEXT NOT NULL DEFAULT '',      -- 'individual' | 'lote'

  fila1         TEXT NOT NULL DEFAULT '',
  fila2         TEXT NOT NULL DEFAULT '',
  fila3         TEXT NOT NULL DEFAULT '',

  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ----------------------------------------------------------------
-- PÁGINAS E PERMISSÕES DE ACESSO
-- ----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS pages (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id   UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  slug        TEXT NOT NULL,
  label       TEXT NOT NULL,
  category    TEXT NOT NULL DEFAULT 'Principal',
  icon        TEXT NOT NULL DEFAULT '',
  order_index INTEGER NOT NULL DEFAULT 100,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(tenant_id, slug)
);

CREATE TABLE IF NOT EXISTS pages_access (
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id   UUID NOT NULL REFERENCES users_perfil(id) ON DELETE CASCADE,
  page_id   UUID NOT NULL REFERENCES pages(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, page_id)
);

-- ----------------------------------------------------------------
-- COMUNICAÇÃO INTERNA / INFORMATIVOS
-- ----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS informativos (
  id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id      UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  mensagem       TEXT NOT NULL,
  status         TEXT NOT NULL DEFAULT 'Pendente',
  criador        TEXT NOT NULL DEFAULT '',
  destinatario   TEXT NOT NULL DEFAULT 'TODOS',
  data_insercao  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  data_conclusao TIMESTAMPTZ,
  respostas      JSONB NOT NULL DEFAULT '[]'
);

-- ----------------------------------------------------------------
-- ÍNDICES
-- ----------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_vendas_tenant_data   ON vendas(tenant_id, data_live);
CREATE INDEX IF NOT EXISTS idx_vendas_tenant_live   ON vendas(tenant_id, live_nome);
CREATE INDEX IF NOT EXISTS idx_vendas_status        ON vendas(tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_clientes_instagram   ON clientes(tenant_id, instagram);
CREATE INDEX IF NOT EXISTS idx_inadimp_cliente      ON inadimplencias(cliente_id, status);

-- ----------------------------------------------------------------
-- TRIGGER: updated_at automático
-- ----------------------------------------------------------------
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_vendas_updated_at
  BEFORE UPDATE ON vendas
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ----------------------------------------------------------------
-- ROW LEVEL SECURITY
-- ----------------------------------------------------------------
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
ALTER TABLE pages           ENABLE ROW LEVEL SECURITY;
ALTER TABLE pages_access    ENABLE ROW LEVEL SECURITY;
ALTER TABLE informativos    ENABLE ROW LEVEL SECURITY;

-- Funções auxiliares de segurança
CREATE OR REPLACE FUNCTION get_tenant_id()
RETURNS UUID AS $$
  SELECT tenant_id FROM users_perfil WHERE id = auth.uid();
$$ LANGUAGE SQL STABLE SECURITY DEFINER;

CREATE OR REPLACE FUNCTION get_user_role()
RETURNS TEXT AS $$
  SELECT role FROM users_perfil WHERE id = auth.uid();
$$ LANGUAGE SQL STABLE SECURITY DEFINER;

-- Políticas de leitura (SELECT)
CREATE POLICY "rls_clientes"   ON clientes   USING (tenant_id = get_tenant_id() OR get_user_role() = 'master');
CREATE POLICY "rls_vendas"     ON vendas      USING (tenant_id = get_tenant_id() OR get_user_role() = 'master');
CREATE POLICY "rls_inadimp"    ON inadimplencias USING (tenant_id = get_tenant_id() OR get_user_role() = 'master');
CREATE POLICY "rls_produtos"   ON listas_produtos USING (tenant_id = get_tenant_id() OR get_user_role() = 'master');
CREATE POLICY "rls_modelos"    ON listas_modelos  USING (tenant_id = get_tenant_id() OR get_user_role() = 'master');
CREATE POLICY "rls_cores"      ON listas_cores    USING (tenant_id = get_tenant_id() OR get_user_role() = 'master');
CREATE POLICY "rls_marcas"     ON listas_marcas   USING (tenant_id = get_tenant_id() OR get_user_role() = 'master');
CREATE POLICY "rls_lives"      ON lives       USING (tenant_id = get_tenant_id() OR get_user_role() = 'master');
CREATE POLICY "rls_perfil"     ON users_perfil USING (id = auth.uid() OR get_user_role() = 'master');
CREATE POLICY "rls_tenants"    ON tenants     USING (get_user_role() = 'master');
CREATE POLICY "rls_pages"      ON pages        USING (tenant_id = get_tenant_id() OR get_user_role() = 'master');
CREATE POLICY "rls_pages_access" ON pages_access USING (tenant_id = get_tenant_id() OR get_user_role() IN ('master','admin'));
CREATE POLICY "rls_informativos" ON informativos USING (tenant_id = get_tenant_id() OR get_user_role() = 'master');

-- Políticas de escrita (INSERT / UPDATE / DELETE)
CREATE POLICY "ins_clientes"   ON clientes   FOR INSERT WITH CHECK (tenant_id = get_tenant_id());
CREATE POLICY "ins_vendas"     ON vendas      FOR INSERT WITH CHECK (tenant_id = get_tenant_id());
CREATE POLICY "ins_inadimp"    ON inadimplencias FOR INSERT WITH CHECK (tenant_id = get_tenant_id());
CREATE POLICY "ins_produtos"   ON listas_produtos FOR INSERT WITH CHECK (tenant_id = get_tenant_id());
CREATE POLICY "ins_modelos"    ON listas_modelos  FOR INSERT WITH CHECK (tenant_id = get_tenant_id());
CREATE POLICY "ins_cores"      ON listas_cores    FOR INSERT WITH CHECK (tenant_id = get_tenant_id());
CREATE POLICY "ins_marcas"     ON listas_marcas   FOR INSERT WITH CHECK (tenant_id = get_tenant_id());
CREATE POLICY "ins_lives"      ON lives       FOR INSERT WITH CHECK (tenant_id = get_tenant_id());
CREATE POLICY "ins_pages"      ON pages       FOR INSERT WITH CHECK (tenant_id = get_tenant_id());
CREATE POLICY "ins_pages_access" ON pages_access FOR INSERT WITH CHECK (
  tenant_id = get_tenant_id() OR get_user_role() IN ('master','admin')
);
CREATE POLICY "ins_informativos" ON informativos FOR INSERT WITH CHECK (tenant_id = get_tenant_id());

CREATE POLICY "upd_vendas"     ON vendas   FOR UPDATE USING (tenant_id = get_tenant_id());
CREATE POLICY "upd_clientes"   ON clientes FOR UPDATE USING (tenant_id = get_tenant_id());
CREATE POLICY "upd_informativos" ON informativos FOR UPDATE USING (tenant_id = get_tenant_id() OR get_user_role() = 'master');
CREATE POLICY "del_vendas"     ON vendas   FOR DELETE USING (tenant_id = get_tenant_id());
CREATE POLICY "del_informativos" ON informativos FOR DELETE USING (tenant_id = get_tenant_id() OR get_user_role() = 'master');
CREATE POLICY "del_pages_access" ON pages_access FOR DELETE USING (
  user_id = auth.uid() OR get_user_role() IN ('master','admin')
);

-- ================================================================
-- DADOS INICIAIS
-- Execute este bloco separadamente após o schema acima.
-- Ele cria seu tenant e retorna o UUID — copie para o .env
-- ================================================================
-- INSERT INTO tenants (nome, plano) VALUES ('VM Kids', 'basico') RETURNING id;
