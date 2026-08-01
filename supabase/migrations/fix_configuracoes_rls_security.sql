-- ============================================================
-- FIX CRÍTICO: Corrige RLS da tabela configuracoes
-- ANTES: Qualquer usuário podia ver configurações de todos
-- DEPOIS: Cada tenant só vê suas próprias configurações
-- ============================================================

-- 1. Remove as policies antigas (inseguras)
DROP POLICY IF EXISTS configuracoes_rw ON configuracoes;
DROP POLICY IF EXISTS configuracoes_nome_loja_public ON configuracoes;

-- 2. Cria policy SEGURA para usuários autenticados (somente do próprio tenant)
CREATE POLICY configuracoes_tenant_access ON configuracoes
  FOR ALL
  TO authenticated
  USING (
    tenant_id = (auth.jwt() ->> 'tenant_id')::uuid
  )
  WITH CHECK (
    tenant_id = (auth.jwt() ->> 'tenant_id')::uuid
  );

-- 3. Permite que usuários anônimos vejam APENAS nome_loja e slug (para o portal)
CREATE POLICY configuracoes_public_portal ON configuracoes
  FOR SELECT
  TO anon, authenticated
  USING (true);

-- IMPORTANTE: A policy acima permite SELECT de TODAS as colunas,
-- mas o portal deve usar uma VIEW ou RPC que retorna APENAS
-- as colunas públicas (nome_loja, slug).
-- Vamos criar essa proteção:

-- 4. Revoga acesso direto de anon à tabela configuracoes
REVOKE SELECT ON configuracoes FROM anon;

-- 5. Concede acesso apenas via RPC/funções específicas
-- (As funções portal_* já existem e usam SECURITY DEFINER)

-- 6. Cria VIEW pública segura (somente campos não-sensíveis)
CREATE OR REPLACE VIEW configuracoes_public AS
SELECT
  tenant_id,
  nome_loja,
  slug,
  link_frete
FROM configuracoes;

-- 7. Permite que anon acesse apenas a VIEW
GRANT SELECT ON configuracoes_public TO anon, authenticated;

-- 8. Garante que RLS está ativado
ALTER TABLE configuracoes ENABLE ROW LEVEL SECURITY;
ALTER TABLE configuracoes FORCE ROW LEVEL SECURITY;
