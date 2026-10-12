-- ============================================================================
-- SCRIPT COMPLETO: LIMPAR DUPLICATAS - EA SECOND HAND
-- ============================================================================
-- TENANT: EA SECOND HA
-- ID: 7135c82e-6155-41e5-9c42-638a94222bbe
-- ============================================================================

-- ============================================================================
-- ETAPA 1: INVESTIGAÇÃO
-- ============================================================================

-- 1️⃣ CONTAR CLIENTES TOTAIS
SELECT
  COUNT(*) as total_clientes,
  COUNT(CASE WHEN nome_completo IS NOT NULL AND nome_completo != '' THEN 1 END) as com_nome_completo,
  COUNT(CASE WHEN cpf_cnpj IS NOT NULL AND cpf_cnpj != '' THEN 1 END) as com_cpf,
  COUNT(CASE WHEN instagram NOT LIKE '@%' THEN 1 END) as sem_arroba
FROM clientes
WHERE tenant_id = '7135c82e-6155-41e5-9c42-638a94222bbe';

-- Resultado esperado mostrará quantos clientes você tem e quantos estão sem @


-- 2️⃣ VER DUPLICATAS POR WHATSAPP
SELECT
  whatsapp,
  COUNT(*) as total_duplicatas,
  STRING_AGG(instagram, ' | ' ORDER BY instagram) as todos_instagrams,
  STRING_AGG(nome_completo, ' | ' ORDER BY instagram) as todos_nomes
FROM clientes
WHERE tenant_id = '7135c82e-6155-41e5-9c42-638a94222bbe'
  AND whatsapp IS NOT NULL
  AND whatsapp != ''
GROUP BY whatsapp
HAVING COUNT(*) > 1
ORDER BY total_duplicatas DESC;

-- Isso mostrará todos os whatsapps duplicados


