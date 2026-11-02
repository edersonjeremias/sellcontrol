-- ════════════════════════════════════════════════════════════════════
-- SIMPLIFICA AS FUNÇÕES: master, admin e usuario
-- ════════════════════════════════════════════════════════════════════
--
-- 'gerente', 'vendedor' e 'financeiro' eram decorativos: em
-- getPagesForUser (src/services/authService.js) o sistema só distingue
-- 'master' (vê todas as páginas) de todo o resto (vê apenas o que está
-- em pages_access). Os três davam exatamente o mesmo acesso, e a
-- legenda da tela prometia páginas que a função não liberava.
--
-- Quem controla o que cada pessoa vê é o botão "Páginas" de cada
-- usuário. A função agora serve só para dizer quem administra:
--   master  → você: todas as páginas e todas as empresas
--   admin   → abre Configurações, Cupons e RH
--   usuario → somente as páginas liberadas em pages_access
--
-- ════════════════════════════════════════════════════════════════════

-- 1) Normaliza as funções antigas (o DEFAULT da coluna já é 'usuario')
UPDATE users_perfil
SET role = 'usuario'
WHERE role IN ('gerente', 'vendedor', 'financeiro', 'colaborador', 'user')
RETURNING nome, username, email, role;

-- 2) Impede que valores novos voltem a aparecer
ALTER TABLE users_perfil DROP CONSTRAINT IF EXISTS users_perfil_role_check;
ALTER TABLE users_perfil ADD CONSTRAINT users_perfil_role_check
  CHECK (role IN ('master', 'admin', 'usuario'));

-- 3) Conferência
SELECT role, count(*) AS quantidade
FROM users_perfil
GROUP BY role
ORDER BY role;
