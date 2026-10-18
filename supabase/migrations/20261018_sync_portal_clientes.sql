-- ============================================================
-- Sincronização dos dados do portal com a tabela clientes
-- ============================================================
-- O cliente preenche cadastro e endereços no portal, que gravam em
-- portal_clientes / enderecos_clientes. A página Clientes do sistema lê
-- de clientes — por isso os dados não apareciam no modal "Dados para
-- Envio" nem nas colunas de endereço da busca avançada.
--
-- Aqui: garante as colunas de destino, cria o campo de e-mail no portal
-- e traz (backfill) o que os clientes já preencheram.
-- ============================================================

-- 1. E-mail no cadastro e no endereço do portal
ALTER TABLE portal_clientes
ADD COLUMN IF NOT EXISTS email TEXT;

ALTER TABLE enderecos_clientes
ADD COLUMN IF NOT EXISTS email TEXT;

COMMENT ON COLUMN enderecos_clientes.email IS
  'E-mail do destinatário. Enviado na criação do pedido no Melhor Envio';

-- 2. Colunas de destino em clientes (criadas fora de migration no passado)
ALTER TABLE clientes
  ADD COLUMN IF NOT EXISTS cpf             TEXT,
  ADD COLUMN IF NOT EXISTS data_nascimento DATE,
  ADD COLUMN IF NOT EXISTS cep             TEXT,
  ADD COLUMN IF NOT EXISTS rua             TEXT,
  ADD COLUMN IF NOT EXISTS numero          TEXT,
  ADD COLUMN IF NOT EXISTS complemento     TEXT,
  ADD COLUMN IF NOT EXISTS bairro          TEXT,
  ADD COLUMN IF NOT EXISTS cidade          TEXT,
  ADD COLUMN IF NOT EXISTS uf              TEXT;

-- 3. Backfill do cadastro do portal.
--    NULLIF evita sobrescrever dado existente com string vazia.
UPDATE clientes c
SET
  nome_completo   = COALESCE(NULLIF(p.nome_completo, ''), c.nome_completo),
  cpf             = COALESCE(NULLIF(p.cpf, ''),           c.cpf),
  data_nascimento = COALESCE(p.data_nascimento,           c.data_nascimento),
  whatsapp        = COALESCE(NULLIF(p.celular, ''),       NULLIF(c.whatsapp, '')),
  email           = COALESCE(NULLIF(p.email, ''),         c.email),
  cep             = COALESCE(NULLIF(p.cep, ''),           c.cep),
  rua             = COALESCE(NULLIF(p.rua, ''),           c.rua),
  numero          = COALESCE(NULLIF(p.numero, ''),        c.numero),
  complemento     = COALESCE(NULLIF(p.complemento, ''),   c.complemento),
  bairro          = COALESCE(NULLIF(p.bairro, ''),        c.bairro),
  cidade          = COALESCE(NULLIF(p.cidade, ''),        c.cidade),
  uf              = COALESCE(NULLIF(p.estado, ''),        c.uf)
FROM portal_clientes p
WHERE lower(replace(c.instagram, '@', '')) = lower(replace(p.instagram, '@', ''));

-- 4. Backfill do endereço padrão (tem precedência sobre o do cadastro,
--    por ser o endereço que o cliente usa para receber).
UPDATE clientes c
SET
  cep         = COALESCE(NULLIF(e.cep, ''),         c.cep),
  rua         = COALESCE(NULLIF(e.rua, ''),         c.rua),
  numero      = COALESCE(NULLIF(e.numero, ''),      c.numero),
  complemento = COALESCE(NULLIF(e.complemento, ''), c.complemento),
  bairro      = COALESCE(NULLIF(e.bairro, ''),      c.bairro),
  cidade      = COALESCE(NULLIF(e.cidade, ''),      c.cidade),
  uf          = COALESCE(NULLIF(e.estado, ''),      c.uf)
FROM enderecos_clientes e
WHERE e.tenant_id = c.tenant_id
  AND e.padrao = true
  AND lower(replace(c.instagram, '@', '')) = lower(replace(e.cliente_instagram, '@', ''));
