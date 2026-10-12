-- Script para corrigir cupons que não foram incrementados em cobranças antigas
-- ATENÇÃO: Execute este script MANUALMENTE apenas UMA VEZ após verificar os dados
-- Data: 2026-10-12

-- PASSO 1: Verificar cobranças PAGAS com cupom mas sem cupom_id
-- (Execute primeiro para ver o que será corrigido)
SELECT
  c.id as cobranca_id,
  c.cliente,
  c.cupom_codigo,
  c.status,
  c.data_pagamento,
  cup.id as cupom_id,
  cup.usos_realizados as usos_atuais
FROM cobrancas c
LEFT JOIN cupons cup ON cup.codigo = c.cupom_codigo AND cup.tenant_id = c.tenant_id
WHERE (c.status = 'PAGO' OR c.status = 'BAIXADO')
  AND c.cupom_codigo IS NOT NULL
  AND c.cupom_id IS NULL
ORDER BY c.data_pagamento DESC;

-- PASSO 2: Popular cupom_id nas cobranças que já foram pagas
-- (Isso vai associar o cupom_id mesmo nas cobranças antigas)
WITH cobr_sem_id AS (
  SELECT
    c.id as cobranca_id,
    c.cupom_codigo,
    c.tenant_id,
    cup.id as cupom_id
  FROM cobrancas c
  INNER JOIN cupons cup
    ON cup.codigo = c.cupom_codigo
    AND cup.tenant_id = c.tenant_id
  WHERE (c.status = 'PAGO' OR c.status = 'BAIXADO')
    AND c.cupom_codigo IS NOT NULL
    AND c.cupom_id IS NULL
)
UPDATE cobrancas
SET cupom_id = cobr_sem_id.cupom_id
FROM cobr_sem_id
WHERE cobrancas.id = cobr_sem_id.cobranca_id;

-- PASSO 3: Recalcular usos_realizados de cada cupom baseado nas cobranças PAGAS
-- (Isso vai corrigir o contador de usos)
WITH uso_por_cupom AS (
  SELECT
    cupom_id,
    COUNT(*) as total_usos
  FROM cobrancas
  WHERE (status = 'PAGO' OR status = 'BAIXADO')
    AND cupom_id IS NOT NULL
  GROUP BY cupom_id
)
UPDATE cupons
SET usos_realizados = uso_por_cupom.total_usos
FROM uso_por_cupom
WHERE cupons.id = uso_por_cupom.cupom_id;

-- PASSO 4: Verificar resultado - mostrar cupons com seus usos corrigidos
SELECT
  c.codigo,
  c.percentual,
  c.limite_usos,
  c.usos_realizados,
  CASE
    WHEN c.limite_usos IS NOT NULL THEN
      ROUND((c.usos_realizados::numeric / c.limite_usos::numeric * 100), 2) || '%'
    ELSE
      'Ilimitado'
  END as percentual_usado,
  COUNT(cob.id) as cobr_pagas_com_cupom
FROM cupons c
LEFT JOIN cobrancas cob
  ON cob.cupom_id = c.id
  AND (cob.status = 'PAGO' OR cob.status = 'BAIXADO')
GROUP BY c.id, c.codigo, c.percentual, c.limite_usos, c.usos_realizados
ORDER BY c.created_at DESC;
