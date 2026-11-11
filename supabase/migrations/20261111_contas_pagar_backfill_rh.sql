-- ================================================================
-- TRAZER PARA O CONTAS A PAGAR O QUE JA EXISTIA NO RH
--
-- A sincronia vale a partir do momento em que o lancamento e salvo.
-- Os vales, salarios e periodos de vale transporte lancados antes
-- disso nunca passaram por ela: este script importa todos de uma vez.
--
-- Pode rodar quantas vezes quiser. O NOT EXISTS impede duplicata, e
-- nenhuma conta ja existente e alterada: o que voce editou no Contas
-- a Pagar continua como esta.
--
-- A ordem importa. O periodo de VT entra primeiro porque o lancamento
-- gerado a partir dele divide a mesma chave; assim a conta fica uma so.
--
-- Rodar inteiro no SQL Editor do Supabase.
-- ================================================================

-- ── 1. Periodos de vale transporte ─────────────────────────────
INSERT INTO contas_pagar (
  tenant_id, origem, origem_id, observacao, categoria, tipo_despesa,
  valor, data_vencimento, status, data_pagamento
)
SELECT
  p.tenant_id, 'RH_VT', p.id,
  'Vale transporte — ' || COALESCE(f.apelido, f.nome) || ' — ' ||
    to_char(p.data_inicio, 'DD/MM/YYYY') || ' a ' || to_char(p.data_fim, 'DD/MM/YYYY'),
  'Funcionario', 'Fixa',
  p.total_liquido, COALESCE(p.data_vencimento, p.data_fim),
  CASE WHEN p.status = 'PAGO' THEN 'PAGO' ELSE 'A PAGAR' END,
  CASE WHEN p.status = 'PAGO' THEN COALESCE(p.data_pagamento, p.data_fim) END
FROM rh_vt_periodos p
JOIN funcionarios f ON f.id = p.funcionario_id
WHERE COALESCE(p.total_liquido, 0) > 0
  AND NOT EXISTS (
    SELECT 1 FROM contas_pagar c
     WHERE c.tenant_id = p.tenant_id AND c.origem = 'RH_VT' AND c.origem_id = p.id
  );

-- ── 2. Lancamentos de vales e pagamentos ───────────────────────
-- Desconto e compra na loja ficam de fora: sao abatimentos do que a
-- funcionaria tem a receber, nao despesa a pagar.
INSERT INTO contas_pagar (
  tenant_id, origem, origem_id, observacao, categoria, tipo_despesa,
  valor, data_vencimento, status, data_pagamento
)
SELECT
  l.tenant_id,
  CASE WHEN l.vt_periodo_id IS NOT NULL THEN 'RH_VT' ELSE 'RH_LANC' END,
  COALESCE(l.vt_periodo_id, l.id),
  CASE l.tipo
    WHEN 'VALE'            THEN 'Vale'
    WHEN 'ADIANTAMENTO'    THEN 'Adiantamento'
    WHEN 'SALARIO'         THEN 'Salário'
    WHEN 'COMISSAO'        THEN 'Comissão'
    WHEN 'BONUS'           THEN 'Bônus'
    WHEN 'REEMBOLSO'       THEN 'Reembolso'
    WHEN 'VALE_TRANSPORTE' THEN 'Vale transporte'
    ELSE l.tipo
  END
  || ' — ' || COALESCE(f.apelido, f.nome)
  || COALESCE(' — ' || NULLIF(l.descricao, ''), ''),
  'Funcionario', 'Fixa',
  l.valor, l.data_prevista,
  CASE WHEN l.status = 'PAGO' THEN 'PAGO' ELSE 'A PAGAR' END,
  CASE WHEN l.status = 'PAGO' THEN COALESCE(l.data_pagamento, l.data_prevista) END
FROM rh_lancamentos l
JOIN funcionarios f ON f.id = l.funcionario_id
WHERE l.tipo IN ('VALE','ADIANTAMENTO','SALARIO','COMISSAO','BONUS','REEMBOLSO','VALE_TRANSPORTE')
  AND COALESCE(l.valor, 0) > 0
  AND NOT EXISTS (
    SELECT 1 FROM contas_pagar c
     WHERE c.tenant_id = l.tenant_id
       AND c.origem    = CASE WHEN l.vt_periodo_id IS NOT NULL THEN 'RH_VT' ELSE 'RH_LANC' END
       AND c.origem_id = COALESCE(l.vt_periodo_id, l.id)
  );

-- ── 3. Conferencia ─────────────────────────────────────────────
SELECT origem,
       COUNT(*)                                        AS contas,
       SUM(valor) FILTER (WHERE status <> 'PAGO')      AS a_pagar,
       SUM(valor) FILTER (WHERE status =  'PAGO')      AS ja_pago
  FROM contas_pagar
 WHERE origem IN ('RH_VT', 'RH_LANC')
 GROUP BY origem
 ORDER BY origem;
