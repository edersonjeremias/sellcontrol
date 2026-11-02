-- ================================================================
-- MODULO DE PONTO (aba do RH)
--
-- Regra de ouro: marcacao e insert-only. Ninguem edita nem apaga,
-- nem o admin - e isso que da valor ao registro numa reclamatoria.
-- Correcao entra como linha em rh_ponto_ajustes, com motivo e autor.
-- A gravacao passa por funcao SECURITY DEFINER que confere o PIN e
-- carimba a hora do SERVIDOR (o relogio do aparelho e manipulavel).
--
-- Rodar inteiro no SQL Editor do Supabase.
-- ================================================================

-- ── 1. Dados de ponto no cadastro do funcionario ───────────────
ALTER TABLE funcionarios
  ADD COLUMN IF NOT EXISTS pin_ponto_hash        TEXT,
  ADD COLUMN IF NOT EXISTS carga_horaria_diaria  NUMERIC(4,2) DEFAULT 8;

COMMENT ON COLUMN funcionarios.pin_ponto_hash IS
  'Hash do PIN de 4 digitos usado no quiosque. Gravado so pela funcao rh_definir_pin';
COMMENT ON COLUMN funcionarios.carga_horaria_diaria IS
  'Horas contratuais por dia de trabalho, base do saldo do espelho de ponto';

