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

    // Busca romaneio
    const { data: romaneio, error: romError } = await supabase
      .from('romaneios')
      .select('*')
      .eq('id', romaneio_id)
      .single()

    if (romError || !romaneio) {
      console.error('❌ Romaneio não encontrado:', romError)
      return new Response(
        JSON.stringify({ error: 'Romaneio não encontrado' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    if (!romaneio.melhor_envio_cotacao_id) {
      return new Response(
        JSON.stringify({ error: 'Romaneio não possui cotação vinculada' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    if (!romaneio.endereco_id) {
      return new Response(
        JSON.stringify({ error: 'Romaneio não possui endereço de entrega' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Sem peso/medidas reais a etiqueta sai errada e a transportadora cobra a diferença
    const semMedidas = !(Number(romaneio.peso) > 0 && Number(romaneio.altura) > 0 &&
                         Number(romaneio.largura) > 0 && Number(romaneio.comprimento) > 0)
    if (semMedidas) {
      return new Response(
        JSON.stringify({ error: `Romaneio ${romaneio.numero} está sem peso ou medidas da caixa. Preencha em Editar antes de gerar a etiqueta.` }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Busca cotação. O romaneio pode guardar o UUID da linha de cotacoes_frete
    // ou, em registros mais antigos, o id do serviço no Melhor Envio.
    const cotacaoRef = String(romaneio.melhor_envio_cotacao_id)
    const ehUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(cotacaoRef)
    console.log('🔍 Buscando cotação:', cotacaoRef, ehUuid ? '(uuid)' : '(id de serviço)')

    let cotacao: any = null
    let cotacaoError: any = null

    if (ehUuid) {
      const { data, error } = await supabase
        .from('cotacoes_frete')
        .select('*')
        .eq('id', cotacaoRef)
        .maybeSingle()
      cotacao = data
      cotacaoError = error
    }

    if (!cotacao) {
      const { data: salvas, error } = await supabase
        .from('cotacoes_frete')
        .select('*')
        .eq('romaneio_id', romaneio_id)
        .order('created_at', { ascending: false })

      cotacaoError = cotacaoError || error
      const lista = salvas || []

      cotacao =
        lista.find((c: any) => String(c.melhor_envio_data?.id) === cotacaoRef) ||
        lista.find((c: any) => c.servico === romaneio.servico && c.transportadora === romaneio.transportadora) ||
        null
    }

    if (cotacaoError) {
      console.error('❌ Erro ao buscar cotação:', cotacaoError)
    }

    // Busca endereço
    console.log('🔍 Buscando endereço:', romaneio.endereco_id)
    const { data: endereco, error: enderecoError } = await supabase
      .from('enderecos_clientes')
      .select('*')
      .eq('id', romaneio.endereco_id)
      .single()

    if (enderecoError) {
      console.error('❌ Erro ao buscar endereço:', enderecoError)
    }

    if (!cotacao || !endereco) {
      const falta = !cotacao
        ? 'a cotação do frete não foi encontrada — cote o frete novamente'
        : 'o endereço de entrega não foi encontrado'
      return new Response(
        JSON.stringify({
          error: `Não foi possível gerar a etiqueta: ${falta}.`,
          detalhes: {
            cotacao_encontrada: !!cotacao,
            endereco_encontrado: !!endereco,
            cotacao_error: cotacaoError?.message,
            endereco_error: enderecoError?.message
          }
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // CPF e e-mail do destinatário são obrigatórios no Melhor Envio
    const cpfDestinatario = String(endereco.cpf || '').replace(/\D/g, '')
    if (cpfDestinatario.length !== 11 || !endereco.email) {
      return new Response(
        JSON.stringify({ error: `Endereço de ${endereco.destinatario} está sem CPF ou e-mail. A transportadora exige os dois para emitir a etiqueta.` }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    console.log('✅ Romaneio encontrado:', romaneio.numero)
    console.log('📋 Cotação:', cotacao.transportadora, cotacao.servico)

    // Busca token do Melhor Envio e dados da empresa
    const { data: config } = await supabase
      .from('configuracoes')
      .select(`
        token_melhor_envio,
        melhor_envio_api_url,
        nome_loja,
        cpf_cnpj,
        telefone,
        whatsapp,
        email_contato,
        endereco_rua,
        endereco_numero,
        endereco_complemento,
        endereco_bairro,
        endereco_cidade,
        endereco_estado,
        endereco_cep
      `)
      .eq('tenant_id', romaneio.tenant_id)
      .single()

    if (!config?.token_melhor_envio) {
      return new Response(
        JSON.stringify({ error: 'Token do Melhor Envio não configurado' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    if (!config?.endereco_cep || !config?.endereco_rua) {
      return new Response(
        JSON.stringify({ error: 'Endereço da empresa não está cadastrado. Configure em Master → Empresas.' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const apiUrl = config.melhor_envio_api_url || 'https://sandbox.melhorenvio.com.br'
    const token = config.token_melhor_envio

    // Dados do pedido para o Melhor Envio
    const serviceData = cotacao.melhor_envio_data

    const orderPayload = {
      service: serviceData.id,
      from: {
        name: config.nome_loja || 'Loja',
        phone: (config.telefone || config.whatsapp || '0000000000').replace(/\D/g, ''),
        email: config.email_contato || 'contato@empresa.com',
        document: (config.cpf_cnpj || '00000000000').replace(/\D/g, ''),
        address: config.endereco_rua,
        number: config.endereco_numero || 's/n',
        complement: config.endereco_complemento || '',
        district: config.endereco_bairro,
        city: config.endereco_cidade,
        state_abbr: config.endereco_estado,
        country_id: 'BR',
        postal_code: config.endereco_cep.replace(/\D/g, ''),
      },
      to: {
        name: endereco.destinatario,
        phone: endereco.telefone,
        email: endereco.email || 'cliente@email.com',
        document: String(endereco.cpf || '').replace(/\D/g, ''),
        address: endereco.rua,
        number: endereco.numero,
        complement: endereco.complemento || '',
        district: endereco.bairro,
        city: endereco.cidade,
        state_abbr: endereco.estado,
        country_id: 'BR',
        postal_code: endereco.cep.replace(/\D/g, ''),
      },
      products: [{
        name: romaneio.produto_declaracao || `Romaneio ${romaneio.numero}`,
        quantity: romaneio.produto_quantidade || 1,
        unitary_value: romaneio.produto_valor_declarado || 50.00,
      }],
      volumes: [{
        height: Number(romaneio.altura),
        width: Number(romaneio.largura),
        length: Number(romaneio.comprimento),
        weight: Number(romaneio.peso),
      }],
      options: {
        insurance_value: romaneio.produto_valor_declarado || 1.00,
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

    // Se a geração falhar, o pedido existe mas não há etiqueta para imprimir.
    // Guardamos o order_id e paramos aqui em vez de marcar como gerada.
    if (!labelResponse.ok) {
      const errorData = await labelResponse.json().catch(() => ({}))
      console.error('❌ Erro ao gerar etiqueta:', errorData)

      await supabase
        .from('romaneios')
        .update({ melhor_envio_order_id: orderId })
        .eq('id', romaneio_id)

      return new Response(
        JSON.stringify({
          error: `O pedido ${orderId} foi criado no Melhor Envio, mas a etiqueta não pôde ser gerada. ` +
                 `Confira no painel deles se o pedido foi pago (o checkout usa o saldo da carteira). ` +
                 `Detalhe: ${errorData.message || errorData.error || 'erro desconhecido'}`,
          order_id: orderId,
        }),
        { status: 422, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
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
