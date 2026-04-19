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
    if (method === 'GET') return new Response("OK", { status: 200, headers: CORS })

    // Tenta ler o JSON, mas não trava se estiver vazio (importante para o teste do MP)
    let body = {}
    try {
      body = await req.json()
    } catch (e) {
      console.log('Webhook sem corpo JSON (provavelmente teste de validação)')
      return new Response(JSON.stringify({ received: true, note: "empty body" }), { status: 200 })
    }

    console.log('Webhook MP recebido:', body)

    // O Mercado Pago envia o ID do pagamento no campo resource ou data.id
    const paymentId = body.data?.id || body.resource?.split('/').pop()
    const action = body.action || body.type

    // Só processamos se for uma atualização de pagamento
    if (paymentId && (action === 'payment.updated' || action === 'payment.created' || action === 'payment' || action === 'opened')) {
      
      const MP_TOKEN = Deno.env.get('MP_ACCESS_TOKEN')
      if (!MP_TOKEN) throw new Error('MP_ACCESS_TOKEN não configurado nos Secrets do Supabase')

      // 1. Consulta o status real do pagamento no Mercado Pago
      const mpResp = await fetch(`https://api.mercadopago.com/v1/payments/${paymentId}`, {
        headers: { 'Authorization': `Bearer ${MP_TOKEN}` }
      })

      if (!mpResp.ok) {
        console.error(`Erro ao consultar MP para pagamento ${paymentId}: ${mpResp.status}`)
        return new Response(JSON.stringify({ received: true }), { status: 200 })
      }

      const paymentData = await mpResp.json()

      // 2. Se estiver aprovado, damos baixa no banco
      if (paymentData.status === 'approved') {
        const externalReference = paymentData.external_reference // ID da nossa tabela 'cobrancas'
        
        if (externalReference) {
          const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
          const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
          const supabase = createClient(supabaseUrl, supabaseKey)

          const { error } = await supabase
            .from('cobrancas')
            .update({ 
              status: 'PAGO', 
              data_pagamento: new Date().toISOString(),
              id_mp: String(paymentId)
            })
            .eq('id', externalReference)
            .neq('status', 'PAGO') // Evita processar duas vezes

          if (error) console.error('Erro ao atualizar banco:', error)
          else console.log(`Pagamento ${paymentId} aprovado e baixado para cobrança ${externalReference}`)
        }
      }
    }

    return new Response(JSON.stringify({ received: true }), {
      status: 200,
      headers: { ...CORS, "Content-Type": "application/json" },
    })

  } catch (err) {
    console.error('Erro Webhook:', err.message)
    return new Response(JSON.stringify({ error: err.message }), {
      status: 200,
      headers: { ...CORS, "Content-Type": "application/json" },
    })
  }
})
