-- Adiciona colunas para divisão de pagamento
ALTER TABLE cobrancas ADD COLUMN IF NOT EXISTS dados_divisao JSONB;
ALTER TABLE cobrancas ADD COLUMN IF NOT EXISTS forma_pagamento TEXT;

-- Função atômica para processar pagamento de parte dividida
-- Usa FOR UPDATE para evitar race condition quando dois webhooks chegam juntos
CREATE OR REPLACE FUNCTION process_split_payment(
  p_cobranca_id UUID,
  p_parte        TEXT,      -- 'P1' ou 'P2'
  p_payment_id   TEXT,
  p_valor_liquido NUMERIC,
  p_data_pagamento TIMESTAMPTZ
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_cob   RECORD;
  v_dados JSONB;
  v_s1    TEXT;
  v_s2    TEXT;
  v_ambos BOOLEAN;
BEGIN
  SELECT * INTO v_cob FROM cobrancas WHERE id = p_cobranca_id FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_found');
  END IF;

  IF v_cob.status = 'PAGO' THEN
    RETURN jsonb_build_object('ok', true, 'skipped', true);
  END IF;

  v_dados := COALESCE(v_cob.dados_divisao, '{}'::JSONB);

  IF p_parte = 'P1' THEN
    v_dados := jsonb_set(v_dados, '{status_p1}', '"PAGO"');
    v_dados := jsonb_set(v_dados, '{id_mp_p1}',  to_jsonb(p_payment_id));
  ELSIF p_parte = 'P2' THEN
    v_dados := jsonb_set(v_dados, '{status_p2}', '"PAGO"');
    v_dados := jsonb_set(v_dados, '{id_mp_p2}',  to_jsonb(p_payment_id));
  END IF;

  v_s1    := v_dados->>'status_p1';
  v_s2    := v_dados->>'status_p2';
  v_ambos := (v_s1 = 'PAGO' AND v_s2 = 'PAGO');

  UPDATE cobrancas SET
    dados_divisao  = v_dados,
    valor_liquido  = COALESCE(valor_liquido, 0) + p_valor_liquido,
    status         = CASE WHEN v_ambos THEN 'PAGO'              ELSE status         END,
    data_pagamento = CASE WHEN v_ambos THEN p_data_pagamento    ELSE data_pagamento END,
    id_mp          = CASE WHEN v_ambos THEN p_payment_id        ELSE id_mp          END
  WHERE id = p_cobranca_id;

  RETURN jsonb_build_object('ok', true, 'ambos_pagos', v_ambos);
END;
$$;

GRANT EXECUTE ON FUNCTION process_split_payment TO service_role;
