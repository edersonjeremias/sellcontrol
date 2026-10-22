-- ════════════════════════════════════════════════════════════════════
-- CORRIGE: CLIENTES VIRANDO "MASTER" SOZINHOS
-- ════════════════════════════════════════════════════════════════════
--
-- CAUSA: o login "Entrar com Google" criava perfil automaticamente em
-- users_perfil com role = 'master' para qualquer pessoa que não tivesse
-- perfil (src/services/authService.js → createGoogleUserProfile).
-- Qualquer cliente com conta Google que abrisse sellcontrol.app/login
-- virava master do sistema — e master enxerga TODAS as empresas no RLS.
--
-- O código já foi corrigido. Este script:
--   1. mostra os masters indevidos
--   2. remove o acesso deles ao sistema
--   3. tranca a criação de perfil no próprio banco
--
-- IMPORTANTE: só apagamos a linha em users_perfil (acesso ao sistema).
-- A conta em auth.users continua intacta, então quem é cliente do
-- portal NÃO perde o acesso ao portal.
--
-- ════════════════════════════════════════════════════════════════════


-- ════════════════════════════════════════════════════════════════════
-- PASSO 1 — CONFIRA QUEM SERÁ REMOVIDO (só leitura, rode primeiro)
-- ════════════════════════════════════════════════════════════════════
-- Confira que a SUA linha (Ederson Jeremias) NÃO aparece no resultado.

SELECT
  nome,
  email,
  username,
  role,
  created_at
FROM users_perfil
WHERE role = 'master'
  AND coalesce(email, '') <> ''
  AND lower(coalesce(email, '')) NOT IN (
        'edersonluiz@gmail.com',
        'edersonjeremias@gmail.com'
      )
ORDER BY created_at DESC;


-- ════════════════════════════════════════════════════════════════════
-- PASSO 2 — REMOVE OS MASTERS INDEVIDOS + TRANCA O BANCO
-- ════════════════════════════════════════════════════════════════════
-- Rode este bloco inteiro depois de conferir o passo 1.

BEGIN;

-- 2.1 Remove o acesso ao sistema dos perfis criados automaticamente.
--     (mantém o seu master, que não tem e-mail preenchido na users_perfil)
DELETE FROM users_perfil
WHERE role = 'master'
  AND coalesce(email, '') <> ''
  AND lower(coalesce(email, '')) NOT IN (
        'edersonluiz@gmail.com',
        'edersonjeremias@gmail.com'
      )
RETURNING nome, email, role;


-- 2.2 Tira a permissão de o próprio usuário inserir a linha dele em
--     users_perfil. A policy antiga "rls_perfil" era FOR ALL e, sem
--     WITH CHECK, o Postgres usava o USING (id = auth.uid()) também no
--     INSERT — ou seja, qualquer pessoa logada podia criar o próprio
--     perfil com role 'master'. Agora só SELECT / UPDATE / DELETE.
--     Criação de usuário passa a ser exclusivamente pela API
--     (api/criar-usuario.js, que usa service role e ignora RLS).

DROP POLICY IF EXISTS "ins_perfil" ON users_perfil;
DROP POLICY IF EXISTS "rls_perfil" ON users_perfil;
DROP POLICY IF EXISTS "sel_perfil" ON users_perfil;
DROP POLICY IF EXISTS "upd_perfil" ON users_perfil;
DROP POLICY IF EXISTS "del_perfil" ON users_perfil;

CREATE POLICY "sel_perfil" ON users_perfil
  FOR SELECT
  USING (id = auth.uid() OR get_user_role() = 'master');

CREATE POLICY "upd_perfil" ON users_perfil
  FOR UPDATE
  USING      (id = auth.uid() OR get_user_role() = 'master')
  WITH CHECK (id = auth.uid() OR get_user_role() = 'master');

CREATE POLICY "del_perfil" ON users_perfil
  FOR DELETE
  USING (get_user_role() = 'master');


-- 2.3 Trava extra: ninguém além do master pode conceder a função master,
--     nem para si mesmo. A API (service role) e o SQL Editor continuam
--     funcionando normalmente, porque lá auth.uid() é nulo.

CREATE OR REPLACE FUNCTION bloqueia_master_indevido()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  virou_master BOOLEAN;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    virou_master := (NEW.role = 'master');
  ELSE
    virou_master := (NEW.role = 'master' AND OLD.role IS DISTINCT FROM 'master');
  END IF;

  IF virou_master AND coalesce(get_user_role(), '') <> 'master' THEN
    RAISE EXCEPTION 'Somente o usuario master pode conceder a funcao master';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_bloqueia_master_indevido ON users_perfil;
CREATE TRIGGER trg_bloqueia_master_indevido
  BEFORE INSERT OR UPDATE ON users_perfil
  FOR EACH ROW
  EXECUTE FUNCTION bloqueia_master_indevido();

COMMIT;


-- ════════════════════════════════════════════════════════════════════
-- PASSO 3 — CONFERÊNCIA
-- ════════════════════════════════════════════════════════════════════

-- 3.1 Agora só deve sobrar VOCÊ como master:
SELECT nome, email, username, role
FROM users_perfil
WHERE role = 'master';

-- 3.2 Não pode existir nenhuma policy de INSERT (cmd = 'INSERT') nem
--     FOR ALL (cmd = 'ALL') em users_perfil. Se aparecer alguma, me avise.
SELECT policyname, cmd, qual, with_check
FROM pg_policies
WHERE schemaname = 'public' AND tablename = 'users_perfil'
ORDER BY cmd, policyname;
