-- ================================================================
-- ORDEM DAS BATIDAS
--
-- Uma funcionaria registrou SAIDA as 08:06 ao chegar, porque o seletor
-- do quiosque estava nessa opcao. O dia dela ficou com 242 minutos de
-- atraso e saldo negativo de quase 12 horas.
--
-- A tela passou a bloquear a opcao fora de ordem, mas a regra tem que
-- valer no banco: tela velha em cache, aparelho com a pagina aberta ha
-- dias ou outra origem de batida furariam a protecao.
--
-- Regra: saida de almoco exige entrada; volta exige saida de almoco;
-- saida exige entrada; e a mesma batida nao se repete no dia.
--
-- Rodar inteiro no SQL Editor do Supabase.
-- ================================================================

CREATE OR REPLACE FUNCTION rh_registrar_ponto(
  p_funcionario UUID,
  p_pin         TEXT,
  p_tipo        TEXT,
  p_foto        TEXT DEFAULT NULL,
  p_origem      TEXT DEFAULT 'QUIOSQUE',
  p_lat         DOUBLE PRECISION DEFAULT NULL,
  p_lng         DOUBLE PRECISION DEFAULT NULL,
  p_precisao    DOUBLE PRECISION DEFAULT NULL
)
RETURNS TABLE (id UUID, registrado_em TIMESTAMPTZ, comprovante TEXT, distancia INT, fora BOOLEAN)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant      UUID;
  v_role        TEXT;
  v_func        funcionarios%ROWTYPE;
  v_comprovante TEXT;
  v_lat_loja    DOUBLE PRECISION;
  v_lng_loja    DOUBLE PRECISION;
  v_raio        INT;
  v_exigir      BOOLEAN;
  v_dist        INT;
  v_fora        BOOLEAN;
  v_limite      INT;
  v_ip          TEXT;
  v_dia         DATE;
  v_feitas      TEXT[];
  v_exige       TEXT;
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

  -- ── Ordem das batidas no dia ────────────────────────────────
  -- O dia e o do servidor, no fuso de Sao Paulo, igual ao default da
  -- coluna: o relogio do aparelho nao entra nesta conta.
  v_dia := (NOW() AT TIME ZONE 'America/Sao_Paulo')::date;

  SELECT COALESCE(array_agg(m.tipo), ARRAY[]::TEXT[])
    INTO v_feitas
    FROM rh_ponto_marcacoes m
   WHERE m.funcionario_id = v_func.id
     AND m.dia = v_dia;

  IF p_tipo = ANY(v_feitas) THEN
    RAISE EXCEPTION 'Essa batida ja foi registrada hoje';
  END IF;

  v_exige := CASE p_tipo
    WHEN 'SAIDA_ALMOCO' THEN 'ENTRADA'
    WHEN 'VOLTA_ALMOCO' THEN 'SAIDA_ALMOCO'
    WHEN 'SAIDA'        THEN 'ENTRADA'
    ELSE NULL
  END;

  IF v_exige IS NOT NULL AND NOT (v_exige = ANY(v_feitas)) THEN
    RAISE EXCEPTION 'Fora de ordem: registre % antes',
      CASE v_exige
        WHEN 'ENTRADA'      THEN 'a entrada'
        WHEN 'SAIDA_ALMOCO' THEN 'a saida para o almoco'
      END;
  END IF;

  -- ── Cerca: so vale se a loja tiver posicao cadastrada ───────
  SELECT c.ponto_latitude, c.ponto_longitude,
         COALESCE(c.ponto_raio_metros, 150), COALESCE(c.ponto_exigir_local, TRUE)
    INTO v_lat_loja, v_lng_loja, v_raio, v_exigir
    FROM configuracoes c
   WHERE c.tenant_id = v_func.tenant_id;

  IF v_lat_loja IS NOT NULL AND v_lng_loja IS NOT NULL THEN
    IF p_lat IS NULL OR p_lng IS NULL THEN
      IF v_exigir THEN
        RAISE EXCEPTION 'Localizacao nao autorizada no aparelho. Libere o acesso a localizacao para bater o ponto';
      END IF;
    ELSE
      v_dist   := rh_distancia_metros(v_lat_loja, v_lng_loja, p_lat, p_lng);
      v_limite := v_raio + LEAST(COALESCE(p_precisao, 0)::INT, 100);
      v_fora   := v_dist > v_limite;

      IF v_fora AND v_exigir THEN
        RAISE EXCEPTION 'Fora da loja: % m de distancia (limite de % m)', v_dist, v_limite;
      END IF;
    END IF;
  END IF;

  v_comprovante := upper(substr(md5(gen_random_uuid()::text), 1, 6));

  BEGIN
    v_ip := split_part(current_setting('request.headers', TRUE)::json ->> 'x-forwarded-for', ',', 1);
  EXCEPTION WHEN OTHERS THEN
    v_ip := NULL;
  END;

  RETURN QUERY
  INSERT INTO rh_ponto_marcacoes AS m (
    tenant_id, funcionario_id, tipo, origem, foto_path, comprovante, registrado_por,
    latitude, longitude, precisao_metros, distancia_metros, fora_da_cerca, ip
  ) VALUES (
    v_func.tenant_id, v_func.id, p_tipo, p_origem, p_foto, v_comprovante, auth.uid(),
    p_lat, p_lng, ROUND(p_precisao)::INT, v_dist, v_fora, v_ip
  )
  RETURNING m.id, m.registrado_em, m.comprovante, m.distancia_metros, m.fora_da_cerca;
END;
$$;

REVOKE ALL ON FUNCTION rh_registrar_ponto(UUID, TEXT, TEXT, TEXT, TEXT, DOUBLE PRECISION, DOUBLE PRECISION, DOUBLE PRECISION) FROM public, anon;
GRANT EXECUTE ON FUNCTION rh_registrar_ponto(UUID, TEXT, TEXT, TEXT, TEXT, DOUBLE PRECISION, DOUBLE PRECISION, DOUBLE PRECISION) TO authenticated;
