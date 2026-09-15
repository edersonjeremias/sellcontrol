import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const notification = await req.json()
    console.log('🔔 Webhook recebido:', notification)

    // Mercado Pago envia notificações de vários tipos
    // Queremos apenas notificações de pagamento
    if (notification.type !== 'payment') {
      console.log('⏭️ Tipo ignorado:', notification.type)
      return new Response(JSON.stringify({ status: 'ignored' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    const paymentId = notification.data?.id
    if (!paymentId) {
      console.log('❌ Payment ID não encontrado')
      return new Response(JSON.stringify({ error: 'Payment ID not found' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    console.log('💳 Processando pagamento:', paymentId)

    // Cria cliente Supabase
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    // Busca o pagamento no banco pelo gateway_transaction_id
    const { data: pagamento, error: pagError } = await supabase
      .from('pagamentos_frete')
      .select('*, romaneios(tenant_id)')
      .eq('gateway_transaction_id', String(paymentId))
      .maybeSingle()

    if (pagError || !pagamento) {
      console.log('❌ Pagamento não encontrado no banco:', paymentId)
      return new Response(JSON.stringify({ error: 'Payment not found in database' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    console.log('✅ Pagamento encontrado:', pagamento.id)

    // Busca detalhes do pagamento no Mercado Pago
    const { data: config } = await supabase
      .from('configuracoes')
      .select('mp_access_token')
      .eq('tenant_id', pagamento.romaneios.tenant_id)
      .single()

    if (!config?.mp_access_token) {
      console.log('❌ Token MP não encontrado')
      return new Response(JSON.stringify({ error: 'MP token not found' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    const mpResponse = await fetch(`https://api.mercadopago.com/v1/payments/${paymentId}`, {
      headers: {
        'Authorization': `Bearer ${config.mp_access_token}`,
      },
    })

    if (!mpResponse.ok) {
      console.log('❌ Erro ao consultar MP:', mpResponse.status)
      return new Response(JSON.stringify({ error: 'MP API error' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    const paymentData = await mpResponse.json()
    console.log('📊 Status do pagamento:', paymentData.status)

    // Se o pagamento foi aprovado
    if (paymentData.status === 'approved') {
      console.log('✅ Pagamento aprovado! Atualizando banco...')

      // Atualiza status do pagamento
      await supabase
        .from('pagamentos_frete')
        .update({
          status: 'aprovado',
          pago_em: new Date().toISOString(),
          gateway_response: paymentData,
        })
        .eq('id', pagamento.id)

      // Atualiza status do romaneio
      await supabase
        .from('romaneios')
        .update({
          status: 'frete_pago',
          frete_pago_em: new Date().toISOString(),
        })
        .eq('id', pagamento.romaneio_id)

      console.log('✅ Status atualizado! Romaneio:', pagamento.romaneio_id)

      return new Response(JSON.stringify({
        status: 'success',
        message: 'Payment processed and shipping label will be generated'
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    // Se foi recusado ou cancelado
    if (paymentData.status === 'rejected' || paymentData.status === 'cancelled') {
      console.log('❌ Pagamento recusado/cancelado')

      await supabase
        .from('pagamentos_frete')
        .update({
          status: 'recusado',
          gateway_response: paymentData,
        })
        .eq('id', pagamento.id)

      return new Response(JSON.stringify({ status: 'rejected' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    // Status pendente ou outro
    console.log('⏳ Pagamento ainda pendente:', paymentData.status)
    return new Response(JSON.stringify({ status: 'pending' }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })

  } catch (error) {
    console.error('❌ Erro:', error)
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
