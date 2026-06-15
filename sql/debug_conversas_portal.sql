-- ════════════════════════════════════════════════════════════════
-- DEBUG: Verifica por que conversas não aparecem no portal
-- ════════════════════════════════════════════════════════════════

-- 1. Mostra todas as conversas com o instagram do cliente
SELECT
  id,
  cliente_instagram,
  assunto,
  coluna,
  encerrado,
  created_at
FROM conversas
WHERE tenant_id = 'c88f07dd-c87a-4e1b-82ff-48c5e9dc3ca0'
ORDER BY created_at DESC;

-- 2. Mostra o cliente cadastrado (para comparar instagram)
SELECT
  instagram,
  nome_completo
FROM clientes
WHERE tenant_id = 'c88f07dd-c87a-4e1b-82ff-48c5e9dc3ca0';

-- 3. Testa se a RPC funciona (substitua USER_ID_DO_CLIENTE pelo user_id do passo 2)
-- Você vai precisar executar separadamente com auth.uid() do cliente
-- SELECT * FROM portal_get_minhas_conversas();

-- ══════════════════════════════════════════════════════════════════
-- IMPORTANTE: Compare os resultados
-- - Conversas: qual é o valor exato de cliente_instagram?
-- - Clientes: qual é o valor exato de instagram?
-- - Eles devem ser IDÊNTICOS (mesmas letras, mesmo @)
-- ══════════════════════════════════════════════════════════════════
