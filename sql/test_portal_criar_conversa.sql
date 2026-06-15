-- ════════════════════════════════════════════════════════════════
-- TESTE: Executa portal_criar_conversa e mostra o erro exato
-- ════════════════════════════════════════════════════════════════

-- IMPORTANTE: Você precisa executar este comando estando LOGADO como o cliente
-- no portal (porque usa auth.uid())

-- Se você executar pelo painel admin do Supabase, vai dar erro porque
-- auth.uid() vai retornar NULL

-- Para debugar, vamos ver se o cliente está cadastrado:
SELECT
  instagram,
  tenant_id,
  user_id
FROM clientes
WHERE tenant_id = 'c88f07dd-c87a-4e1b-82ff-48c5e9dc3ca0'
ORDER BY instagram;

-- ══════════════════════════════════════════════════════════════════
-- RESULTADO: Me mostre a lista de clientes
-- Verifique se o cliente "deia_jeremias" (novo usuário) está na lista
-- Se NÃO estiver, esse é o problema!
-- ══════════════════════════════════════════════════════════════════
