import { createClient } from '@supabase/supabase-js'

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')

  if (req.method === 'OPTIONS' || req.method === 'GET') {
    return res.status(200).json({ received: true })
  }

  try {
    const body = req.body || {}
    console.log('Webhook MP recebido:', JSON.stringify(body))

    const paymentId = body?.data?.id
      || (body?.resource ? String(body.resource).split('/').pop() : null)
    const action = body?.action || body?.type

    if (!paymentId) return res.status(200).json({ received: true })

    const isPaymentEvent = ['payment.updated', 'payment.created', 'payment'].includes(action)
    if (!isPaymentEvent) return res.status(200).json({ received: true })

    const SUPABASE_URL = process.env.SUPABASE_URL
    const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

    if (!SUPABASE_URL || !SUPABASE_KEY) {
      console.error('Variáveis Supabase não configuradas no Vercel')
      return res.status(200).json({ received: true })
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)

    // Busca a cobrança pelo external_reference para pegar o tenant_id
    // (será preenchido depois de consultar o MP)
    // Primeiro consulta o MP com token padrão do env
    let MP_TOKEN = process.env.MP_ACCESS_TOKEN

    const mpResp = await fetch(`https://api.mercadopago.com/v1/payments/${paymentId}`, {
      headers: { Authorization: `Bearer ${MP_TOKEN}` },
    })

    if (!mpResp.ok) {
      console.error(`Erro ao consultar MP: ${mpResp.status}`)
      return res.status(200).json({ received: true })
    }

    const paymentData = await mpResp.json()

    if (paymentData.status === 'approved' && paymentData.external_reference) {
      const cobrancaId = paymentData.external_reference

      // Busca o tenant_id da cobrança para pegar o token correto
      const { data: cobranca } = await supabase
        .from('cobrancas')
        .select('tenant_id')
        .eq('id', cobrancaId)
        .maybeSingle()

      // Se o tenant tem token próprio, re-consulta com ele (confirma autenticidade)
      if (cobranca?.tenant_id) {
        const { data: cfg } = await supabase
          .from('configuracoes')
          .select('mp_access_token')
          .eq('tenant_id', cobranca.tenant_id)
          .maybeSingle()

        if (cfg?.mp_access_token?.trim()) {
          MP_TOKEN = cfg.mp_access_token.trim()
        }
      }

      const valorBruto   = paymentData.transaction_amount
      const valorLiquido = paymentData.transaction_details?.net_received_amount ?? 0

      const { error } = await supabase
        .from('cobrancas')
        .update({
          status: 'PAGO',
          data_pagamento: new Date().toISOString(),
          id_mp: String(paymentId),
          valor_liquido: valorLiquido,
        })
        .eq('id', cobrancaId)
        .neq('status', 'PAGO')

      if (error) console.error('Erro Supabase:', error)
      else console.log(`Cobrança ${cobrancaId} PAGA! Bruto: ${valorBruto} | Líquido: ${valorLiquido}`)
    }

    return res.status(200).json({ received: true })
  } catch (err) {
    console.error('Erro Webhook:', err.message)
    return res.status(200).json({ received: true })
  }
}
