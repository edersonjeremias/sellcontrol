-- ================================================================
-- CORRECAO: column reference "id" is ambiguous ao bater o ponto
--
-- RETURNS TABLE (id UUID, ...) cria uma variavel chamada "id" dentro
-- da funcao. Com isso, "WHERE id = auth.uid()" ficou ambiguo entre a
-- variavel e a coluna da tabela. A correcao qualifica toda coluna
-- com o alias da tabela. So recria as funcoes; nenhum dado e tocado.
--
-- Rodar inteiro no SQL Editor do Supabase.
-- ================================================================

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
  SELECT up.tenant_id, up.role INTO v_tenant, v_role
    FROM users_perfil up
   WHERE up.id = auth.uid();

  IF v_tenant IS NULL THEN
    RAISE EXCEPTION 'Sem permissao';
  END IF;

  IF p_tipo NOT IN ('ENTRADA', 'SAIDA_ALMOCO', 'VOLTA_ALMOCO', 'SAIDA') THEN
    RAISE EXCEPTION 'Tipo de marcacao invalido';
  END IF;

  SELECT f.* INTO v_func
    FROM funcionarios f
   WHERE f.id = p_funcionario
     AND (f.tenant_id = v_tenant OR v_role = 'master');

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
  INSERT INTO rh_ponto_marcacoes AS m (
    tenant_id, funcionario_id, tipo, origem, foto_path, comprovante, registrado_por
  ) VALUES (
    v_func.tenant_id, v_func.id, p_tipo, p_origem, p_foto, v_comprovante, auth.uid()
  )
  RETURNING m.id, m.registrado_em, m.comprovante;
END;
$$;

CREATE OR REPLACE FUNCTION rh_funcionarios_ponto()
RETURNS TABLE (id UUID, nome TEXT, apelido TEXT, tem_pin BOOLEAN)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT f.id, f.nome, f.apelido, (f.pin_ponto_hash IS NOT NULL)
    FROM funcionarios f
   WHERE f.ativo IS TRUE
     AND f.tenant_id = (SELECT up.tenant_id FROM users_perfil up WHERE up.id = auth.uid())
   ORDER BY COALESCE(f.apelido, f.nome);
$$;

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
  SELECT up.tenant_id, up.role INTO v_tenant, v_role
    FROM users_perfil up
   WHERE up.id = auth.uid();

  IF v_tenant IS NULL THEN
    RAISE EXCEPTION 'Sem permissao';
  END IF;

  IF p_pin !~ '^[0-9]{4}$' THEN
    RAISE EXCEPTION 'O PIN deve ter 4 digitos';
  END IF;

  UPDATE funcionarios f
     SET pin_ponto_hash = md5(p_pin || f.id::text)
   WHERE f.id = p_funcionario
     AND (f.tenant_id = v_tenant OR v_role = 'master');

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Funcionario nao encontrado';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION rh_ponto_expirar_fotos(p_meses INT DEFAULT 6)
RETURNS TABLE (caminho TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant UUID;
BEGIN
  SELECT up.tenant_id INTO v_tenant
    FROM users_perfil up
   WHERE up.id = auth.uid();

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

REVOKE ALL ON FUNCTION rh_definir_pin(UUID, TEXT)                        FROM public, anon;
REVOKE ALL ON FUNCTION rh_registrar_ponto(UUID, TEXT, TEXT, TEXT, TEXT)  FROM public, anon;
REVOKE ALL ON FUNCTION rh_funcionarios_ponto()                           FROM public, anon;
REVOKE ALL ON FUNCTION rh_ponto_expirar_fotos(INT)                       FROM public, anon;
GRANT EXECUTE ON FUNCTION rh_definir_pin(UUID, TEXT)                       TO authenticated;
GRANT EXECUTE ON FUNCTION rh_registrar_ponto(UUID, TEXT, TEXT, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION rh_funcionarios_ponto()                          TO authenticated;
GRANT EXECUTE ON FUNCTION rh_ponto_expirar_fotos(INT)                      TO authenticated;
