-- Mensagem informativa exibida ao cliente após encerrar a sacolinha no portal.
-- O cliente precisa marcar um check de ciência e clicar em "Entendi" para fechar.
-- Se o campo estiver vazio, o modal informativo não é exibido.

ALTER TABLE configuracoes
ADD COLUMN IF NOT EXISTS mensagem_encerramento_sacolinha TEXT;

COMMENT ON COLUMN configuracoes.mensagem_encerramento_sacolinha IS
  'Texto informativo mostrado ao cliente no portal após encerrar a sacolinha. Vazio = modal não aparece';
