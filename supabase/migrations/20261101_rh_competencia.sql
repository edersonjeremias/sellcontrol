-- ================================================================
-- COMPETENCIA DOS LANCAMENTOS DO RH
-- A data do lancamento nao diz em que acerto ele entra: o vale de
-- 14/10 e o salario de outubro pago em 06/11 fecham no mesmo recibo.
-- A competencia guarda o mes do acerto, sempre no dia 1.
-- Rodar inteiro no SQL Editor do Supabase.
-- ================================================================

ALTER TABLE rh_lancamentos
  ADD COLUMN IF NOT EXISTS competencia DATE;

-- Lancamentos antigos: competencia = mes do vencimento
UPDATE rh_lancamentos
   SET competencia = date_trunc('month', data_prevista)::date
 WHERE competencia IS NULL
   AND data_prevista IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_rh_lanc_competencia
  ON rh_lancamentos (tenant_id, competencia);

COMMENT ON COLUMN rh_lancamentos.competencia IS
  'Mes do acerto em que este lancamento entra (sempre dia 1). Vale de outubro pago no acerto de outubro, ainda que o pagamento saia em novembro';
