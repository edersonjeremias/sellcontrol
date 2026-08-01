import { createClient } from '@supabase/supabase-js'

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')

  if (req.method === 'OPTIONS') return res.status(200).json({ ok: true })
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  try {
    const {
      cobrancaId,
      cupom_codigo,
      cupom_desconto_percentual,
      cupom_desconto_valor,
      cupom_id,
      total,
      link_mp,
      id_mp
    } = req.body || {}

    if (!cobrancaId) {
      return res.status(400).json({ error: 'cobrancaId é obrigatório' })
    }

    const SUPABASE_URL = process.env.SUPABASE_URL
    const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

    if (!SUPABASE_URL || !SUPABASE_KEY) {
      return res.status(500).json({ error: 'Variáveis Supabase não configuradas' })
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)

    // Atualiza cobrança com os dados do cupom
    const { data, error } = await supabase
      .from('cobrancas')
      .update({
        cupom_codigo,
        cupom_desconto_percentual,
        cupom_desconto_valor,
        cupom_id,
        total,
        link_mp,
        id_mp
      })
      .eq('id', cobrancaId)
      .select()

    if (error) {
      console.error('Erro ao aplicar cupom:', error)
      throw error
    }

    console.log('✅ Cupom aplicado com sucesso:', data)

    return res.status(200).json({ ok: true, data })

  } catch (err) {
    console.error('Erro aplicar-cupom:', err.message)
    return res.status(500).json({ error: err.message })
  }
}
