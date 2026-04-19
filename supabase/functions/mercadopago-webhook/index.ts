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

    // Token padrão do env (fallback)
    let MP_TOKEN = Deno.env.get('MP_ACCESS_TOKEN') ?? ''

    // Consulta o pagamento no MP com token padrão primeiro
    const mpResp = await fetch(`https://api.mercadopago.com/v1/payments/${paymentId}`, {
      headers: { 'Authorization': `Bearer ${MP_TOKEN}` }
    })

    if (!mpResp.ok) {
      console.error(`Erro ao consultar MP: ${mpResp.status}`)
      return new Response(JSON.stringify({ received: true }), { status: 200, headers: CORS })
    }

    const paymentData = await mpResp.json()

    if (paymentData.status === 'approved' && paymentData.external_reference) {
      const cobrancaId = paymentData.external_reference

      // Busca o tenant para usar o token correto da configuração
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
          data_pagamento: new Date().toISOString(),
          id_mp: String(paymentId)
        })
        .eq('id', cobrancaId)
        .neq('status', 'PAGO')

      if (error) console.error('Erro ao atualizar banco:', error)
      else console.log(`Pagamento ${paymentId} aprovado — cobrança ${cobrancaId} marcada como PAGA`)
    }

    return new Response(JSON.stringify({ received: true }), {
      status: 200,
      headers: { ...CORS, "Content-Type": "application/json" },
    })

  } catch (err) {
    console.error('Erro Webhook:', err.message)
    return new Response(JSON.stringify({ received: true }), {
      status: 200,
      headers: { ...CORS, "Content-Type": "application/json" },
    })
  }
})
