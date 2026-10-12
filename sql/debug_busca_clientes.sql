-- ============================================================================
-- DEBUG: POR QUE OS DADOS NÃO APARECEM NA BUSCA AVANÇADA?
-- ============================================================================

-- 1️⃣ VERIFICAR QUAL É O SEU TENANT_ID CORRETO
SELECT
  tenant_id,
  nome_loja,
  slug
FROM configuracoes
ORDER BY created_at DESC;

-- Copie o tenant_id correto e substitua 'ea-second-hand' nos scripts abaixo


-- 2️⃣ CONTAR CLIENTES POR TENANT (para ver se foram importados no tenant correto)
SELECT
  tenant_id,
  COUNT(*) as total_clientes,
  COUNT(CASE WHEN nome_completo IS NOT NULL AND nome_completo != '' THEN 1 END) as com_nome_completo,
  COUNT(CASE WHEN cpf_cnpj IS NOT NULL AND cpf_cnpj != '' THEN 1 END) as com_cpf_cnpj,
  COUNT(CASE WHEN email IS NOT NULL AND email != '' THEN 1 END) as com_email
FROM clientes
GROUP BY tenant_id
ORDER BY total_clientes DESC;


-- 3️⃣ VERIFICAR SE COLUNAS EXISTEM NA TABELA CLIENTES
SELECT
  column_name,
  data_type,
  is_nullable
FROM information_schema.columns
WHERE table_name = 'clientes'
  AND column_name IN ('nome_completo', 'cpf_cnpj', 'email', 'telefone', 'tipo_pessoa', 'cpf', 'cep', 'cidade', 'uf')
ORDER BY column_name;


-- 4️⃣ TESTAR BUSCA SIMPLES (igual ao sistema faz)
SELECT
  instagram,
  nome_completo,
  cpf_cnpj,
  whatsapp,
  email
FROM clientes
WHERE tenant_id = 'ea-second-hand' -- AJUSTE AQUI
  AND nome_completo ILIKE '%leila%' -- TESTE COM UM NOME DA IMPORTAÇÃO
LIMIT 10;


-- 5️⃣ TESTAR BUSCA COM JOIN (endereços)
SELECT
  c.instagram,
  c.nome_completo,
  c.cpf_cnpj,
  c.whatsapp,
  c.email,
  e.cep,
  e.cidade,
  e.estado
FROM clientes c
LEFT JOIN enderecos_clientes e
  ON c.instagram = e.cliente_instagram
  AND c.tenant_id = e.tenant_id
  AND e.padrao = true
WHERE c.tenant_id = 'ea-second-hand' -- AJUSTE AQUI
  AND c.nome_completo IS NOT NULL
LIMIT 20;


-- 6️⃣ VERIFICAR RLS (Row Level Security) - pode estar bloqueando
SELECT
  schemaname,
  tablename,
  policyname,
  permissive,
  roles,
  cmd,
  qual,
  with_check
FROM pg_policies
WHERE tablename IN ('clientes', 'enderecos_clientes')
ORDER BY tablename, policyname;


-- 7️⃣ VERIFICAR SE HÁ ENDEREÇOS SEM CLIENTE (FK quebrada)
SELECT
  e.cliente_instagram,
  e.destinatario,
  e.cidade,
  e.estado,
  c.instagram as cliente_existe
FROM enderecos_clientes e
LEFT JOIN clientes c
  ON e.cliente_instagram = c.instagram
  AND e.tenant_id = c.tenant_id
WHERE e.tenant_id = 'ea-second-hand' -- AJUSTE AQUI
  AND c.instagram IS NULL -- Endereços sem cliente correspondente
LIMIT 20;


-- 8️⃣ AMOSTRA DE DADOS IMPORTADOS (para ver o formato)
SELECT
  instagram,
  nome_completo,
  cpf_cnpj,
  tipo_pessoa,
  whatsapp,
  telefone,
  email,
  created_at,
  CASE
    WHEN instagram LIKE '@%' THEN '✅'
    ELSE '❌'
  END as tem_arroba
FROM clientes
WHERE tenant_id = 'ea-second-hand' -- AJUSTE AQUI
  AND created_at > NOW() - INTERVAL '7 days' -- Últimos 7 dias
ORDER BY created_at DESC
LIMIT 30;
