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
      const extRef = paymentData.external_reference
      const valorLiquido = paymentData.transaction_details?.net_received_amount ?? 0
      const dataPagamento = paymentData.date_approved
        ? new Date(paymentData.date_approved).toISOString()
        : new Date().toISOString()

      // Detecta pagamento dividido: external_reference termina em -P1 ou -P2
      const splitMatch = String(extRef).match(/^(.+)-(P[12])$/)

      if (splitMatch) {
        const cobrancaId = splitMatch[1]
        const parte = splitMatch[2]

        console.log(`Split payment detectado: ${parte} da cobrança ${cobrancaId}`)

        const { error: rpcErr } = await supabase.rpc('process_split_payment', {
          p_cobranca_id:    cobrancaId,
          p_parte:          parte,
          p_payment_id:     String(paymentId),
          p_valor_liquido:  valorLiquido,
          p_data_pagamento: dataPagamento,
        })

        if (rpcErr) console.error('Erro RPC split payment:', rpcErr)
        else console.log(`Split ${parte} da cobrança ${cobrancaId} processado`)

      } else {
        // Pagamento normal
        const cobrancaId = extRef

        const { data: cobranca } = await supabase
          .from('cobrancas')
          .select('tenant_id')
          .eq('id', cobrancaId)
          .maybeSingle()

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

        const { error } = await supabase
          .from('cobrancas')
          .update({
            status: 'PAGO',
            data_pagamento: dataPagamento,
            id_mp: String(paymentId),
            valor_liquido: valorLiquido,
          })
          .eq('id', cobrancaId)
          .neq('status', 'PAGO')

        if (error) console.error('Erro Supabase:', error)
        else console.log(`Cobrança ${cobrancaId} PAGA! Líquido: ${valorLiquido}`)
      }
    }

    return res.status(200).json({ received: true })
  } catch (err) {
    console.error('Erro Webhook:', err.message)
    return res.status(200).json({ received: true })
  }
}