-- ── 2. Marcacoes (insert-only) ─────────────────────────────────
CREATE TABLE IF NOT EXISTS rh_ponto_marcacoes (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id      UUID NOT NULL,
  funcionario_id UUID NOT NULL REFERENCES funcionarios(id),
  -- ENTRADA, SAIDA_ALMOCO, VOLTA_ALMOCO, SAIDA
  tipo           TEXT NOT NULL,
  -- Hora oficial: default now() e nunca recebe valor do cliente
  registrado_em  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- Dia de competencia da batida, no fuso de Sao Paulo
  dia            DATE NOT NULL DEFAULT ((NOW() AT TIME ZONE 'America/Sao_Paulo')::date),
  origem         TEXT,          -- QUIOSQUE, PAINEL
  foto_path      TEXT,          -- selfie no bucket rh-ponto (expurgada depois)
  foto_expirada  BOOLEAN NOT NULL DEFAULT FALSE,
  ip             TEXT,
  comprovante    TEXT NOT NULL, -- codigo curto que a funcionaria ve na tela
  registrado_por UUID,          -- quem estava logado no aparelho
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ponto_marc_func ON rh_ponto_marcacoes (funcionario_id, dia);
CREATE INDEX IF NOT EXISTS idx_ponto_marc_dia  ON rh_ponto_marcacoes (tenant_id, dia DESC);

-- ── 3. Ajustes (a correcao nunca sobrescreve a marcacao) ───────
CREATE TABLE IF NOT EXISTS rh_ponto_ajustes (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id      UUID NOT NULL,
  funcionario_id UUID NOT NULL REFERENCES funcionarios(id),
  marcacao_id    UUID REFERENCES rh_ponto_marcacoes(id),
  dia            DATE NOT NULL,
  tipo           TEXT NOT NULL,              -- a qual batida se refere
  valor_anterior TIMESTAMPTZ,                -- nulo = batida esquecida
  valor_novo     TIMESTAMPTZ,                -- nulo = batida a desconsiderar
  motivo         TEXT NOT NULL,
  autor          UUID,
  autor_nome     TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ponto_aj_func ON rh_ponto_ajustes (funcionario_id, dia);

-- ── 4. Fechamento mensal (espelho + assinatura) ────────────────
CREATE TABLE IF NOT EXISTS rh_ponto_fechamentos (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL,
  funcionario_id  UUID NOT NULL REFERENCES funcionarios(id) ON DELETE CASCADE,
  competencia     DATE NOT NULL,            -- mes do espelho, dia 1
  horas_previstas NUMERIC(8,2) DEFAULT 0,
  horas_apuradas  NUMERIC(8,2) DEFAULT 0,
  saldo_horas     NUMERIC(8,2) DEFAULT 0,
  faltas          INT DEFAULT 0,
  -- SHA-256 do PDF enviado: prova que o assinado e o mesmo documento
  pdf_hash        TEXT,
  gerado_em       TIMESTAMPTZ,
  enviado_em      TIMESTAMPTZ,
  assinado_em     TIMESTAMPTZ,
  assinado_path   TEXT,                     -- PDF que voltou assinado
  observacao      TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_ponto_fech
  ON rh_ponto_fechamentos (funcionario_id, competencia);

-- ── 5. RLS ─────────────────────────────────────────────────────
ALTER TABLE rh_ponto_marcacoes   ENABLE ROW LEVEL SECURITY;
ALTER TABLE rh_ponto_ajustes     ENABLE ROW LEVEL SECURITY;
ALTER TABLE rh_ponto_fechamentos ENABLE ROW LEVEL SECURITY;

-- Marcacao: so leitura. Sem policy de INSERT/UPDATE/DELETE de proposito —
-- a insercao passa pela funcao rh_registrar_ponto (SECURITY DEFINER).
DROP POLICY IF EXISTS "rls_ponto_marcacoes_select" ON rh_ponto_marcacoes;
CREATE POLICY "rls_ponto_marcacoes_select" ON rh_ponto_marcacoes
  FOR SELECT TO authenticated
  USING (tenant_id = get_tenant_id() OR get_user_role() = 'master');

-- Ajuste: le e insere; corrigir um ajuste e inserir outro.
DROP POLICY IF EXISTS "rls_ponto_ajustes_select" ON rh_ponto_ajustes;
DROP POLICY IF EXISTS "rls_ponto_ajustes_insert" ON rh_ponto_ajustes;
CREATE POLICY "rls_ponto_ajustes_select" ON rh_ponto_ajustes
  FOR SELECT TO authenticated
  USING (tenant_id = get_tenant_id() OR get_user_role() = 'master');
CREATE POLICY "rls_ponto_ajustes_insert" ON rh_ponto_ajustes
  FOR INSERT TO authenticated
  WITH CHECK (tenant_id = get_tenant_id() OR get_user_role() = 'master');

DROP POLICY IF EXISTS "rls_ponto_fechamentos" ON rh_ponto_fechamentos;
CREATE POLICY "rls_ponto_fechamentos" ON rh_ponto_fechamentos
  FOR ALL TO authenticated
  USING      (tenant_id = get_tenant_id() OR get_user_role() = 'master')
  WITH CHECK (tenant_id = get_tenant_id() OR get_user_role() = 'master');

-- ── 6. PIN do quiosque ─────────────────────────────────────────
-- O PIN nunca trafega nem fica guardado em texto. md5 com o id como sal
-- nao e criptografia forte, mas 4 digitos nao resistem a forca bruta de
-- qualquer forma: o objetivo aqui e nao expor o PIN a quem le a tabela.
CREATE OR REPLACE FUNCTION rh_definir_pin(p_funcionario UUID, p_pin TEXT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant UUID;
  v_role   TEXT;
BEGIN
  SELECT tenant_id, role INTO v_tenant, v_role FROM users_perfil WHERE id = auth.uid();
  IF v_tenant IS NULL THEN
    RAISE EXCEPTION 'Sem permissao';
  END IF;

  IF p_pin !~ '^[0-9]{4}$' THEN
    RAISE EXCEPTION 'O PIN deve ter 4 digitos';
  END IF;

  UPDATE funcionarios
     SET pin_ponto_hash = md5(p_pin || id::text)
   WHERE id = p_funcionario
     AND (tenant_id = v_tenant OR v_role = 'master');

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Funcionario nao encontrado';
  END IF;
END;
$$;

-- ── 7. Registro da batida ──────────────────────────────────────
-- Confere o PIN, carimba a hora do servidor e devolve o comprovante.
CREATE OR REPLACE FUNCTION rh_registrar_ponto(
  p_funcionario UUID,
  p_pin         TEXT,
  p_tipo        TEXT,
  p_foto        TEXT DEFAULT NULL,
  p_origem      TEXT DEFAULT 'QUIOSQUE'
)
RETURNS TABLE (id UUID, registrado_em TIMESTAMPTZ, comprovante TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant      UUID;
  v_role        TEXT;
  v_func        funcionarios%ROWTYPE;
  v_comprovante TEXT;
BEGIN
  SELECT tenant_id, role INTO v_tenant, v_role FROM users_perfil WHERE id = auth.uid();
  IF v_tenant IS NULL THEN
    RAISE EXCEPTION 'Sem permissao';
  END IF;

  IF p_tipo NOT IN ('ENTRADA', 'SAIDA_ALMOCO', 'VOLTA_ALMOCO', 'SAIDA') THEN
    RAISE EXCEPTION 'Tipo de marcacao invalido';
  END IF;

  SELECT * INTO v_func FROM funcionarios
   WHERE id = p_funcionario
     AND (tenant_id = v_tenant OR v_role = 'master');

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Funcionario nao encontrado';
  END IF;

  IF v_func.ativo IS FALSE THEN
    RAISE EXCEPTION 'Funcionario inativo';
  END IF;

  IF v_func.pin_ponto_hash IS NULL THEN
    RAISE EXCEPTION 'PIN ainda nao cadastrado';
  END IF;

  IF v_func.pin_ponto_hash <> md5(COALESCE(p_pin, '') || v_func.id::text) THEN
    RAISE EXCEPTION 'PIN incorreto';
  END IF;

  v_comprovante := upper(substr(md5(gen_random_uuid()::text), 1, 6));

  RETURN QUERY
  INSERT INTO rh_ponto_marcacoes (
    tenant_id, funcionario_id, tipo, origem, foto_path, comprovante, registrado_por
  ) VALUES (
    v_func.tenant_id, v_func.id, p_tipo, p_origem, p_foto, v_comprovante, auth.uid()
  )
  RETURNING rh_ponto_marcacoes.id,
            rh_ponto_marcacoes.registrado_em,
            rh_ponto_marcacoes.comprovante;
END;
$$;

-- Quem bate ponto no quiosque nao precisa (nem deve) ler salario e CPF
CREATE OR REPLACE FUNCTION rh_funcionarios_ponto()
RETURNS TABLE (id UUID, nome TEXT, apelido TEXT, tem_pin BOOLEAN)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT f.id, f.nome, f.apelido, (f.pin_ponto_hash IS NOT NULL)
    FROM funcionarios f
   WHERE f.ativo IS TRUE
     AND f.tenant_id = (SELECT tenant_id FROM users_perfil WHERE id = auth.uid())
   ORDER BY COALESCE(f.apelido, f.nome);
$$;

REVOKE ALL ON FUNCTION rh_definir_pin(UUID, TEXT)                        FROM public, anon;
REVOKE ALL ON FUNCTION rh_registrar_ponto(UUID, TEXT, TEXT, TEXT, TEXT)  FROM public, anon;
REVOKE ALL ON FUNCTION rh_funcionarios_ponto()                           FROM public, anon;
GRANT EXECUTE ON FUNCTION rh_definir_pin(UUID, TEXT)                       TO authenticated;
GRANT EXECUTE ON FUNCTION rh_registrar_ponto(UUID, TEXT, TEXT, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION rh_funcionarios_ponto()                          TO authenticated;

-- ── 8. Bucket privado das fotos e dos espelhos assinados ───────
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('rh-ponto', 'rh-ponto', FALSE, 5242880,
        ARRAY['image/jpeg', 'image/png', 'image/webp', 'application/pdf'])
ON CONFLICT (id) DO UPDATE
  SET public             = FALSE,
      file_size_limit    = 5242880,
      allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];

DROP POLICY IF EXISTS "rh_ponto_select" ON storage.objects;
DROP POLICY IF EXISTS "rh_ponto_insert" ON storage.objects;
DROP POLICY IF EXISTS "rh_ponto_delete" ON storage.objects;

CREATE POLICY "rh_ponto_select" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'rh-ponto'
         AND ((storage.foldername(name))[1] = public.get_tenant_id()::text
              OR public.get_user_role() = 'master'));

CREATE POLICY "rh_ponto_insert" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'rh-ponto'
              AND ((storage.foldername(name))[1] = public.get_tenant_id()::text
                   OR public.get_user_role() = 'master'));

-- Delete existe para o expurgo das fotos com mais de 6 meses
CREATE POLICY "rh_ponto_delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'rh-ponto'
         AND ((storage.foldername(name))[1] = public.get_tenant_id()::text
              OR public.get_user_role() = 'master'));

-- ── 9. Expurgo das selfies (a marcacao fica para sempre) ───────
-- Chamada pela aba Ponto no maximo uma vez por dia. Apaga so o caminho
-- da foto; a batida, o comprovante e a hora permanecem intocados.
CREATE OR REPLACE FUNCTION rh_ponto_expirar_fotos(p_meses INT DEFAULT 6)
RETURNS TABLE (caminho TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant UUID;
BEGIN
  SELECT tenant_id INTO v_tenant FROM users_perfil WHERE id = auth.uid();
  IF v_tenant IS NULL THEN
    RAISE EXCEPTION 'Sem permissao';
  END IF;

  RETURN QUERY
  UPDATE rh_ponto_marcacoes m
     SET foto_path = NULL, foto_expirada = TRUE
   WHERE m.tenant_id = v_tenant
     AND m.foto_path IS NOT NULL
     AND m.registrado_em < NOW() - (p_meses || ' months')::interval
  RETURNING m.foto_path;
END;
$$;

REVOKE ALL ON FUNCTION rh_ponto_expirar_fotos(INT) FROM public, anon;
GRANT EXECUTE ON FUNCTION rh_ponto_expirar_fotos(INT) TO authenticated;

-- ── 10. Pagina do quiosque no menu ─────────────────────────────
INSERT INTO pages (tenant_id, slug, label, category, icon, order_index)
SELECT id, 'ponto', 'Bater Ponto', 'RH', '🕐', 71
FROM tenants
WHERE NOT EXISTS (
  SELECT 1 FROM pages WHERE pages.tenant_id = tenants.id AND pages.slug = 'ponto'
);

INSERT INTO pages_access (tenant_id, user_id, page_id)
SELECT p.tenant_id, u.id, p.id
FROM pages p
JOIN users_perfil u ON u.tenant_id = p.tenant_id AND u.role IN ('master', 'admin')
WHERE p.slug = 'ponto'
  AND NOT EXISTS (
    SELECT 1 FROM pages_access a WHERE a.user_id = u.id AND a.page_id = p.id
  );

COMMENT ON TABLE rh_ponto_marcacoes   IS 'Batidas de ponto. Insert-only: sem policy de UPDATE/DELETE por decisao de projeto';
COMMENT ON TABLE rh_ponto_ajustes     IS 'Correcoes de ponto com motivo e autor; a marcacao original permanece';
COMMENT ON TABLE rh_ponto_fechamentos IS 'Espelho mensal: horas, hash do PDF enviado e o PDF assinado de volta';
