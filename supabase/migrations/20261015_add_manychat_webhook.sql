-- ============================================================
-- INTEGRAÇÃO MANYCHAT: token de webhook por empresa
--
-- Cada tenant gera o próprio token em Configurações → Integrações.
-- A Edge Function `receber-solicitacao-envio` usa esse token para
-- descobrir de qual empresa veio a solicitação, sem nada fixo no código.
-- Cole e execute no SQL Editor do Supabase.
-- ============================================================

ALTER TABLE configuracoes
ADD COLUMN IF NOT EXISTS manychat_webhook_token TEXT;

-- Um token nunca pode pertencer a duas empresas
CREATE UNIQUE INDEX IF NOT EXISTS idx_config_manychat_token
  ON configuracoes(manychat_webhook_token)
  WHERE manychat_webhook_token IS NOT NULL;

COMMENT ON COLUMN configuracoes.manychat_webhook_token IS
  'Token do webhook do ManyChat (header x-webhook-secret). Identifica a empresa na function receber-solicitacao-envio. Vazio = integração desativada';
