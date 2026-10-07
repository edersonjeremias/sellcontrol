-- Adicionar campos de mensagem personalizada para cobranças
-- Permite configurar uma mensagem que será incluída nos links de pagamento

ALTER TABLE configuracoes
ADD COLUMN IF NOT EXISTS mensagem_cobranca_custom TEXT,
ADD COLUMN IF NOT EXISTS mensagem_cobranca_ativa BOOLEAN DEFAULT false;

COMMENT ON COLUMN configuracoes.mensagem_cobranca_custom IS
  'Mensagem personalizada incluída nos links de cobrança via WhatsApp';

COMMENT ON COLUMN configuracoes.mensagem_cobranca_ativa IS
  'Se true, a mensagem personalizada será incluída. Se false, fica salva mas não é enviada';
