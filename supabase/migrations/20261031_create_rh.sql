-- ================================================================
-- MODULO RH — funcionarios, vales/pagamentos, faltas/atrasos,
-- feriados e vale transporte (periodos + dias).
-- Rodar inteiro no SQL Editor do Supabase.
-- ================================================================

-- ── 1. Cadastro de funcionarios ────────────────────────────────
CREATE TABLE IF NOT EXISTS funcionarios (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID,
  nome            TEXT NOT NULL,
  apelido         TEXT,
  cpf             TEXT,
  rg              TEXT,
  whatsapp        TEXT,
  email           TEXT,
  cargo           TEXT,
  setor           TEXT,
  data_admissao   DATE,
  data_demissao   DATE,
  salario         NUMERIC(12,2) DEFAULT 0,
  tipo_contrato   TEXT DEFAULT 'CLT',
  dia_pagamento   INT,
  chave_pix       TEXT,
  banco           TEXT,
  endereco        TEXT,
  -- Dias da semana trabalhados: 0=domingo ... 6=sabado
  dias_trabalho   TEXT DEFAULT '1,2,3,4,5',
  vt_valor_ida    NUMERIC(12,2) DEFAULT 0,
  vt_valor_volta  NUMERIC(12,2) DEFAULT 0,
  observacoes     TEXT,
  ativo           BOOLEAN NOT NULL DEFAULT TRUE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_funcionarios_tenant ON funcionarios (tenant_id, ativo, nome);

-- ── 2. Vales, adiantamentos e pagamentos ───────────────────────
CREATE TABLE IF NOT EXISTS rh_lancamentos (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID,
  funcionario_id  UUID NOT NULL REFERENCES funcionarios(id) ON DELETE CASCADE,
  -- VALE, ADIANTAMENTO, SALARIO, BONUS, DESCONTO, VALE_TRANSPORTE, REEMBOLSO
  tipo            TEXT NOT NULL DEFAULT 'VALE',
  descricao       TEXT,
  valor           NUMERIC(12,2) NOT NULL DEFAULT 0,
  data_prevista   DATE,
  status          TEXT NOT NULL DEFAULT 'PENDENTE',
  data_pagamento  DATE,
  forma_pagamento TEXT,
  observacao      TEXT,
  vt_periodo_id   UUID,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_rh_lanc_tenant ON rh_lancamentos (tenant_id, data_prevista DESC);
CREATE INDEX IF NOT EXISTS idx_rh_lanc_func   ON rh_lancamentos (funcionario_id, data_prevista DESC);

-- ── 3. Faltas, atrasos e demais ocorrencias ────────────────────
CREATE TABLE IF NOT EXISTS rh_ocorrencias (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID,
  funcionario_id  UUID NOT NULL REFERENCES funcionarios(id) ON DELETE CASCADE,
  data            DATE NOT NULL,
  -- FALTA, ATRASO, SAIDA_ANTECIPADA, ATESTADO, FOLGA
  tipo            TEXT NOT NULL DEFAULT 'FALTA',
  minutos         INT DEFAULT 0,
  justificada     BOOLEAN NOT NULL DEFAULT FALSE,
  -- descontar: entra no desconto do vale transporte e do pagamento
  descontar       BOOLEAN NOT NULL DEFAULT TRUE,
  valor_desconto  NUMERIC(12,2) DEFAULT 0,
  observacao      TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_rh_ocor_tenant ON rh_ocorrencias (tenant_id, data DESC);
CREATE INDEX IF NOT EXISTS idx_rh_ocor_func   ON rh_ocorrencias (funcionario_id, data);

-- ── 4. Feriados do tenant (usados no calculo do VT) ────────────
CREATE TABLE IF NOT EXISTS rh_feriados (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID,
  data        DATE NOT NULL,
  descricao   TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_rh_feriados_tenant_data ON rh_feriados (tenant_id, data);

-- ── 5. Vale transporte: periodo a pagar ────────────────────────
CREATE TABLE IF NOT EXISTS rh_vt_periodos (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID,
  funcionario_id  UUID NOT NULL REFERENCES funcionarios(id) ON DELETE CASCADE,
  data_inicio     DATE NOT NULL,
  data_fim        DATE NOT NULL,
  valor_ida       NUMERIC(12,2) NOT NULL DEFAULT 0,
  valor_volta     NUMERIC(12,2) NOT NULL DEFAULT 0,
  dias_uteis      INT DEFAULT 0,
  total_bruto     NUMERIC(12,2) DEFAULT 0,
  total_descontos NUMERIC(12,2) DEFAULT 0,
  total_liquido   NUMERIC(12,2) DEFAULT 0,
  status          TEXT NOT NULL DEFAULT 'PENDENTE',
  data_pagamento  DATE,
  observacao      TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_rh_vt_tenant ON rh_vt_periodos (tenant_id, data_inicio DESC);
CREATE INDEX IF NOT EXISTS idx_rh_vt_func   ON rh_vt_periodos (funcionario_id, data_inicio DESC);

-- ── 6. Vale transporte: um registro por dia do periodo ─────────
CREATE TABLE IF NOT EXISTS rh_vt_dias (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID,
  periodo_id  UUID NOT NULL REFERENCES rh_vt_periodos(id) ON DELETE CASCADE,
  data        DATE NOT NULL,
  ida         BOOLEAN NOT NULL DEFAULT TRUE,
  volta       BOOLEAN NOT NULL DEFAULT TRUE,
  -- vazio = dia normal. FALTA, FERIADO, FOLGA, NAO_USOU, ATESTADO
  motivo      TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_rh_vt_dias_periodo_data ON rh_vt_dias (periodo_id, data);

-- ── 7. RLS ─────────────────────────────────────────────────────
ALTER TABLE funcionarios    ENABLE ROW LEVEL SECURITY;
ALTER TABLE rh_lancamentos  ENABLE ROW LEVEL SECURITY;
ALTER TABLE rh_ocorrencias  ENABLE ROW LEVEL SECURITY;
ALTER TABLE rh_feriados     ENABLE ROW LEVEL SECURITY;
ALTER TABLE rh_vt_periodos  ENABLE ROW LEVEL SECURITY;
ALTER TABLE rh_vt_dias      ENABLE ROW LEVEL SECURITY;

-- CPF, salário e endereço não podem atravessar a fronteira do tenant:
-- cada tabela fica restrita ao tenant do usuário (master vê tudo, como no resto
-- do schema). get_tenant_id() e get_user_role() já existem em schema.sql.
DROP POLICY IF EXISTS "rls_funcionarios"   ON funcionarios;
DROP POLICY IF EXISTS "rls_rh_lancamentos" ON rh_lancamentos;
DROP POLICY IF EXISTS "rls_rh_ocorrencias" ON rh_ocorrencias;
DROP POLICY IF EXISTS "rls_rh_feriados"    ON rh_feriados;
DROP POLICY IF EXISTS "rls_rh_vt_periodos" ON rh_vt_periodos;
DROP POLICY IF EXISTS "rls_rh_vt_dias"     ON rh_vt_dias;

CREATE POLICY "rls_funcionarios" ON funcionarios FOR ALL TO authenticated
  USING      (tenant_id = get_tenant_id() OR get_user_role() = 'master')
  WITH CHECK (tenant_id = get_tenant_id() OR get_user_role() = 'master');

CREATE POLICY "rls_rh_lancamentos" ON rh_lancamentos FOR ALL TO authenticated
  USING      (tenant_id = get_tenant_id() OR get_user_role() = 'master')
  WITH CHECK (tenant_id = get_tenant_id() OR get_user_role() = 'master');

CREATE POLICY "rls_rh_ocorrencias" ON rh_ocorrencias FOR ALL TO authenticated
  USING      (tenant_id = get_tenant_id() OR get_user_role() = 'master')
  WITH CHECK (tenant_id = get_tenant_id() OR get_user_role() = 'master');

CREATE POLICY "rls_rh_feriados" ON rh_feriados FOR ALL TO authenticated
  USING      (tenant_id = get_tenant_id() OR get_user_role() = 'master')
  WITH CHECK (tenant_id = get_tenant_id() OR get_user_role() = 'master');

CREATE POLICY "rls_rh_vt_periodos" ON rh_vt_periodos FOR ALL TO authenticated
  USING      (tenant_id = get_tenant_id() OR get_user_role() = 'master')
  WITH CHECK (tenant_id = get_tenant_id() OR get_user_role() = 'master');

CREATE POLICY "rls_rh_vt_dias" ON rh_vt_dias FOR ALL TO authenticated
  USING      (tenant_id = get_tenant_id() OR get_user_role() = 'master')
  WITH CHECK (tenant_id = get_tenant_id() OR get_user_role() = 'master');

-- ── 8. Pagina no menu de todos os tenants ──────────────────────
INSERT INTO pages (tenant_id, slug, label, category, icon, order_index)
SELECT id, 'rh', 'RH', 'RH', '👥', 70
FROM tenants
WHERE NOT EXISTS (
  SELECT 1 FROM pages WHERE pages.tenant_id = tenants.id AND pages.slug = 'rh'
);

-- ── 9. Libera a pagina para os admins do tenant ────────────────
INSERT INTO pages_access (tenant_id, user_id, page_id)
SELECT p.tenant_id, u.id, p.id
FROM pages p
JOIN users_perfil u ON u.tenant_id = p.tenant_id AND u.role IN ('master', 'admin')
WHERE p.slug = 'rh'
  AND NOT EXISTS (
    SELECT 1 FROM pages_access a WHERE a.user_id = u.id AND a.page_id = p.id
  );

COMMENT ON TABLE funcionarios   IS 'Cadastro de funcionarios (modulo RH)';
COMMENT ON TABLE rh_lancamentos IS 'Vales, adiantamentos, salarios e descontos por funcionario';
COMMENT ON TABLE rh_ocorrencias IS 'Faltas, atrasos e demais ocorrencias de ponto';
COMMENT ON TABLE rh_feriados    IS 'Feriados do tenant, descontados do vale transporte';
COMMENT ON TABLE rh_vt_periodos IS 'Periodos de vale transporte a pagar';
COMMENT ON TABLE rh_vt_dias     IS 'Dias de cada periodo de VT, com ida/volta e motivo do desconto';
