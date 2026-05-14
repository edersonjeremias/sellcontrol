import { createClient } from '@supabase/supabase-js'

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')

  if (req.method === 'OPTIONS') return res.status(200).json({ ok: true })
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  try {
    const { idCobranca, valorParte1 } = req.body || {}

    if (!idCobranca || valorParte1 == null) {
      return res.status(400).json({ error: 'idCobranca e valorParte1 são obrigatórios' })
    }

    const SUPABASE_URL = process.env.SUPABASE_URL
    const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
    if (!SUPABASE_URL || !SUPABASE_KEY) {
      return res.status(500).json({ error: 'Variáveis Supabase não configuradas' })
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)

    const { data: cob, error: cobErr } = await supabase
      .from('cobrancas')
      .select('*')
      .eq('id', idCobranca)
      .single()

    if (cobErr || !cob) return res.status(404).json({ error: 'Cobrança não encontrada' })

    const total = Number(cob.total)
    const v1    = parseFloat(parseFloat(String(valorParte1).replace(',', '.')).toFixed(2))
    const v2    = parseFloat((total - v1).toFixed(2))

    if (v1 <= 0 || v2 <= 0 || v1 >= total) {
      return res.status(400).json({ error: 'Valor inválido para divisão' })
    }

    let MP_TOKEN = process.env.MP_ACCESS_TOKEN

    const { data: cfg } = await supabase
      .from('configuracoes')
      .select('mp_access_token')
      .eq('tenant_id', cob.tenant_id)
      .maybeSingle()

    if (cfg?.mp_access_token?.trim()) MP_TOKEN = cfg.mp_access_token.trim()
    if (!MP_TOKEN) return res.status(400).json({ error: 'Token do Mercado Pago não configurado' })

    const WEBHOOK_URL = 'https://gtsdgkalolqzjmmwtvdv.supabase.co/functions/v1/mercadopago-webhook'
    const clienteSlug = String(cob.cliente).toLowerCase()
      .normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]/g, '')

    async function criarPreferencia(valor, parte) {
      const payload = {
        items: [{
          title: `Pedido-${String(cob.cliente).split(' ')[0]}-P${parte}`,
          quantity: 1,
          currency_id: 'BRL',
          unit_price: valor,
        }],
        payer: {
          name: cob.cliente,
          email: `${clienteSlug}@vmkids.com.br`,
        },
        external_reference: `${idCobranca}-P${parte}`,
        notification_url: WEBHOOK_URL,
        back_urls: {
          success: `https://sellcontrol.vercel.app/recibo/${idCobranca}`,
          failure:  `https://sellcontrol.vercel.app/recibo/${idCobranca}`,
          pending:  `https://sellcontrol.vercel.app/recibo/${idCobranca}`,
        },
        auto_return: 'approved',
      }

      const resp = await fetch('https://api.mercadopago.com/checkout/preferences', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${MP_TOKEN}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      })

      if (!resp.ok) {
        const err = await resp.json().catch(() => ({}))
        throw new Error(err.message || `Erro ${resp.status} no Mercado Pago`)
      }

      const data = await resp.json()
      if (!data.init_point) throw new Error('Link não retornado pelo Mercado Pago')
      return { link: data.init_point, id_mp: data.id }
    }

    const [pref1, pref2] = await Promise.all([
      criarPreferencia(v1, 1),
      criarPreferencia(v2, 2),
    ])

    const dados_divisao = {
      link_p1:       pref1.link,
      valor_p1:      v1,
      status_p1:     'PENDENTE',
      id_mp_pref_p1: String(pref1.id_mp),
      link_p2:       pref2.link,
      valor_p2:      v2,
      status_p2:     'PENDENTE',
      id_mp_pref_p2: String(pref2.id_mp),
    }

    const { error: updErr } = await supabase
      .from('cobrancas')
      .update({ dados_divisao })
      .eq('id', idCobranca)

    if (updErr) throw updErr

    return res.status(200).json({ ok: true, dados_divisao })

  } catch (err) {
    console.error('Erro dividir-pagamento:', err.message)
    return res.status(500).json({ error: err.message })
  }
}
