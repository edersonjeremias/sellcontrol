import pg from 'pg'
const { Client } = pg

const SQL_PORTAL = [
  // Tabelas
  `CREATE TABLE IF NOT EXISTS portal_clientes (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID REFERENCES auth.users(id) ON DELETE CASCADE UNIQUE,
    instagram       TEXT UNIQUE NOT NULL,
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
  )`,
  `CREATE TABLE IF NOT EXISTS portal_produtos (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    cliente_instagram   TEXT NOT NULL REFERENCES portal_clientes(instagram) ON DELETE CASCADE,
    codigo_peca         TEXT,
    descricao_completa  TEXT,
    valor               DECIMAL(10,2) DEFAULT 0,
    status_peca         TEXT DEFAULT 'Separado',
    data_insercao       TIMESTAMPTZ DEFAULT NOW(),
    observacao          TEXT,
    data_envio          DATE,
    rastreio            TEXT
  )`,
  `CREATE TABLE IF NOT EXISTS portal_cobrancas (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    cliente_instagram TEXT NOT NULL REFERENCES portal_clientes(instagram) ON DELETE CASCADE,
    data_compra       DATE DEFAULT CURRENT_DATE,
    valor_total       DECIMAL(10,2) DEFAULT 0,
    link_pagamento    TEXT,
    status_pagamento  TEXT DEFAULT 'AGUARDANDO'
  )`,
  `CREATE TABLE IF NOT EXISTS portal_producao (
    id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    cliente_instagram      TEXT NOT NULL REFERENCES portal_clientes(instagram) ON DELETE CASCADE,
    status_producao        TEXT DEFAULT 'Em fila',
    status_entrega         TEXT DEFAULT 'Aguardando',
    data_solicitacao       TIMESTAMPTZ DEFAULT NOW(),
    obs_cliente            TEXT,
    msg_frete_cobranca     TEXT,
    link_comprovante_frete TEXT
  )`,

  // Índices
  `CREATE INDEX IF NOT EXISTS idx_pportal_produtos_instagram  ON portal_produtos(cliente_instagram)`,
  `CREATE INDEX IF NOT EXISTS idx_portal_cobrancas_instagram ON portal_cobrancas(cliente_instagram)`,
  `CREATE INDEX IF NOT EXISTS idx_portal_producao_instagram  ON portal_producao(cliente_instagram)`,

  // RLS
  `ALTER TABLE portal_clientes ENABLE ROW LEVEL SECURITY`,
  `ALTER TABLE portal_produtos  ENABLE ROW LEVEL SECURITY`,
  `ALTER TABLE portal_cobrancas ENABLE ROW LEVEL SECURITY`,
  `ALTER TABLE portal_producao  ENABLE ROW LEVEL SECURITY`,

  // Função helper
  `CREATE OR REPLACE FUNCTION portal_get_instagram()
   RETURNS TEXT LANGUAGE sql STABLE SECURITY DEFINER AS $$
     SELECT instagram FROM portal_clientes WHERE user_id = auth.uid() LIMIT 1;
   $$`,

  // Policies portal_clientes
  `DO $$ BEGIN
     IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='portal_clientes' AND policyname='portal: cliente lê próprio perfil') THEN
       CREATE POLICY "portal: cliente lê próprio perfil" ON portal_clientes FOR SELECT USING (user_id = auth.uid());
     END IF;
   END $$`,
  `DO $$ BEGIN
     IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='portal_clientes' AND policyname='portal: cliente atualiza próprio perfil') THEN
       CREATE POLICY "portal: cliente atualiza próprio perfil" ON portal_clientes FOR UPDATE USING (user_id = auth.uid());
     END IF;
   END $$`,

  // Policies portal_produtos
  `DO $$ BEGIN
     IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='portal_produtos' AND policyname='portal: cliente lê próprios produtos') THEN
       CREATE POLICY "portal: cliente lê próprios produtos" ON portal_produtos FOR SELECT USING (cliente_instagram = portal_get_instagram());
     END IF;
   END $$`,

  // Policies portal_cobrancas
  `DO $$ BEGIN
     IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='portal_cobrancas' AND policyname='portal: cliente lê próprias cobranças') THEN
       CREATE POLICY "portal: cliente lê próprias cobranças" ON portal_cobrancas FOR SELECT USING (cliente_instagram = portal_get_instagram());
     END IF;
   END $$`,

  // Policies portal_producao
  `DO $$ BEGIN
     IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='portal_producao' AND policyname='portal: cliente lê própria produção') THEN
       CREATE POLICY "portal: cliente lê própria produção" ON portal_producao FOR SELECT USING (cliente_instagram = portal_get_instagram());
     END IF;
   END $$`,
  `DO $$ BEGIN
     IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='portal_producao' AND policyname='portal: cliente insere produção') THEN
       CREATE POLICY "portal: cliente insere produção" ON portal_producao FOR INSERT WITH CHECK (cliente_instagram = portal_get_instagram());
     END IF;
   END $$`,
  `DO $$ BEGIN
     IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='portal_producao' AND policyname='portal: cliente atualiza frete') THEN
       CREATE POLICY "portal: cliente atualiza frete" ON portal_producao FOR UPDATE USING (cliente_instagram = portal_get_instagram());
     END IF;
   END $$`,

  // Storage
  `INSERT INTO storage.buckets (id, name, public)
   VALUES ('comprovantes', 'comprovantes', false)
   ON CONFLICT (id) DO NOTHING`,
  `DO $$ BEGIN
     IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='objects' AND policyname='portal: upload comprovante') THEN
       CREATE POLICY "portal: upload comprovante" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'comprovantes');
     END IF;
   END $$`,
  `DO $$ BEGIN
     IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='objects' AND policyname='portal: leitura comprovante') THEN
       CREATE POLICY "portal: leitura comprovante" ON storage.objects FOR SELECT TO authenticated USING (bucket_id = 'comprovantes');
     END IF;
   END $$`,
]

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  if (req.method === 'OPTIONS') return res.status(200).end()

  const secret = req.query.secret || req.body?.secret
  if (secret !== 'vmkids-migrate-2026') {
    return res.status(401).json({ error: 'Não autorizado' })
  }

  const dbUrl = process.env.SUPABASE_DB_URL
  if (!dbUrl) {
    return res.status(500).json({
      error: 'SUPABASE_DB_URL não configurada',
      instrucoes: 'No Vercel → Settings → Environment Variables, adicione SUPABASE_DB_URL. Encontre em: Supabase → Project Settings → Database → Connection string (URI mode)',
    })
  }

  const client = new Client({ connectionString: dbUrl, ssl: { rejectUnauthorized: false } })
  try {
    await client.connect()
    const results = []
    for (const sql of SQL_PORTAL) {
      const label = sql.trim().split('\n')[0].slice(0, 60)
      await client.query(sql)
      results.push({ label, status: 'ok' })
    }
    await client.end()
    return res.status(200).json({ success: true, message: 'Portal configurado!', results })
  } catch (err) {
    await client.end().catch(() => {})
    return res.status(500).json({ error: err.message })
  }
}
