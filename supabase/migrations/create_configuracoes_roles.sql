-- Tabela de configurações por tenant
CREATE TABLE IF NOT EXISTS configuracoes (
  id             uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id      uuid NOT NULL UNIQUE,
  mp_access_token text DEFAULT '',
  nome_loja      text DEFAULT '',
  whatsapp       text DEFAULT '',
  email_contato  text DEFAULT '',
  created_at     timestamptz DEFAULT now(),
  updated_at     timestamptz DEFAULT now()
);

ALTER TABLE configuracoes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "configuracoes_rw" ON configuracoes;
CREATE POLICY "configuracoes_rw" ON configuracoes
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Adiciona coluna role em users_perfil (se ainda não existir)
ALTER TABLE users_perfil ADD COLUMN IF NOT EXISTS role text DEFAULT 'admin';
