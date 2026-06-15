-- ════════════════════════════════════════════════════════════════
-- FIX: Policies RLS para admin acessar mensagens
-- ════════════════════════════════════════════════════════════════

-- 1. Remove policies antigas de mensagens_contato
DROP POLICY IF EXISTS mensagens_admin ON mensagens_contato;
DROP POLICY IF EXISTS mensagens_portal ON mensagens_contato;

-- 2. Cria policy para ADMIN ver/criar mensagens
CREATE POLICY mensagens_admin ON mensagens_contato
  FOR ALL
  USING (
    EXISTS (
      SELECT 1
      FROM conversas c
      INNER JOIN users_perfil u ON u.tenant_id = c.tenant_id
      WHERE c.id = mensagens_contato.conversa_id
        AND u.id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM conversas c
      INNER JOIN users_perfil u ON u.tenant_id = c.tenant_id
      WHERE c.id = mensagens_contato.conversa_id
        AND u.id = auth.uid()
    )
  );

-- 3. Cria policy para PORTAL (clientes) via RPC SECURITY DEFINER
-- (As RPCs já têm SECURITY DEFINER então bypassa RLS, mas vamos deixar uma policy vazia)
CREATE POLICY mensagens_portal ON mensagens_contato
  FOR SELECT
  USING (false); -- Nunca permite SELECT direto, só via RPC

-- ══════════════════════════════════════════════════════════════════
-- DONE! Execute e teste novamente
-- ══════════════════════════════════════════════════════════════════
