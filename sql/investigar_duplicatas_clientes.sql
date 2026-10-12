-- ============================================================================
-- INVESTIGAR E CORRIGIR DUPLICATAS DE CLIENTES (IMPORTAÇÃO BLING)
-- ============================================================================

-- 1️⃣ ENCONTRAR DUPLICATAS POR WHATSAPP (mesmo número, instagrams diferentes)
SELECT
  whatsapp,
  COUNT(*) as total_duplicatas,
  STRING_AGG(instagram, ' | ' ORDER BY instagram) as instagrams,
  STRING_AGG(nome_completo, ' | ' ORDER BY instagram) as nomes
FROM clientes
WHERE tenant_id = 'ea-second-hand' -- AJUSTE AQUI SEU TENANT_ID
  AND whatsapp IS NOT NULL
  AND whatsapp != ''
GROUP BY whatsapp
HAVING COUNT(*) > 1
ORDER BY total_duplicatas DESC;


-- 2️⃣ ENCONTRAR CLIENTES COM INSTAGRAM INCOMPLETO (sem @)
SELECT
  instagram,
  nome_completo,
  whatsapp,
  cpf_cnpj,
  email
FROM clientes
WHERE tenant_id = 'ea-second-hand' -- AJUSTE AQUI SEU TENANT_ID
  AND instagram NOT LIKE '@%'
  AND instagram IS NOT NULL
ORDER BY instagram;


-- 3️⃣ COMPARAR DUPLICATAS LADO A LADO (para decidir qual manter)
WITH duplicatas AS (
  SELECT whatsapp
  FROM clientes
  WHERE tenant_id = 'ea-second-hand' -- AJUSTE AQUI SEU TENANT_ID
    AND whatsapp IS NOT NULL
    AND whatsapp != ''
  GROUP BY whatsapp
  HAVING COUNT(*) > 1
)
SELECT
  c.instagram,
  c.nome_completo,
  c.whatsapp,
  c.cpf_cnpj,
  c.email,
  c.data_cadastro,
  c.created_at,
  CASE
    WHEN c.instagram LIKE '@%' THEN '✅ TEM @'
    ELSE '❌ SEM @'
  END as tem_arroba,
  LENGTH(c.instagram) as tamanho_instagram
FROM clientes c
INNER JOIN duplicatas d ON c.whatsapp = d.whatsapp
WHERE c.tenant_id = 'ea-second-hand' -- AJUSTE AQUI SEU TENANT_ID
ORDER BY c.whatsapp, c.instagram;


-- 4️⃣ VERIFICAR DADOS IMPORTADOS DO BLING (com nome_completo preenchido)
SELECT
  instagram,
  nome_completo,
  cpf_cnpj,
  whatsapp,
  email,
  telefone,
  tipo_pessoa,
  created_at
FROM clientes
WHERE tenant_id = 'ea-second-hand' -- AJUSTE AQUI SEU TENANT_ID
  AND nome_completo IS NOT NULL
  AND nome_completo != ''
ORDER BY created_at DESC
LIMIT 50;


-- 5️⃣ VERIFICAR ENDEREÇOS IMPORTADOS DO BLING
SELECT
  ec.cliente_instagram,
  ec.apelido,
  ec.destinatario,
  ec.cep,
  ec.cidade,
  ec.estado,
  ec.padrao,
  ec.created_at,
  c.nome_completo
FROM enderecos_clientes ec
LEFT JOIN clientes c ON ec.cliente_instagram = c.instagram
  AND ec.tenant_id = c.tenant_id
WHERE ec.tenant_id = 'ea-second-hand' -- AJUSTE AQUI SEU TENANT_ID
ORDER BY ec.created_at DESC
LIMIT 50;


-- ============================================================================
-- APÓS REVISAR AS DUPLICATAS, USE OS SCRIPTS ABAIXO PARA CORRIGIR
-- ============================================================================

-- 6️⃣ MESCLAR DADOS: Atualizar registro CORRETO (com @) com dados do INCOMPLETO
-- Execute este UPDATE para cada duplicata encontrada:
/*
UPDATE clientes
SET
  nome_completo = COALESCE(NULLIF(nome_completo, ''),
    (SELECT nome_completo FROM clientes
     WHERE whatsapp = '67999717758' AND instagram NOT LIKE '@%'
     LIMIT 1)
  ),
  cpf_cnpj = COALESCE(NULLIF(cpf_cnpj, ''),
    (SELECT cpf_cnpj FROM clientes
     WHERE whatsapp = '67999717758' AND instagram NOT LIKE '@%'
     LIMIT 1)
  ),
  email = COALESCE(NULLIF(email, ''),
    (SELECT email FROM clientes
     WHERE whatsapp = '67999717758' AND instagram NOT LIKE '@%'
     LIMIT 1)
  )
WHERE whatsapp = '67999717758' -- NÚMERO DA DUPLICATA
  AND instagram LIKE '@%'       -- MANTER O QUE TEM @
  AND tenant_id = 'ea-second-hand';
*/


-- 7️⃣ EXCLUIR REGISTROS DUPLICADOS (SEM @) após mesclar dados
-- CUIDADO: Execute apenas depois de mesclar os dados!
/*
DELETE FROM clientes
WHERE tenant_id = 'ea-second-hand'
  AND instagram NOT LIKE '@%'
  AND whatsapp IN (
    SELECT whatsapp
    FROM clientes
    WHERE tenant_id = 'ea-second-hand'
      AND whatsapp IS NOT NULL
      AND whatsapp != ''
    GROUP BY whatsapp
    HAVING COUNT(*) > 1
  );
*/


-- 8️⃣ NORMALIZAR INSTAGRAMS: Garantir que todos comecem com @
/*
UPDATE clientes
SET instagram = '@' || instagram
WHERE tenant_id = 'ea-second-hand'
  AND instagram NOT LIKE '@%'
  AND instagram IS NOT NULL
  AND instagram != '';
*/
