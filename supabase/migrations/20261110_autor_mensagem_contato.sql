-- ============================================================
-- Nome de quem respondeu o cliente no contato do portal
-- ============================================================
-- O portal mostrava "VM Kids" fixo no rodapé de cada mensagem da loja —
-- nome antigo da empresa, escrito no código. Agora cada resposta guarda
-- quem a escreveu.
--
-- O nome é gravado na mensagem, e não resolvido por join na leitura: o
-- cliente continua vendo quem o atendeu mesmo que a pessoa saia da equipe.
-- ============================================================

ALTER TABLE mensagens_contato
ADD COLUMN IF NOT EXISTS autor_nome TEXT;

COMMENT ON COLUMN mensagens_contato.autor_nome IS
  'Nome do atendente que enviou a mensagem. Vazio nas mensagens do cliente e nas anteriores a este campo';

NOTIFY pgrst, 'reload schema';
