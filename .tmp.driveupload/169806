import pg from 'pg'
const { Client } = pg

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  if (req.method === 'OPTIONS') return res.status(200).end()

  // Proteção simples
  const secret = req.query.secret || req.body?.secret
  if (secret !== 'vmkids-migrate-2026') {
    return res.status(401).json({ error: 'Não autorizado' })
  }

  const dbUrl = process.env.SUPABASE_DB_URL
  if (!dbUrl) {
    return res.status(500).json({
      error: 'SUPABASE_DB_URL não configurada',
      instructions: 'Adicione SUPABASE_DB_URL nas variáveis de ambiente do Vercel. Encontre em: Supabase → Project Settings → Database → Connection string (URI)',
    })
  }

  const client = new Client({ connectionString: dbUrl, ssl: { rejectUnauthorized: false } })

  try {
    await client.connect()

    const sqls = [
      `ALTER TABLE clientes ADD COLUMN IF NOT EXISTS whatsapp        text DEFAULT ''`,
      `ALTER TABLE clientes ADD COLUMN IF NOT EXISTS senha           text DEFAULT ''`,
      `ALTER TABLE clientes ADD COLUMN IF NOT EXISTS nome_completo   text DEFAULT ''`,
      `ALTER TABLE clientes ADD COLUMN IF NOT EXISTS cpf             text DEFAULT ''`,
      `ALTER TABLE clientes ADD COLUMN IF NOT EXISTS data_nascimento text DEFAULT ''`,
      `ALTER TABLE clientes ADD COLUMN IF NOT EXISTS cep             text DEFAULT ''`,
      `ALTER TABLE clientes ADD COLUMN IF NOT EXISTS rua             text DEFAULT ''`,
      `ALTER TABLE clientes ADD COLUMN IF NOT EXISTS numero          text DEFAULT ''`,
      `ALTER TABLE clientes ADD COLUMN IF NOT EXISTS complemento     text DEFAULT ''`,
      `ALTER TABLE clientes ADD COLUMN IF NOT EXISTS bairro          text DEFAULT ''`,
      `ALTER TABLE clientes ADD COLUMN IF NOT EXISTS cidade          text DEFAULT ''`,
      `ALTER TABLE clientes ADD COLUMN IF NOT EXISTS uf              text DEFAULT ''`,
      `ALTER TABLE clientes ADD COLUMN IF NOT EXISTS email           text DEFAULT ''`,
    ]

    const results = []
    for (const sql of sqls) {
      await client.query(sql)
      results.push({ sql: sql.replace('ALTER TABLE clientes ', ''), status: 'ok' })
    }

    await client.end()
    return res.status(200).json({ success: true, message: 'Migração concluída!', results })
  } catch (err) {
    await client.end().catch(() => {})
    return res.status(500).json({ error: err.message })
  }
}
