-- ════════════════════════════════════════════════════════════
-- ATUALIZA SISTEMA DE NOTIFICAÇÕES PARA SUPORTAR CONVERSAS
-- ════════════════════════════════════════════════════════════

-- Adiciona campos de conversa na tabela notificacoes
ALTER TABLE notificacoes ADD COLUMN IF NOT EXISTS coluna TEXT DEFAULT 'Novo';
ALTER TABLE notificacoes ADD COLUMN IF NOT EXISTS assunto TEXT;
ALTER TABLE notificacoes ADD COLUMN IF NOT EXISTS destinatario TEXT DEFAULT 'TODOS';
ALTER TABLE notificacoes ADD COLUMN IF NOT EXISTS remetente TEXT DEFAULT 'SISTEMA';
ALTER TABLE notificacoes ADD COLUMN IF NOT EXISTS encerrado BOOLEAN DEFAULT false;
ALTER TABLE notificacoes ADD COLUMN IF NOT EXISTS nao_lidas INTEGER DEFAULT 0;

-- Tabela de mensagens (respostas) para cada notificação
CREATE TABLE IF NOT EXISTS notificacoes_mensagens (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  notificacao_id UUID      NOT NULL REFERENCES notificacoes(id) ON DELETE CASCADE,
  tenant_id    UUID        NOT NULL,
  user_id      UUID        REFERENCES auth.users(id) ON DELETE SET NULL,
  remetente    TEXT        NOT NULL,
  mensagem     TEXT        NOT NULL,
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

-- Índices
CREATE INDEX IF NOT EXISTS idx_notif_msg_notif ON notificacoes_mensagens(notificacao_id);
CREATE INDEX IF NOT EXISTS idx_notif_msg_tenant ON notificacoes_mensagens(tenant_id);

-- RLS para mensagens
ALTER TABLE notificacoes_mensagens ENABLE ROW LEVEL SECURITY;

CREATE POLICY "usuarios_veem_mensagens_do_tenant"
  ON notificacoes_mensagens FOR SELECT
  USING (
    tenant_id IN (
      SELECT tenant_id FROM users_perfil WHERE id = auth.uid()
    )
  );

CREATE POLICY "usuarios_criam_mensagens"
  ON notificacoes_mensagens FOR INSERT
  WITH CHECK (
    tenant_id IN (
      SELECT tenant_id FROM users_perfil WHERE id = auth.uid()
    )
  );

-- Tabela de colunas personalizadas
CREATE TABLE IF NOT EXISTS notificacoes_colunas (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id  UUID NOT NULL,
  colunas    JSONB DEFAULT '["Novo","Orçamento","Negociação","Aguardando Resposta","Encerrado"]'::jsonb,
  UNIQUE(tenant_id)
);

ALTER TABLE notificacoes_colunas ENABLE ROW LEVEL SECURITY;

CREATE POLICY "usuarios_veem_colunas_do_tenant"
  ON notificacoes_colunas FOR ALL
  USING (
    tenant_id IN (
      SELECT tenant_id FROM users_perfil WHERE id = auth.uid()
    )
  );
