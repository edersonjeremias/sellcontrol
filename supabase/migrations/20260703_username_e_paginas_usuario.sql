-- ════════════════════════════════════════════════════════════
-- ADICIONA USERNAME E PÁGINAS PERMITIDAS POR USUÁRIO
-- ════════════════════════════════════════════════════════════

-- Adiciona coluna username (único por tenant)
ALTER TABLE users_perfil ADD COLUMN IF NOT EXISTS username TEXT;

-- Adiciona coluna para páginas permitidas por usuário
ALTER TABLE users_perfil ADD COLUMN IF NOT EXISTS paginas_permitidas JSONB DEFAULT '[]'::jsonb;

-- Cria índice para busca por username
CREATE INDEX IF NOT EXISTS idx_users_perfil_username ON users_perfil(tenant_id, username);

-- Adiciona constraint de unicidade: username único por tenant
ALTER TABLE users_perfil DROP CONSTRAINT IF EXISTS users_perfil_username_tenant_unique;
ALTER TABLE users_perfil ADD CONSTRAINT users_perfil_username_tenant_unique
  UNIQUE(tenant_id, username);

-- Preenche username com email (para usuários existentes)
UPDATE users_perfil
SET username = SPLIT_PART(email, '@', 1)
WHERE username IS NULL OR username = '';

-- Comentários
COMMENT ON COLUMN users_perfil.username IS 'Nome de usuário para login (único por tenant)';
COMMENT ON COLUMN users_perfil.paginas_permitidas IS 'Array de páginas que o usuário tem acesso: ["vendas", "cobrancas", "dashboard"]';
