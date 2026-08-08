-- ════════════════════════════════════════════════════════════
-- CORRIGE POLICY DE NOTIFICAÇÕES PARA CONSIDERAR DESTINATÁRIO
-- Execute este SQL no SQL Editor do Supabase
-- ════════════════════════════════════════════════════════════

-- Remove a policy antiga de SELECT
DROP POLICY IF EXISTS "usuarios_veem_proprias_notificacoes" ON notificacoes;

-- Cria nova policy de SELECT que considera o campo destinatario
CREATE POLICY "usuarios_veem_notificacoes_destinatario"
  ON notificacoes FOR SELECT
  USING (
    tenant_id IN (
      SELECT tenant_id FROM users_perfil WHERE id = auth.uid()
    )
    AND (
      -- Vê suas próprias notificações
      user_id = auth.uid()
      -- Vê notificações do sistema (user_id NULL)
      OR user_id IS NULL
      -- Vê notificações destinadas a TODOS
      OR destinatario = 'TODOS'
      -- Vê notificações destinadas ao seu nome
      OR destinatario = (
        SELECT nome FROM users_perfil WHERE id = auth.uid()
      )
    )
  );

-- Remove policy antiga de UPDATE
DROP POLICY IF EXISTS "usuarios_atualizam_proprias_notificacoes" ON notificacoes;

-- Cria nova policy de UPDATE que considera o campo destinatario
CREATE POLICY "usuarios_atualizam_notificacoes_destinatario"
  ON notificacoes FOR UPDATE
  USING (
    tenant_id IN (
      SELECT tenant_id FROM users_perfil WHERE id = auth.uid()
    )
    AND (
      -- Atualiza suas próprias notificações
      user_id = auth.uid()
      -- Atualiza notificações do sistema
      OR user_id IS NULL
      -- Atualiza notificações destinadas a TODOS
      OR destinatario = 'TODOS'
      -- Atualiza notificações destinadas ao seu nome
      OR destinatario = (
        SELECT nome FROM users_perfil WHERE id = auth.uid()
      )
    )
  );
