// @deno-types="https://esm.sh/@supabase/supabase-js@2/dist/module/index.d.ts"
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

serve(async (req) => {
  // CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    console.log('🚀 Função iniciada')

    const { tenant_id, romaneio_id, valor, dados = {} } = await req.json()

    console.log('📥 Requisição recebida:', { tenant_id, romaneio_id, valor })

    if (!tenant_id || !romaneio_id || !valor) {
      return new Response(
        JSON.stringify({ error: 'Parâmetros obrigatórios: tenant_id, romaneio_id, valor' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Cria cliente Supabase com Service Role Key
    const supabaseUrl = Deno.env.get('SUPABASE_URL')
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')

    console.log('🔑 Env check:', {
      hasUrl: !!supabaseUrl,
      hasKey: !!supabaseKey,
      keyLength: supabaseKey?.length || 0
    })

    const supabaseClient = createClient(
      supabaseUrl!,
      supabaseKey!
    )

    console.log('✅ Cliente Supabase criado')

    // Busca configurações (token MP + margem)
    console.log('🔍 Buscando config para tenant:', tenant_id)

    const { data: config, error: configError } = await supabaseClient
      .from('configuracoes')
      .select('mp_access_token, margem_frete')
      .eq('tenant_id', tenant_id)
      .single()

    console.log('📊 Resultado config:', {
      hasData: !!config,
      hasError: !!configError,
      errorMsg: configError?.message,
      hasToken: !!config?.mp_access_token,
      tokenLength: config?.mp_access_token?.length || 0,
      margem: config?.margem_frete
    })

    if (configError) {
      console.error('❌ Erro ao buscar config:', configError)
      return new Response(
        JSON.stringify({ error: 'Erro ao buscar configurações' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    if (!config?.mp_access_token) {
      console.error('❌ Token MP ausente!')
      return new Response(
        JSON.stringify({ error: 'Token do Mercado Pago não configurado' }),
        { status: 422, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const token = config.mp_access_token
    const margemFrete = config.margem_frete || 10

    console.log('💰 Calculando pagamento:', {
      valorOriginal: valor,
      margem: margemFrete,
      valorFinal: (valor * (1 + margemFrete / 100)).toFixed(2)
    })

    // Calcula valor final com margem
    const valorComMargem = valor * (1 + margemFrete / 100)

    // Cria pagamento PIX no Mercado Pago
    const mpPayload = {
      transaction_amount: Number(valorComMargem.toFixed(2)),
      description: `Pagamento de frete - Romaneio ${dados.numeroRomaneio || romaneio_id}`,
      payment_method_id: 'pix',
      payer: {
        email: dados.email || 'cliente@email.com',
        first_name: dados.nome || 'Cliente',
        last_name: dados.sobrenome || '',
        identification: {
          type: dados.tipoDoc || 'CPF',
          number: dados.documento || '00000000000',
        },
      },
    }

    console.log('📲 Chamando Mercado Pago...', {
      amount: mpPayload.transaction_amount,
      method: mpPayload.payment_method_id
    })

    const mpResponse = await fetch('https://api.mercadopago.com/v1/payments', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify(mpPayload),
    })

    if (!mpResponse.ok) {
      const errorData = await mpResponse.json()
      return new Response(
        JSON.stringify({ error: errorData.message || 'Erro ao criar pagamento PIX' }),
        { status: mpResponse.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const pagamento = await mpResponse.json()

    // Salva no banco
    const expiracao = new Date()
    expiracao.setMinutes(expiracao.getMinutes() + 30)

    const { error: dbError } = await supabaseClient
      .from('pagamentos_frete')
      .insert([{
        romaneio_id,
        valor: Number(valorComMargem.toFixed(2)),
        valor_original: Number(valor),
        margem_aplicada: Number(margemFrete),
        metodo: 'pix',
        status: 'pendente',
        gateway_transaction_id: String(pagamento.id),
        gateway_response: pagamento,
        pix_qr_code: pagamento.point_of_interaction?.transaction_data?.qr_code || null,
        pix_qr_code_base64: pagamento.point_of_interaction?.transaction_data?.qr_code_base64 || null,
        pix_expiracao: expiracao.toISOString(),
      }])

    if (dbError) {
      console.error('Erro ao salvar no banco:', dbError)
      throw dbError
    }

    return new Response(
      JSON.stringify({
        id: pagamento.id,
        qr_code: pagamento.point_of_interaction?.transaction_data?.qr_code,
        qr_code_base64: pagamento.point_of_interaction?.transaction_data?.qr_code_base64,
        expiracao: expiracao,
        ticket_url: pagamento.point_of_interaction?.transaction_data?.ticket_url,
        valor_original: valor,
        valor_cobrado: valorComMargem,
        margem: margemFrete,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (error) {
    console.error('Erro:', error)
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
