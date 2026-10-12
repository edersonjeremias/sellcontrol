-- Verificação e correção do sistema de rastreamento de cupons
-- Data: 2026-10-12
-- Objetivo: Garantir que cupom_id existe e cupons são incrementados corretamente

-- 1. Verificar se coluna cupom_id existe (deve já existir pela migration anterior)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_name = 'cobrancas'
    AND column_name = 'cupom_id'
  ) THEN
    ALTER TABLE cobrancas
    ADD COLUMN cupom_id UUID REFERENCES cupons(id);

    RAISE NOTICE '✅ Coluna cupom_id adicionada à tabela cobrancas';
  ELSE
    RAISE NOTICE '✓ Coluna cupom_id já existe na tabela cobrancas';
  END IF;
END $$;

-- 2. Criar índice se não existir
CREATE INDEX IF NOT EXISTS idx_cobrancas_cupom_id
  ON cobrancas(cupom_id)
  WHERE cupom_id IS NOT NULL;

-- 3. Verificar constraint
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.table_constraints
    WHERE table_name = 'cobrancas'
    AND constraint_name = 'cobrancas_cupom_id_fkey'
  ) THEN
    ALTER TABLE cobrancas
    ADD CONSTRAINT cobrancas_cupom_id_fkey
      FOREIGN KEY (cupom_id)
      REFERENCES cupons(id)
      ON DELETE SET NULL;

    RAISE NOTICE '✅ Foreign key cupom_id criada';
  ELSE
    RAISE NOTICE '✓ Foreign key cupom_id já existe';
  END IF;
END $$;

-- 4. Verificar se há cobranças PAGAS com cupom aplicado mas sem cupom_id
-- Isso pode acontecer se as cobranças foram pagas antes da migration
SELECT
  COUNT(*) as cobr_pagas_com_cupom_sem_id,
  COUNT(DISTINCT cupom_codigo) as cupons_distintos
FROM cobrancas
WHERE (status = 'PAGO' OR status = 'BAIXADO')
  AND cupom_codigo IS NOT NULL
  AND cupom_id IS NULL;

-- 5. Mostrar alguns exemplos de cobranças sem cupom_id que deveriam ter
SELECT
  id,
  cliente,
  cupom_codigo,
  cupom_desconto_percentual,
  status,
  data_pagamento
FROM cobrancas
WHERE (status = 'PAGO' OR status = 'BAIXADO')
  AND cupom_codigo IS NOT NULL
  AND cupom_id IS NULL
ORDER BY data_pagamento DESC
LIMIT 10;

COMMENT ON COLUMN cobrancas.cupom_id IS
  'ID do cupom usado - necessário para incrementar contador apenas após pagamento confirmado';
