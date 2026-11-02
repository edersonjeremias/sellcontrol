-- ================================================================
-- CERCA DE LOCALIZACAO DO PONTO
--
-- Problema: a funcionaria pode bater o ponto do celular dela em casa,
-- ou levar o celular da loja embora. A batida passa a carregar a
-- posicao do aparelho, e QUEM CONFERE E O BANCO - nao o celular.
-- Conferir no JavaScript nao adiantaria: bastaria alterar o que o
-- aparelho envia. Aqui o cliente manda a coordenada crua e a funcao
-- decide se aceita.
--
-- Rodar inteiro no SQL Editor do Supabase.
-- ================================================================

-- ── 1. Onde fica a loja ────────────────────────────────────────
ALTER TABLE configuracoes
  ADD COLUMN IF NOT EXISTS ponto_latitude     NUMERIC(10,7),
  ADD COLUMN IF NOT EXISTS ponto_longitude    NUMERIC(10,7),
  ADD COLUMN IF NOT EXISTS ponto_raio_metros  INT     DEFAULT 150,
  ADD COLUMN IF NOT EXISTS ponto_exigir_local BOOLEAN DEFAULT TRUE;

COMMENT ON COLUMN configuracoes.ponto_latitude     IS 'Latitude da loja; sem ela a cerca fica desligada';
COMMENT ON COLUMN configuracoes.ponto_raio_metros  IS 'Distancia aceita da loja, em metros';
COMMENT ON COLUMN configuracoes.ponto_exigir_local IS 'TRUE recusa a batida fora da cerca; FALSE so marca como fora';

-- ── 2. O que ficou registrado na batida ────────────────────────
ALTER TABLE rh_ponto_marcacoes
  ADD COLUMN IF NOT EXISTS latitude          NUMERIC(10,7),
  ADD COLUMN IF NOT EXISTS longitude         NUMERIC(10,7),
  ADD COLUMN IF NOT EXISTS precisao_metros   INT,
  ADD COLUMN IF NOT EXISTS distancia_metros  INT,
  ADD COLUMN IF NOT EXISTS fora_da_cerca     BOOLEAN;

COMMENT ON COLUMN rh_ponto_marcacoes.precisao_metros  IS 'Margem de erro informada pelo GPS do aparelho';
COMMENT ON COLUMN rh_ponto_marcacoes.distancia_metros IS 'Distancia da loja no momento da batida, calculada no banco';

-- ── 3. Distancia entre dois pontos (Haversine) ─────────────────
CREATE OR REPLACE FUNCTION rh_distancia_metros(
  lat1 DOUBLE PRECISION, lng1 DOUBLE PRECISION,
  lat2 DOUBLE PRECISION, lng2 DOUBLE PRECISION
)
RETURNS INT
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT ROUND(
    6371000 * 2 * asin(sqrt(
      power(sin(radians(lat2 - lat1) / 2), 2) +
      cos(radians(lat1)) * cos(radians(lat2)) *
      power(sin(radians(lng2 - lng1) / 2), 2)
    ))
  )::INT;
$$;

-- ── 4. Registro da batida, agora com a cerca ───────────────────
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

  -- Cerca: so vale se a loja tiver posicao cadastrada
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
      v_dist := rh_distancia_metros(v_lat_loja, v_lng_loja, p_lat, p_lng);
      -- A margem de erro do GPS entra a favor de quem bate, mas no maximo
      -- 100 m: precisao ruim nao pode virar desculpa para qualquer lugar.
      v_limite := v_raio + LEAST(COALESCE(p_precisao, 0)::INT, 100);
      v_fora   := v_dist > v_limite;

      IF v_fora AND v_exigir THEN
        RAISE EXCEPTION 'Fora da loja: % m de distancia (limite de % m)', v_dist, v_limite;
      END IF;
    END IF;
  END IF;

  v_comprovante := upper(substr(md5(gen_random_uuid()::text), 1, 6));

  -- IP de quem chamou, util quando a loja tem internet fixa
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

-- A versao antiga de 5 argumentos sai de cena: deixar as duas no banco
-- faria o PostgREST escolher a errada e a cerca seria ignorada.
DROP FUNCTION IF EXISTS rh_registrar_ponto(UUID, TEXT, TEXT, TEXT, TEXT);

REVOKE ALL ON FUNCTION rh_registrar_ponto(UUID, TEXT, TEXT, TEXT, TEXT, DOUBLE PRECISION, DOUBLE PRECISION, DOUBLE PRECISION) FROM public, anon;
GRANT EXECUTE ON FUNCTION rh_registrar_ponto(UUID, TEXT, TEXT, TEXT, TEXT, DOUBLE PRECISION, DOUBLE PRECISION, DOUBLE PRECISION) TO authenticated;
