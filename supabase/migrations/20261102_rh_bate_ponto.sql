-- ================================================================
-- QUEM BATE PONTO E QUEM NAO BATE
--
-- Prestador PJ nao tem controle de jornada, entao nao faz sentido
-- aparecer no quiosque nem ter espelho apurado. Vira uma opcao do
-- cadastro em vez de uma regra fixa por tipo de contrato: a loja
-- decide caso a caso.
--
-- O UPDATE ja desmarca quem esta como PJ. Se algum PJ precisar
-- bater ponto, e so marcar de volta no cadastro.
--
-- Rodar inteiro no SQL Editor do Supabase.
-- ================================================================

ALTER TABLE funcionarios
  ADD COLUMN IF NOT EXISTS bate_ponto BOOLEAN NOT NULL DEFAULT TRUE;

COMMENT ON COLUMN funcionarios.bate_ponto IS
  'Aparece no quiosque de ponto e tem espelho apurado';

UPDATE funcionarios SET bate_ponto = FALSE WHERE tipo_contrato = 'PJ';

-- A lista do quiosque passa a respeitar a marcacao
CREATE OR REPLACE FUNCTION rh_funcionarios_ponto()
RETURNS TABLE (id UUID, nome TEXT, apelido TEXT, tem_pin BOOLEAN)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT f.id, f.nome, f.apelido, (f.pin_ponto_hash IS NOT NULL)
    FROM funcionarios f
   WHERE f.ativo IS TRUE
     AND f.bate_ponto IS TRUE
     AND f.tenant_id = (SELECT up.tenant_id FROM users_perfil up WHERE up.id = auth.uid())
   ORDER BY COALESCE(f.apelido, f.nome);
$$;

-- Quem bate ponto tambem nao pode ser gravado por fora da regra
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

  IF v_func.bate_ponto IS FALSE THEN
    RAISE EXCEPTION 'Este funcionario nao bate ponto';
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

REVOKE ALL ON FUNCTION rh_registrar_ponto(UUID, TEXT, TEXT, TEXT, TEXT)  FROM public, anon;
REVOKE ALL ON FUNCTION rh_funcionarios_ponto()                           FROM public, anon;
GRANT EXECUTE ON FUNCTION rh_registrar_ponto(UUID, TEXT, TEXT, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION rh_funcionarios_ponto()                          TO authenticated;
