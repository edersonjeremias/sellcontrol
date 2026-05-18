import { createClient } from '@supabase/supabase-js'

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')

  if (req.method === 'OPTIONS') return res.status(200).json({ ok: true })
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  try {
    const { cobrancaId, paymentId, externalReference } = req.body || {}
    if (!cobrancaId) return res.status(400).json({ error: 'cobrancaId é obrigatório' })

    const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)

    const { data: cob } = await supabase
      .from('cobrancas')
      .select('tenant_id, status, dados_divisao')
      .eq('id', cobrancaId)
      .single()

    if (!cob) return res.status(404).json({ error: 'Cobrança não encontrada' })

    const { data: cfg } = await supabase
      .from('configuracoes')
      .select('mp_access_token')
      .eq('tenant_id', cob.tenant_id)
      .maybeSingle()

    const mpToken = cfg?.mp_access_token?.trim() || process.env.MP_ACCESS_TOKEN || ''
    if (!mpToken) return res.status(422).json({ error: 'Token MP não configurado' })

    // Caminho 1: temos o paymentId (vindo do back_url do MP)
    if (paymentId) {
      const mpResp = await fetch(`https://api.mercadopago.com/v1/payments/${paymentId}`, {
        headers: { Authorization: `Bearer ${mpToken}` },
      })
      if (!mpResp.ok) {
        const txt = await mpResp.text()
        console.error('Erro MP ao consultar payment:', mpResp.status, txt.slice(0, 200))
        return res.status(200).json({ ok: false, status: 'mp_error' })
      }
      const payment = await mpResp.json()
      if (payment.status !== 'approved') return res.status(200).json({ ok: true, status: payment.status })

      const extRef = externalReference || payment.external_reference || ''
      // Segurança: external_reference deve pertencer a esta cobrança
      if (!extRef.startsWith(cobrancaId)) {
        return res.status(400).json({ error: 'Referência do pagamento não corresponde à cobrança' })
      }

      const splitMatch = String(extRef).match(/^(.+)-(P[12])$/)
      if (splitMatch) {
        await supabase.rpc('process_split_payment', {
          p_cobranca_id:    cobrancaId,
          p_parte:          splitMatch[2],
          p_payment_id:     String(paymentId),
          p_valor_liquido:  payment.transaction_details?.net_received_amount ?? 0,
          p_data_pagamento: payment.date_approved
            ? new Date(payment.date_approved).toISOString()
            : new Date().toISOString(),
        })
      } else {
        await supabase
          .from('cobrancas')
          .update({
            status:          'PAGO',
            data_pagamento:  payment.date_approved
              ? new Date(payment.date_approved).toISOString()
              : new Date().toISOString(),
            id_mp:           String(paymentId),
            valor_liquido:   payment.transaction_details?.net_received_amount ?? 0,
          })
          .eq('id', cobrancaId)
          .neq('status', 'PAGO')
      }
      return res.status(200).json({ ok: true, status: 'approved' })
    }

    // Caminho 2: sem paymentId — busca pagamentos aprovados por external_reference
    const div = cob.dados_divisao
    if (!div) return res.status(200).json({ ok: true, message: 'sem divisão' })

    let updated = false
    for (const parte of ['P1', 'P2']) {
      const statusKey = parte === 'P1' ? 'status_p1' : 'status_p2'
      if (div[statusKey] === 'PAGO') continue

      const extRef = `${cobrancaId}-${parte}`
      const searchResp = await fetch(
        `https://api.mercadopago.com/v1/payments/search?external_reference=${encodeURIComponent(extRef)}&status=approved`,
        { headers: { Authorization: `Bearer ${mpToken}` } },
      )
      if (!searchResp.ok) {
        console.error('Erro MP search:', searchResp.status, extRef)
        continue
      }
      const searchData = await searchResp.json()
      const payment = searchData.results?.[0]
      if (!payment || payment.status !== 'approved') continue

      const { error: rpcErr } = await supabase.rpc('process_split_payment', {
        p_cobranca_id:    cobrancaId,
        p_parte:          parte,
        p_payment_id:     String(payment.id),
        p_valor_liquido:  payment.transaction_details?.net_received_amount ?? 0,
        p_data_pagamento: payment.date_approved
          ? new Date(payment.date_approved).toISOString()
          : new Date().toISOString(),
      })
      if (rpcErr) console.error('Erro RPC split:', rpcErr)
      else updated = true
    }
    return res.status(200).json({ ok: true, updated })

  } catch (err) {
    console.error('Erro confirmar-pagamento:', err.message)
    return res.status(500).json({ error: err.message })
  }
}
