-- ════════════════════════════════════════════════════════════════
-- DEBUG: Testa se a função portal_criar_conversa existe e funciona
-- ════════════════════════════════════════════════════════════════

-- 1. Verifica se a função existe
SELECT
  routine_name,
  routine_type,
  data_type
FROM information_schema.routines
WHERE routine_schema = 'public'
  AND routine_name LIKE 'portal%'
ORDER BY routine_name;

-- ══════════════════════════════════════════════════════════════════
-- Execute e me mostre o resultado
-- Se portal_criar_conversa NÃO aparecer na lista, a função não existe!
-- ══════════════════════════════════════════════════════════════════
