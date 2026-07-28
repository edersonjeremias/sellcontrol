-- Adiciona limite de usos aos cupons
-- Permite controlar quantas vezes um cupom pode ser usado

-- Adicionar coluna limite_usos (NULL = ilimitado)
ALTER TABLE cupons
ADD COLUMN IF NOT EXISTS limite_usos INTEGER;

-- Adicionar coluna usos_realizados (contador)
ALTER TABLE cupons
ADD COLUMN IF NOT EXISTS usos_realizados INTEGER DEFAULT 0;

-- Comentários explicativos
COMMENT ON COLUMN cupons.limite_usos IS
  'Número máximo de vezes que o cupom pode ser usado. NULL = ilimitado';

COMMENT ON COLUMN cupons.usos_realizados IS
  'Contador de quantas vezes o cupom já foi usado';

-- Índice para otimizar buscas por cupons ativos com limite
CREATE INDEX IF NOT EXISTS idx_cupons_limite_usos
  ON cupons(tenant_id, ativo)
  WHERE limite_usos IS NOT NULL;
