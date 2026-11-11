-- ================================================================
-- DATA DE PAGAMENTO DO VALE TRANSPORTE
--
-- A conta a pagar do VT vencia sempre no ultimo dia do periodo, que
-- nem sempre e quando a loja paga: ha quem pague antes do periodo
-- comecar, para a funcionaria ter o dinheiro da passagem.
--
-- O periodo passa a ter sua propria data de vencimento. Em branco,
-- continua valendo a data final, que e o comportamento de hoje.
--
-- Rodar inteiro no SQL Editor do Supabase.
-- ================================================================

ALTER TABLE rh_vt_periodos
  ADD COLUMN IF NOT EXISTS data_vencimento DATE;

COMMENT ON COLUMN rh_vt_periodos.data_vencimento IS
  'Quando o VT deve ser pago; vazio usa a data final do periodo';

-- Periodos antigos ficam com o que ja estava valendo
UPDATE rh_vt_periodos
   SET data_vencimento = data_fim
 WHERE data_vencimento IS NULL;
