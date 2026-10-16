import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { tenant_id, order_ids } = await req.json()

    if (!tenant_id || !order_ids || !Array.isArray(order_ids)) {
      return new Response(
        JSON.stringify({ error: 'Parâmetros obrigatórios: tenant_id, order_ids (array)' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    const { data: config, error: configError } = await supabaseClient
      .from('configuracoes')
      .select('token_melhor_envio, melhor_envio_api_url')
      .eq('tenant_id', tenant_id)
      .single()

    if (configError || !config?.token_melhor_envio) {
      return new Response(
        JSON.stringify({ error: 'Token do Melhor Envio não configurado' }),
        { status: 422, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const apiUrl = config.melhor_envio_api_url || 'https://sandbox.melhorenvio.com.br'
    const token = config.token_melhor_envio

    const chamar = (rota: string) => fetch(`${apiUrl}/api/v2/me/shipment/${rota}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({ orders: order_ids }),
    })

    let resposta = await chamar('print')

    // E-PRT-0002: o pedido está pago mas a etiqueta ainda não foi gerada no
    // Melhor Envio. Gerar é assíncrono, então geramos e tentamos imprimir de novo.
    if (!resposta.ok) {
      const erro = await resposta.json().catch(() => ({}))
      const mensagem = String(erro.message || erro.error || '')

      if (/E-PRT-0002|não é\(são\) valida|not valid/i.test(mensagem)) {
        console.log('🏷️ Etiqueta ainda não gerada, gerando antes de imprimir...')
        const gerar = await chamar('generate')

        if (!gerar.ok) {
          const erroGerar = await gerar.json().catch(() => ({}))
          console.error('❌ Erro ao gerar antes de imprimir:', erroGerar)
          return new Response(
            JSON.stringify({
              error: `A etiqueta do pedido ${order_ids.join(', ')} ainda não está disponível no Melhor Envio. ` +
                     `Confira no painel deles se o pedido foi pago (o checkout usa o saldo da carteira). ` +
                     `Detalhe: ${erroGerar.message || erroGerar.error || mensagem}`,
            }),
            { status: 422, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          )
        }

        resposta = await chamar('print')
      } else {
        return new Response(
          JSON.stringify({ error: mensagem || 'Erro ao imprimir etiqueta' }),
          { status: resposta.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }
    }

    if (!resposta.ok) {
      const erro = await resposta.json().catch(() => ({}))
      return new Response(
        JSON.stringify({
          error: `Não foi possível imprimir a etiqueta do pedido ${order_ids.join(', ')}. ` +
                 `Verifique no Melhor Envio se ele está pago e gerado — pedidos criados no sandbox não abrem em produção. ` +
                 `Detalhe: ${erro.message || erro.error || 'erro desconhecido'}`,
        }),
        { status: 422, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const result = await resposta.json()

    return new Response(
      JSON.stringify(result),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (error) {
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
