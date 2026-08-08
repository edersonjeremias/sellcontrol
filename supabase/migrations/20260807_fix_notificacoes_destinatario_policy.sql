-- ════════════════════════════════════════════════════════════
-- CORRIGE POLICY DE NOTIFICAÇÕES PARA CONSIDERAR DESTINATÁRIO
-- ════════════════════════════════════════════════════════════

-- Remove a policy antiga
DROP POLICY IF EXISTS "usuarios_veem_proprias_notificacoes" ON notificacoes;

-- Cria nova policy que considera o campo destinatario
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

-- Atualiza policy de UPDATE para permitir atualizar notificações destinadas ao usuário
DROP POLICY IF EXISTS "usuarios_atualizam_proprias_notificacoes" ON notificacoes;

CREATE POLICY "usuarios_atualizam_notificacoes_destinatario"
  ON notificacoes FOR UPDATE
  USING (
    tenant_id IN (
      SELECT tenant_id FROM users_perfil WHERE id = auth.uid()
    )
    AND (
      user_id = auth.uid()
      OR user_id IS NULL
      OR destinatario = 'TODOS'
      OR destinatario = (
        SELECT nome FROM users_perfil WHERE id = auth.uid()
      )
    )
  );
