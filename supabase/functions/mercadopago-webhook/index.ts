import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
}

serve(async (req) => {
  try {
    const { method } = req
    if (method === 'OPTIONS') return new Response("OK", { status: 200, headers: CORS })
    if (method === 'GET') return new Response(JSON.stringify({ received: true }), { status: 200, headers: { ...CORS, "Content-Type": "application/json" } })

    let body: Record<string, any> = {}
    try {
      body = await req.json()
    } catch {
      return new Response(JSON.stringify({ received: true }), { status: 200, headers: CORS })
    }

    console.log('Webhook MP recebido:', body)

    const paymentId = body.data?.id || body.resource?.split('/').pop()
    const action = body.action || body.type

    const isPaymentEvent = ['payment.updated', 'payment.created', 'payment'].includes(action)
    if (!paymentId || !isPaymentEvent) {
      return new Response(JSON.stringify({ received: true }), { status: 200, headers: CORS })
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    const supabase = createClient(supabaseUrl, supabaseKey)

    // Tenta obter o token: primeiro o env var, depois todos os tokens do banco
    async function buscarPayment(tokenList: string[]): Promise<any | null> {
      for (const token of tokenList) {
        if (!token?.trim()) continue
        const r = await fetch(`https://api.mercadopago.com/v1/payments/${paymentId}`, {
          headers: { 'Authorization': `Bearer ${token.trim()}` }
        })
        if (r.ok) return await r.json()
      }
      return null
    }

    const envToken = Deno.env.get('MP_ACCESS_TOKEN') ?? ''
    let paymentData: any = null

    // Tenta env var primeiro (rápido)
    if (envToken) {
      const r = await fetch(`https://api.mercadopago.com/v1/payments/${paymentId}`, {
        headers: { 'Authorization': `Bearer ${envToken}` }
      })
      if (r.ok) paymentData = await r.json()
    }

    // Fallback: tenta todos os tokens armazenados no banco
    if (!paymentData) {
      const { data: configs } = await supabase
        .from('configuracoes')
        .select('mp_access_token')
        .not('mp_access_token', 'is', null)

      const tokens = (configs || []).map((c: any) => c.mp_access_token).filter(Boolean)
      paymentData = await buscarPayment(tokens)
    }

    if (!paymentData) {
      console.error('Não foi possível consultar o pagamento com nenhum token disponível')
      return new Response(JSON.stringify({ received: true }), { status: 200, headers: CORS })
    }

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

        if (error) console.error('Erro ao atualizar banco:', error)
        else console.log(`Pagamento ${paymentId} aprovado — cobrança ${cobrancaId} marcada como PAGA`)
      }
    }

    return new Response(JSON.stringify({ received: true }), {
      status: 200,
      headers: { ...CORS, "Content-Type": "application/json" },
    })

  } catch (err) {
    console.error('Erro Webhook:', (err as Error).message)
    return new Response(JSON.stringify({ received: true }), {
      status: 200,
      headers: { ...CORS, "Content-Type": "application/json" },
    })
  }
})
