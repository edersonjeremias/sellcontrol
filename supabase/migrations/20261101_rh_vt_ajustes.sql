-- ================================================================
-- AJUSTES DE DIAS ANTERIORES NO VALE TRANSPORTE
-- Dia de um periodo ja pago que so agora esta sendo descontado:
-- entra no periodo atual com a data de referencia original, abate do
-- total e NAO conta no valor cheio do periodo.
-- Rodar inteiro no SQL Editor do Supabase.
-- ================================================================

ALTER TABLE rh_vt_dias
  ADD COLUMN IF NOT EXISTS ajuste     BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS observacao TEXT;

COMMENT ON COLUMN rh_vt_dias.ajuste IS
  'TRUE = desconto referente a um dia fora deste periodo (periodo anterior)';
COMMENT ON COLUMN rh_vt_dias.observacao IS
  'Nota livre do ajuste, sai na mensagem do WhatsApp';
