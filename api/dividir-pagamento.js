import { createClient } from '@supabase/supabase-js'

// Recebe { idCobranca, dados_divisao } — as preferências MP já foram criadas
// no client, este endpoint apenas persiste o resultado no banco.
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')

  if (req.method === 'OPTIONS') return res.status(200).json({ ok: true })
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  try {
    const { idCobranca, dados_divisao } = req.body || {}

    if (!idCobranca || !dados_divisao) {
      return res.status(400).json({ error: 'idCobranca e dados_divisao são obrigatórios' })
    }

    const SUPABASE_URL = process.env.SUPABASE_URL
    const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
    if (!SUPABASE_URL || !SUPABASE_KEY) {
      return res.status(500).json({ error: 'Variáveis Supabase não configuradas' })
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)

    const { error } = await supabase
      .from('cobrancas')
      .update({ dados_divisao })
      .eq('id', idCobranca)

    if (error) throw error

    return res.status(200).json({ ok: true })

  } catch (err) {
    console.error('Erro dividir-pagamento:', err.message)
    return res.status(500).json({ error: err.message })
  }
}
