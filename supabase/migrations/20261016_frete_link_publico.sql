-- ============================================================================
-- LINK PÚBLICO DE FRETE (cliente cota e paga sem login)
-- ============================================================================
-- Data: 16/10/2026
--
-- Adiciona um token único por romaneio. Esse token é a chave do link que a
-- funcionária manda no WhatsApp: https://sellcontrol.app/frete/<token>
-- Nenhuma policy nova é criada: a página pública nunca lê as tabelas direto,
-- todo o acesso passa pela Edge Function `frete-publico` (service role),
-- que valida o token e só devolve os dados daquele romaneio.
-- ============================================================================

ALTER TABLE romaneios
  ADD COLUMN IF NOT EXISTS link_token UUID;

-- Gera token para os romaneios que já existem
UPDATE romaneios
   SET link_token = gen_random_uuid()
 WHERE link_token IS NULL;

-- Novos romaneios já nascem com token
ALTER TABLE romaneios
  ALTER COLUMN link_token SET DEFAULT gen_random_uuid();

CREATE UNIQUE INDEX IF NOT EXISTS idx_romaneios_link_token
  ON romaneios(link_token);

COMMENT ON COLUMN romaneios.link_token IS
  'Token do link público de frete enviado ao cliente por WhatsApp';
