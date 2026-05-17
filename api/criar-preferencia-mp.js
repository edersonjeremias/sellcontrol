import { createClient } from '@supabase/supabase-js'

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')

  if (req.method === 'OPTIONS') return res.status(200).json({ ok: true })
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  try {
    const { tenant_id, payload } = req.body || {}
    if (!tenant_id || !payload) {
      return res.status(400).json({ error: 'tenant_id e payload são obrigatórios' })
    }

    const SUPABASE_URL = process.env.SUPABASE_URL
    const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
    if (!SUPABASE_URL || !SUPABASE_KEY) {
      return res.status(500).json({ error: 'Variáveis Supabase não configuradas no servidor' })
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)
    const { data: config, error: dbErr } = await supabase
      .from('configuracoes')
      .select('mp_access_token')
      .eq('tenant_id', tenant_id)
      .maybeSingle()

    if (dbErr) console.error('Supabase erro:', dbErr.message)

    const MP_TOKEN = config?.mp_access_token?.trim() || process.env.MP_ACCESS_TOKEN || ''
    if (!MP_TOKEN) {
      return res.status(422).json({ error: 'Token do Mercado Pago não encontrado. Configure-o em Configurações da Empresa.' })
    }

    const mpResp = await fetch('https://api.mercadopago.com/checkout/preferences', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${MP_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    })

    // Lê o body como texto primeiro para evitar crash em resposta não-JSON
    const rawText = await mpResp.text()
    let data = {}
    try {
      if (rawText) data = JSON.parse(rawText)
    } catch {
      console.error('MP API resposta não-JSON status', mpResp.status, ':', rawText.slice(0, 300))
      return res.status(502).json({ error: `Mercado Pago retornou resposta inválida (status ${mpResp.status}). Verifique o token e tente novamente.` })
    }

    if (!mpResp.ok) {
      console.error('MP API erro:', mpResp.status, JSON.stringify(data).slice(0, 300))
      return res.status(mpResp.status).json(data)
    }

    return res.status(200).json(data)

  } catch (err) {
    console.error('Erro criar-preferencia-mp:', err.message)
    return res.status(500).json({ error: err.message })
  }
}
