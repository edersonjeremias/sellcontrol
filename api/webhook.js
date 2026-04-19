import { createClient } from '@supabase/supabase-js'

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')

  if (req.method === 'OPTIONS' || req.method === 'GET') {
    return res.status(200).json({ received: true })
  }

  // Sempre retorna 200 ao MP para evitar reenvios infinitos
  try {
    const body = req.body || {}
    console.log('Webhook MP recebido:', JSON.stringify(body))

    const paymentId = body?.data?.id
      || (body?.resource ? String(body.resource).split('/').pop() : null)
    const action = body?.action || body?.type

    if (!paymentId) {
      return res.status(200).json({ received: true })
    }

    const isPaymentEvent = ['payment.updated', 'payment.created', 'payment'].includes(action)
    if (!isPaymentEvent) {
      return res.status(200).json({ received: true })
    }

    // Variáveis sem prefixo VITE_ (serverless usa process.env direto)
    const MP_TOKEN = process.env.MP_ACCESS_TOKEN
    const SUPABASE_URL = process.env.SUPABASE_URL
    const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

    if (!MP_TOKEN) {
      console.error('MP_ACCESS_TOKEN não configurado no Vercel')
      return res.status(200).json({ received: true })
    }

    const mpResp = await fetch(`https://api.mercadopago.com/v1/payments/${paymentId}`, {
      headers: { Authorization: `Bearer ${MP_TOKEN}` },
    })

    if (!mpResp.ok) {
      console.error(`Erro ao consultar MP: ${mpResp.status}`)
      return res.status(200).json({ received: true })
    }

    const paymentData = await mpResp.json()

    if (paymentData.status === 'approved' && paymentData.external_reference) {
      const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)
      const { error } = await supabase
        .from('cobrancas')
        .update({
          status: 'PAGO',
          data_pagamento: new Date().toISOString(),
          id_mp: String(paymentId),
        })
        .eq('id', paymentData.external_reference)
        .neq('status', 'PAGO')

      if (error) console.error('Erro Supabase:', error)
      else console.log(`Cobrança ${paymentData.external_reference} marcada como PAGA`)
    }

    return res.status(200).json({ received: true })
  } catch (err) {
    console.error('Erro Webhook:', err.message)
    return res.status(200).json({ received: true })
  }
}
