-- ═══════════════════════════════════════════════════════════════════
-- REMOVE CLIENTES QUE FORAM CADASTRADOS INCORRETAMENTE COMO USUÁRIOS
-- ═══════════════════════════════════════════════════════════════════
--
-- PROBLEMA: Clientes (Bárbara Lima, Deborah Ferretti, Lilian Azevedo,
-- Nilza Machado Hermel, Pamella, etc.) estão cadastrados na tabela
-- users_perfil com role='master', quando na verdade são clientes.
--
-- SOLUÇÃO: Remove usuários que:
-- 1. Têm role='master' OU role IS NULL
-- 2. NÃO são o usuário real do sistema (edersonluiz@gmail.com)
-- 3. Têm email de domínios públicos (@gmail, @hotmail, etc.)
-- 4. OU não têm username definido (foram criados como clientes)
--
-- ═══════════════════════════════════════════════════════════════════

-- IMPORTANTE: Antes de executar, faça backup dos dados!
-- Execute esta query PRIMEIRO para ver quem será removido:

SELECT
  id,
  nome,
  email,
  username,
  role,
  created_at
FROM users_perfil
WHERE
  -- Não é o usuário master real
  email != 'edersonluiz@gmail.com'
  AND email NOT LIKE '%@vmkids.local'
  AND (
    -- Tem email de domínio público (provável cliente)
    email LIKE '%@gmail.com'
    OR email LIKE '%@hotmail.com'
    OR email LIKE '%@outlook.com'
    OR email LIKE '%@yahoo.com'
    OR email LIKE '%@bol.com.br'
    OR email LIKE '%@uol.com.br'
    -- OU não tem username (não é usuário do sistema)
    OR username IS NULL
    OR username = ''
  )
  -- E tem role master ou null (clientes não deveriam ter role)
  AND (role = 'master' OR role IS NULL)
ORDER BY created_at DESC;

-- ═══════════════════════════════════════════════════════════════════
-- SE A LISTA ACIMA ESTIVER CORRETA, EXECUTE O DELETE:
-- ═══════════════════════════════════════════════════════════════════

/*
DELETE FROM users_perfil
WHERE
  email != 'edersonluiz@gmail.com'
  AND email NOT LIKE '%@vmkids.local'
  AND (
    email LIKE '%@gmail.com'
    OR email LIKE '%@hotmail.com'
    OR email LIKE '%@outlook.com'
    OR email LIKE '%@yahoo.com'
    OR email LIKE '%@bol.com.br'
    OR email LIKE '%@uol.com.br'
    OR username IS NULL
    OR username = ''
  )
  AND (role = 'master' OR role IS NULL);
*/

-- ═══════════════════════════════════════════════════════════════════
-- ALTERNATIVA: DELETE ESPECÍFICO POR NOME (MAIS SEGURO)
-- ═══════════════════════════════════════════════════════════════════
-- Se preferir, remova apenas os clientes específicos que você viu:

/*
DELETE FROM users_perfil
WHERE nome IN (
  'Bárbara Lima',
  'Deborah Ferretti oficial',
  'Lilian Azevedo',
  'Nilza Machado Hermel',
  'Pamella'
)
AND email != 'edersonluiz@gmail.com';
*/
