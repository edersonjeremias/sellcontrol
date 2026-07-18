-- ============================================================
-- PORTAL DO CLIENTE — VM KIDS
-- Cole e execute no SQL Editor do Supabase
-- ============================================================

-- 1. TABELAS
-- ============================================================

CREATE TABLE IF NOT EXISTS portal_clientes (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID        REFERENCES auth.users(id) ON DELETE CASCADE UNIQUE,
  instagram       TEXT        UNIQUE NOT NULL,
  nome_completo   TEXT,
  cpf             TEXT,
  data_nascimento DATE,
  celular         TEXT,
  cep             TEXT,
  rua             TEXT,
  numero          TEXT,
  complemento     TEXT,
  bairro          TEXT,
  cidade          TEXT,
  estado          TEXT,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS portal_produtos (
  id                  UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  cliente_instagram   TEXT          NOT NULL REFERENCES portal_clientes(instagram) ON DELETE CASCADE,
  codigo_peca         TEXT,
  descricao_completa  TEXT,
  valor               DECIMAL(10,2) DEFAULT 0,
  status_peca         TEXT          DEFAULT 'Separado',
  data_insercao       TIMESTAMPTZ   DEFAULT NOW(),
  observacao          TEXT,
  data_envio          DATE,
  rastreio            TEXT
);

CREATE TABLE IF NOT EXISTS portal_cobrancas (
  id                UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  cliente_instagram TEXT          NOT NULL REFERENCES portal_clientes(instagram) ON DELETE CASCADE,
  data_compra       DATE          DEFAULT CURRENT_DATE,
  valor_total       DECIMAL(10,2) DEFAULT 0,
  link_pagamento    TEXT,
  status_pagamento  TEXT          DEFAULT 'AGUARDANDO'
);

CREATE TABLE IF NOT EXISTS portal_producao (
  id                     UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  cliente_instagram      TEXT        NOT NULL REFERENCES portal_clientes(instagram) ON DELETE CASCADE,
  status_producao        TEXT        DEFAULT 'Em fila',
  status_entrega         TEXT        DEFAULT 'Aguardando',
  data_solicitacao       TIMESTAMPTZ DEFAULT NOW(),
  obs_cliente            TEXT,
  msg_frete_cobranca     TEXT,
  link_comprovante_frete TEXT
);

-- 2. ÍNDICES
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_portal_produtos_instagram  ON portal_produtos(cliente_instagram);
CREATE INDEX IF NOT EXISTS idx_portal_cobrancas_instagram ON portal_cobrancas(cliente_instagram);
CREATE INDEX IF NOT EXISTS idx_portal_producao_instagram  ON portal_producao(cliente_instagram);

-- 3. ROW LEVEL SECURITY
-- ============================================================
ALTER TABLE portal_clientes ENABLE ROW LEVEL SECURITY;
ALTER TABLE portal_produtos  ENABLE ROW LEVEL SECURITY;
ALTER TABLE portal_cobrancas ENABLE ROW LEVEL SECURITY;
ALTER TABLE portal_producao  ENABLE ROW LEVEL SECURITY;

-- Função helper: retorna o instagram do usuário logado
CREATE OR REPLACE FUNCTION portal_get_instagram()
RETURNS TEXT
LANGUAGE sql STABLE SECURITY DEFINER
AS $$
  SELECT instagram FROM portal_clientes WHERE user_id = auth.uid() LIMIT 1;
$$;

-- portal_clientes
CREATE POLICY "portal: cliente lê próprio perfil"
  ON portal_clientes FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "portal: cliente atualiza próprio perfil"
  ON portal_clientes FOR UPDATE
  USING (user_id = auth.uid());

-- portal_produtos
CREATE POLICY "portal: cliente lê próprios produtos"
  ON portal_produtos FOR SELECT
  USING (cliente_instagram = portal_get_instagram());

-- portal_cobrancas
CREATE POLICY "portal: cliente lê próprias cobranças"
  ON portal_cobrancas FOR SELECT
  USING (cliente_instagram = portal_get_instagram());

-- portal_producao
CREATE POLICY "portal: cliente lê própria produção"
  ON portal_producao FOR SELECT
  USING (cliente_instagram = portal_get_instagram());

CREATE POLICY "portal: cliente insere produção"
  ON portal_producao FOR INSERT
  WITH CHECK (cliente_instagram = portal_get_instagram());

CREATE POLICY "portal: cliente atualiza frete"
  ON portal_producao FOR UPDATE
  USING (cliente_instagram = portal_get_instagram());

-- 4. STORAGE (bucket para comprovantes de frete)
-- ============================================================
INSERT INTO storage.buckets (id, name, public)
VALUES ('comprovantes', 'comprovantes', false)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "portal: upload comprovante"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'comprovantes');

CREATE POLICY "portal: leitura comprovante"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (bucket_id = 'comprovantes');

-- ============================================================
-- 5. COMO CRIAR UMA CONTA DE CLIENTE
-- ============================================================
-- Passo 1 — Crie o usuário no Supabase Auth (via Dashboard ou API admin):
--   email: instagram@portal.vmkids.com.br   (ex: vmkids@portal.vmkids.com.br)
--   password: senha_inicial
--
-- Passo 2 — Insira o perfil na tabela portal_clientes:
--   INSERT INTO portal_clientes (user_id, instagram, nome_completo)
--   VALUES ('<uuid-do-auth.users>', '@instagram', 'Nome Completo');
