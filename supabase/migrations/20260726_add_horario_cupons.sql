-- Adicionar campos de horário nos cupons de desconto
-- Permite definir horário de início e fim da validade

-- Adicionar colunas de horário (opcionais)
ALTER TABLE cupons
ADD COLUMN IF NOT EXISTS hora_inicio TIME,
ADD COLUMN IF NOT EXISTS hora_fim TIME;

-- Comentários
COMMENT ON COLUMN cupons.hora_inicio IS
  'Horário de início da validade (opcional). Se NULL, válido desde 00:00 da data_inicio.';

COMMENT ON COLUMN cupons.hora_fim IS
  'Horário de fim da validade (opcional). Se NULL, válido até 23:59 da data_fim.';

-- Nota: Se hora_inicio e hora_fim forem NULL, o cupom é válido o dia todo
