-- ================================================================
-- JORNADA DE TRABALHO POR FUNCIONARIO
--
-- Ate aqui o espelho de ponto so sabia quantas horas o funcionario
-- deve por dia (carga_horaria_diaria). Sem os horarios, nao da para
-- apontar atraso nem saida antecipada. Agora cada funcionario tem a
-- sua jornada, e as horas por dia saem dela.
--
-- O UPDATE preenche o horario da loja (08:00 as 17:00, almoco das
-- 12:00 as 13:00) em quem ainda esta sem jornada. Quem tiver horario
-- diferente e so ajustar no cadastro.
--
-- Rodar inteiro no SQL Editor do Supabase.
-- ================================================================

ALTER TABLE funcionarios
  ADD COLUMN IF NOT EXISTS hora_entrada       TIME,
  ADD COLUMN IF NOT EXISTS hora_saida_almoco  TIME,
  ADD COLUMN IF NOT EXISTS hora_volta_almoco  TIME,
  ADD COLUMN IF NOT EXISTS hora_saida         TIME,
  ADD COLUMN IF NOT EXISTS tolerancia_minutos INT DEFAULT 10;

COMMENT ON COLUMN funcionarios.hora_entrada       IS 'Inicio da jornada contratual; base para apontar atraso';
COMMENT ON COLUMN funcionarios.hora_saida_almoco  IS 'Saida para o almoco na jornada contratual';
COMMENT ON COLUMN funcionarios.hora_volta_almoco  IS 'Volta do almoco na jornada contratual';
COMMENT ON COLUMN funcionarios.hora_saida         IS 'Fim da jornada contratual';
COMMENT ON COLUMN funcionarios.tolerancia_minutos IS 'Minutos de tolerancia antes de apontar atraso no espelho';

UPDATE funcionarios
   SET hora_entrada      = COALESCE(hora_entrada,      TIME '08:00'),
       hora_saida_almoco = COALESCE(hora_saida_almoco, TIME '12:00'),
       hora_volta_almoco = COALESCE(hora_volta_almoco, TIME '13:00'),
       hora_saida        = COALESCE(hora_saida,        TIME '17:00')
 WHERE hora_entrada IS NULL
    OR hora_saida   IS NULL;

UPDATE funcionarios SET tolerancia_minutos = 10 WHERE tolerancia_minutos IS NULL;
