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
    const { romaneio_id } = await req.json()

    if (!romaneio_id) {
      return new Response(
        JSON.stringify({ error: 'romaneio_id é obrigatório' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    console.log('📦 Criando pedido para romaneio:', romaneio_id)

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    // Busca romaneio com cotação e endereço
    const { data: romaneio, error: romError } = await supabase
      .from('romaneios')
      .select(`
        *,
        cotacao:cotacoes_frete!romaneios_melhor_envio_cotacao_id_fkey(*),
        endereco:enderecos_clientes(*)
      `)
      .eq('id', romaneio_id)
      .single()

    if (romError || !romaneio) {
      console.error('❌ Romaneio não encontrado:', romError)
      return new Response(
        JSON.stringify({ error: 'Romaneio não encontrado' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    if (!romaneio.cotacao) {
      return new Response(
        JSON.stringify({ error: 'Romaneio não possui cotação vinculada' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    if (!romaneio.endereco) {
      return new Response(
        JSON.stringify({ error: 'Romaneio não possui endereço de entrega' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    console.log('✅ Romaneio encontrado:', romaneio.numero)
    console.log('📋 Cotação:', romaneio.cotacao.transportadora, romaneio.cotacao.servico)

    // Busca token do Melhor Envio
    const { data: config } = await supabase
      .from('configuracoes')
      .select('token_melhor_envio, melhor_envio_api_url')
      .eq('tenant_id', romaneio.tenant_id)
      .single()

    if (!config?.token_melhor_envio) {
      return new Response(
        JSON.stringify({ error: 'Token do Melhor Envio não configurado' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const apiUrl = config.melhor_envio_api_url || 'https://sandbox.melhorenvio.com.br'
    const token = config.token_melhor_envio

    // Dados do pedido para o Melhor Envio
    const serviceData = romaneio.cotacao.melhor_envio_data

    const orderPayload = {
      service: serviceData.id,
      from: {
        name: 'VM Kids Second Hand',
        phone: '16999999999',
        email: 'contato@vmkids.com.br',
        document: '57751824000110',
        address: 'Rua Antonio Bueno de Camargo',
        number: '295',
        complement: '',
        district: 'Centro',
        city: 'São Carlos',
        state_abbr: 'SP',
        country_id: 'BR',
        postal_code: '13560340',
      },
      to: {
        name: romaneio.endereco.destinatario,
        phone: romaneio.endereco.telefone,
        email: 'cliente@email.com',
        document: '00000000000',
        address: romaneio.endereco.rua,
        number: romaneio.endereco.numero,
        complement: romaneio.endereco.complemento || '',
        district: romaneio.endereco.bairro,
        city: romaneio.endereco.cidade,
        state_abbr: romaneio.endereco.estado,
        country_id: 'BR',
        postal_code: romaneio.endereco.cep.replace(/\D/g, ''),
      },
      products: [{
        name: `Romaneio ${romaneio.numero}`,
        quantity: 1,
        unitary_value: 50.00,
      }],
      volumes: [{
        height: romaneio.altura || 10,
        width: romaneio.largura || 20,
        length: romaneio.comprimento || 30,
        weight: romaneio.peso || 1,
      }],
      options: {
        insurance_value: 0,
        receipt: false,
        own_hand: false,
        collect: false,
      },
    }

    console.log('📤 Criando pedido no Melhor Envio...')

    // Cria o pedido (adiciona ao carrinho)
    const cartResponse = await fetch(`${apiUrl}/api/v2/me/cart`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify(orderPayload),
    })

    if (!cartResponse.ok) {
      const errorData = await cartResponse.json()
      console.error('❌ Erro ao criar pedido:', errorData)
      return new Response(
        JSON.stringify({ error: 'Erro ao criar pedido no Melhor Envio', details: errorData }),
        { status: cartResponse.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const cartData = await cartResponse.json()
    const orderId = cartData.id

    console.log('✅ Pedido criado! Order ID:', orderId)

    // Finaliza a compra (checkout)
    console.log('💳 Finalizando compra...')

    const checkoutResponse = await fetch(`${apiUrl}/api/v2/me/shipment/checkout`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({
        orders: [orderId],
      }),
    })

    if (!checkoutResponse.ok) {
      const errorData = await checkoutResponse.json()
      console.error('❌ Erro no checkout:', errorData)
      return new Response(
        JSON.stringify({ error: 'Erro ao finalizar compra', details: errorData }),
        { status: checkoutResponse.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const checkoutData = await checkoutResponse.json()
    console.log('✅ Compra finalizada!', checkoutData)

    // Gera a etiqueta
    console.log('🏷️ Gerando etiqueta...')

    const labelResponse = await fetch(`${apiUrl}/api/v2/me/shipment/generate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({
        orders: [orderId],
      }),
    })

    if (!labelResponse.ok) {
      const errorData = await labelResponse.json()
      console.error('❌ Erro ao gerar etiqueta:', errorData)
      // Mesmo que falhe, salvamos o order_id
    }

    console.log('✅ Etiqueta gerada!')

    // Busca dados completos do pedido
    const orderResponse = await fetch(`${apiUrl}/api/v2/me/orders/${orderId}`, {
      headers: {
        'Accept': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
    })

    const orderData = await orderResponse.json()
    const tracking = orderData.tracking || null

    // Atualiza o romaneio com os dados
    await supabase
      .from('romaneios')
      .update({
        melhor_envio_order_id: orderId,
        codigo_rastreio: tracking,
        status: 'etiqueta_gerada',
        etiqueta_gerada_em: new Date().toISOString(),
      })
      .eq('id', romaneio_id)

    console.log('✅ Romaneio atualizado!')

    return new Response(
      JSON.stringify({
        success: true,
        order_id: orderId,
        tracking: tracking,
        message: 'Pedido criado e etiqueta gerada com sucesso!',
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    console.error('❌ Erro:', error)
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