-- 3️⃣ VER DUPLICATAS LADO A LADO (DETALHADO)
WITH duplicatas AS (
  SELECT whatsapp
  FROM clientes
  WHERE tenant_id = '7135c82e-6155-41e5-9c42-638a94222bbe'
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
  c.created_at,
  CASE
    WHEN c.instagram LIKE '@%' THEN '✅ MANTER ESTE'
    ELSE '❌ EXCLUIR ESTE'
  END as acao_recomendada,
  LENGTH(c.instagram) as tamanho_instagram
FROM clientes c
INNER JOIN duplicatas d ON c.whatsapp = d.whatsapp
WHERE c.tenant_id = '7135c82e-6155-41e5-9c42-638a94222bbe'
ORDER BY c.whatsapp, c.instagram DESC;

-- Mostra cada par de duplicatas lado a lado


-- ============================================================================
-- ETAPA 2: BACKUP DE SEGURANÇA (RECOMENDADO!)
-- ============================================================================

-- 4️⃣ CRIAR TABELA DE BACKUP (RODE ANTES DE EXCLUIR!)
CREATE TABLE IF NOT EXISTS clientes_backup_duplicatas_20261012 AS
SELECT *
FROM clientes
WHERE tenant_id = '7135c82e-6155-41e5-9c42-638a94222bbe'
  AND instagram NOT LIKE '@%'
  AND whatsapp IN (
    SELECT whatsapp
    FROM clientes
    WHERE tenant_id = '7135c82e-6155-41e5-9c42-638a94222bbe'
      AND whatsapp IS NOT NULL
    GROUP BY whatsapp
    HAVING COUNT(*) > 1
  );

-- Verificar backup
SELECT COUNT(*) as total_no_backup
FROM clientes_backup_duplicatas_20261012;

-- Esse backup permite restaurar se algo der errado


-- ============================================================================
-- ETAPA 3: MESCLAR DADOS (Copiar do SEM @ para o COM @)
-- ============================================================================

-- 5️⃣ MESCLAR DADOS AUTOMATICAMENTE
-- Este UPDATE copia os dados dos registros SEM @ para os COM @
-- APENAS se o campo estiver vazio no registro COM @

UPDATE clientes AS destino
SET
  nome_completo = COALESCE(
    NULLIF(destino.nome_completo, ''),
    origem.nome_completo
  ),
  cpf_cnpj = COALESCE(
    NULLIF(destino.cpf_cnpj, ''),
    origem.cpf_cnpj
  ),
  email = COALESCE(
    NULLIF(destino.email, ''),
    origem.email
  ),
  telefone = COALESCE(
    NULLIF(destino.telefone, ''),
    origem.telefone
  ),
  tipo_pessoa = COALESCE(
    NULLIF(destino.tipo_pessoa, ''),
    origem.tipo_pessoa
  )
FROM (
  SELECT
    c1.whatsapp,
    c2.nome_completo,
    c2.cpf_cnpj,
    c2.email,
    c2.telefone,
    c2.tipo_pessoa
  FROM clientes c1
  INNER JOIN clientes c2
    ON c1.whatsapp = c2.whatsapp
    AND c1.tenant_id = c2.tenant_id
  WHERE c1.tenant_id = '7135c82e-6155-41e5-9c42-638a94222bbe'
    AND c1.instagram LIKE '@%'      -- Registro destino (COM @)
    AND c2.instagram NOT LIKE '@%'  -- Registro origem (SEM @)
    AND c1.whatsapp IS NOT NULL
) AS origem
WHERE destino.tenant_id = '7135c82e-6155-41e5-9c42-638a94222bbe'
  AND destino.whatsapp = origem.whatsapp
  AND destino.instagram LIKE '@%';

-- Quantos registros foram mesclados?
-- Resultado mostrará o número de atualizações


-- ============================================================================
-- ETAPA 4: EXCLUIR DUPLICATAS (SEM @)
-- ============================================================================

-- ⚠️ ATENÇÃO: Execute apenas depois de verificar que a mesclagem funcionou!

-- 6️⃣ PRIMEIRO - CONTAR QUANTOS SERÃO EXCLUÍDOS
SELECT COUNT(*) as total_que_sera_excluido
FROM clientes
WHERE tenant_id = '7135c82e-6155-41e5-9c42-638a94222bbe'
  AND instagram NOT LIKE '@%'
  AND whatsapp IN (
    SELECT whatsapp
    FROM clientes
    WHERE tenant_id = '7135c82e-6155-41e5-9c42-638a94222bbe'
      AND whatsapp IS NOT NULL
      AND whatsapp != ''
    GROUP BY whatsapp
    HAVING COUNT(*) > 1
  );


-- 7️⃣ EXCLUIR DUPLICATAS (SEM @)
-- ⚠️ RODE APENAS DEPOIS DE CONFIRMAR A CONTAGEM ACIMA!

DELETE FROM clientes
WHERE tenant_id = '7135c82e-6155-41e5-9c42-638a94222bbe'
  AND instagram NOT LIKE '@%'
  AND whatsapp IN (
    SELECT whatsapp
    FROM clientes
    WHERE tenant_id = '7135c82e-6155-41e5-9c42-638a94222bbe'
      AND whatsapp IS NOT NULL
      AND whatsapp != ''
    GROUP BY whatsapp
    HAVING COUNT(*) > 1
  );

-- Quantos foram excluídos?


-- ============================================================================
-- ETAPA 5: VERIFICAÇÃO FINAL
-- ============================================================================

-- 8️⃣ VERIFICAR SE AINDA HÁ DUPLICATAS
SELECT
  whatsapp,
  COUNT(*) as total
FROM clientes
WHERE tenant_id = '7135c82e-6155-41e5-9c42-638a94222bbe'
  AND whatsapp IS NOT NULL
GROUP BY whatsapp
HAVING COUNT(*) > 1;

-- ✅ Se retornar VAZIO = Sucesso! Todas as duplicatas foram removidas


-- 9️⃣ VERIFICAR CLIENTES SEM @ (que sobraram)
SELECT
  instagram,
  nome_completo,
  whatsapp
FROM clientes
WHERE tenant_id = '7135c82e-6155-41e5-9c42-638a94222bbe'
  AND instagram NOT LIKE '@%'
  AND instagram IS NOT NULL
LIMIT 20;

-- Se houver clientes SEM @ que NÃO são duplicatas,
-- eles precisam ser normalizados (adicionar @)


-- 🔟 NORMALIZAR INSTAGRAMS (Adicionar @ nos que faltam)
UPDATE clientes
SET instagram = '@' || instagram
WHERE tenant_id = '7135c82e-6155-41e5-9c42-638a94222bbe'
  AND instagram NOT LIKE '@%'
  AND instagram IS NOT NULL
  AND instagram != '';

-- Quantos foram normalizados?


-- ============================================================================
-- ETAPA 6: ESTATÍSTICAS FINAIS
-- ============================================================================

-- 1️⃣1️⃣ RESUMO FINAL
SELECT
  COUNT(*) as total_clientes,
  COUNT(CASE WHEN instagram LIKE '@%' THEN 1 END) as com_arroba,
  COUNT(CASE WHEN instagram NOT LIKE '@%' THEN 1 END) as sem_arroba,
  COUNT(CASE WHEN nome_completo IS NOT NULL AND nome_completo != '' THEN 1 END) as com_nome_completo,
  COUNT(CASE WHEN cpf_cnpj IS NOT NULL AND cpf_cnpj != '' THEN 1 END) as com_cpf
FROM clientes
WHERE tenant_id = '7135c82e-6155-41e5-9c42-638a94222bbe';


-- ============================================================================
-- BÔNUS: SE ALGO DEU ERRADO, RESTAURAR DO BACKUP
-- ============================================================================

-- RESTAURAR DO BACKUP (apenas se precisar)
/*
INSERT INTO clientes
SELECT * FROM clientes_backup_duplicatas_20261012;
*/

-- Depois de confirmar que tudo está OK, pode excluir o backup:
/*
DROP TABLE clientes_backup_duplicatas_20261012;
*/
