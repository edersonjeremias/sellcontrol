-- ════════════════════════════════════════════════════════════
-- SISTEMA DE NOTIFICAÇÕES INTERNAS (CORRIGIDO)
-- ════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS notificacoes (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    UUID        NOT NULL,
  user_id      UUID        REFERENCES auth.users(id) ON DELETE CASCADE,
  tipo         TEXT        NOT NULL DEFAULT 'sistema',
  titulo       TEXT        NOT NULL,
  mensagem     TEXT        NOT NULL,
  metadata     JSONB       DEFAULT '{}'::jsonb,
  lida         BOOLEAN     DEFAULT false,
  lida_em      TIMESTAMPTZ,
  created_at   TIMESTAMPTZ DEFAULT NOW(),

  CONSTRAINT notificacoes_tipo_check CHECK (tipo IN ('sistema', 'cancelamento', 'alerta', 'info'))
);

-- Índices para buscas rápidas
CREATE INDEX IF NOT EXISTS idx_notificacoes_tenant     ON notificacoes(tenant_id);
CREATE INDEX IF NOT EXISTS idx_notificacoes_user       ON notificacoes(user_id);
CREATE INDEX IF NOT EXISTS idx_notificacoes_lida       ON notificacoes(lida);
CREATE INDEX IF NOT EXISTS idx_notificacoes_created    ON notificacoes(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notificacoes_user_lida  ON notificacoes(user_id, lida);

-- RLS
ALTER TABLE notificacoes ENABLE ROW LEVEL SECURITY;

-- Policy: Usuários veem apenas suas notificações do seu tenant
CREATE POLICY "usuarios_veem_proprias_notificacoes"
  ON notificacoes FOR SELECT
  USING (
    tenant_id IN (
      SELECT tenant_id FROM users_perfil WHERE id = auth.uid()
    )
    AND (user_id = auth.uid() OR user_id IS NULL)
  );

-- Policy: Usuários podem marcar suas notificações como lidas
CREATE POLICY "usuarios_atualizam_proprias_notificacoes"
  ON notificacoes FOR UPDATE
  USING (
    tenant_id IN (
      SELECT tenant_id FROM users_perfil WHERE id = auth.uid()
    )
    AND user_id = auth.uid()
  );

-- Policy: Sistema pode criar notificações
CREATE POLICY "sistema_cria_notificacoes"
  ON notificacoes FOR INSERT
  WITH CHECK (
    tenant_id IN (
      SELECT tenant_id FROM users_perfil WHERE id = auth.uid()
    )
  );

-- ════════════════════════════════════════════════════════════
-- FUNÇÃO: Criar notificação de cancelamento de peça
-- ════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION criar_notificacao_cancelamento(
  p_tenant_id UUID,
  p_pedido_id UUID,
  p_codigo_peca TEXT,
  p_descricao TEXT,
  p_usuario_que_cancelou UUID
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_notif_id UUID;
  v_cliente_nome TEXT;
  v_user_id UUID;
BEGIN
  -- Busca nome do cliente
  SELECT c.nome INTO v_cliente_nome
  FROM pedidos p
  JOIN clientes c ON c.id = p.cliente_id
  WHERE p.id = p_pedido_id
  LIMIT 1;

  -- Cria notificação para admins/master do tenant
  FOR v_user_id IN (
    SELECT id FROM users_perfil
    WHERE tenant_id = p_tenant_id
    AND role IN ('admin', 'master')
    AND id != p_usuario_que_cancelou
  )
  LOOP
    INSERT INTO notificacoes (
      tenant_id,
      user_id,
      tipo,
      titulo,
      mensagem,
      metadata
    ) VALUES (
      p_tenant_id,
      v_user_id,
      'cancelamento',
      '❌ Peça Cancelada',
      format('A peça "%s - %s" do cliente "%s" foi cancelada na expedição.',
        p_codigo_peca,
        p_descricao,
        COALESCE(v_cliente_nome, 'Cliente')
      ),
      jsonb_build_object(
        'pedido_id', p_pedido_id,
        'codigo_peca', p_codigo_peca,
        'cliente', v_cliente_nome
      )
    )
    RETURNING id INTO v_notif_id;
  END LOOP;

  RETURN v_notif_id;
END;
$$;
