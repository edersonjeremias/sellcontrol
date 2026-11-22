// ============================================================================
// LOJA — CHECKOUT: dados da cliente, frete cotado e pagamento
// ============================================================================
// Separada da loja-publica de propósito: aqui se mexe em dinheiro. O valor do
// frete e o total NUNCA vêm do navegador — a cliente manda o id da opção que
// escolheu e o servidor usa o valor que ele mesmo cotou e guardou.
//
// POST { acao, pedido_id, ...payload }
//   acao = pedido | identificar | cotar | pagar
// ============================================================================
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/

// Minutos de vida do pagamento. A reserva das peças acompanha: enquanto o PIX
// estiver de pé, a peça não volta para a vitrine.
const MINUTOS_PAGAMENTO = 30

const ABERTOS = ['carrinho', 'aguardando_pagamento']

/** Valida CPF pelos dígitos verificadores (o Melhor Envio e o MP recusam CPF inválido) */
function cpfValido(valor: string) {
  const cpf = String(valor || '').replace(/\D/g, '')
  if (cpf.length !== 11 || /^(\d)\1{10}$/.test(cpf)) return false

  for (const corte of [9, 10]) {
    let soma = 0
    for (let i = 0; i < corte; i++) soma += Number(cpf[i]) * (corte + 1 - i)
    let digito = (soma * 10) % 11
    if (digito === 10) digito = 0
    if (digito !== Number(cpf[corte])) return false
  }
  return true
}

/** Instante daqui a N minutos escrito no fuso de Brasília, como o MP espera */
function expiraEm(minutos: number) {
  const brt = new Date(Date.now() + minutos * 60_000 - 3 * 60 * 60 * 1000)
  const p = (n: number) => String(n).padStart(2, '0')
  return `${brt.getUTCFullYear()}-${p(brt.getUTCMonth() + 1)}-${p(brt.getUTCDate())}` +
    `T${p(brt.getUTCHours())}:${p(brt.getUTCMinutes())}:${p(brt.getUTCSeconds())}.000-03:00`
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const { acao, pedido_id, ...payload } = await req.json()
    if (!acao || !UUID_RE.test(String(pedido_id || ''))) {
      return json({ error: 'Pedido inválido' }, 400)
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    // O id do pedido é a credencial, como o token do link de frete: quem o tem
    // mexe naquele pedido e em nenhum outro.
    const { data: pedido, error } = await supabase
      .from('loja_pedidos')
      .select('*')
      .eq('id', pedido_id)
      .maybeSingle()

    if (error) {
      console.error('Erro ao buscar o pedido:', error)
      return json({ error: 'Erro ao abrir o pedido' }, 500)
    }
    if (!pedido) return json({ error: 'Pedido não encontrado' }, 404)

    const { data: config } = await supabase
      .from('configuracoes')
      .select('*')
      .eq('tenant_id', pedido.tenant_id)
      .maybeSingle()

    if (!config) return json({ error: 'Loja não encontrada' }, 404)

    switch (acao) {
      case 'pedido':      return await acaoPedido(supabase, pedido, config)
      case 'portal':      return await acaoPortal(supabase, pedido, payload)
      case 'identificar': return await acaoIdentificar(supabase, pedido, payload)
      case 'cotar':       return await acaoCotar(supabase, pedido, config)
      case 'pagar':       return await acaoPagar(supabase, pedido, config, payload)
      default:            return json({ error: 'Ação desconhecida' }, 400)
    }
  } catch (error) {
    console.error('Erro geral:', error)
    return json({ error: (error as Error).message }, 500)
  }
})

// ────────────────────────────────────────────────────────────────────────────
// PEDIDO — tudo que a tela do checkout e a de acompanhamento mostram
// ────────────────────────────────────────────────────────────────────────────
async function acaoPedido(supabase: any, pedido: any, config: any) {
  const { data: itens } = await supabase
    .from('loja_pedido_itens')
    .select('id, produto_id, codigo, produto, modelo, cor, marca, tamanho, imagem, preco, peso_gramas')
    .eq('pedido_id', pedido.id)
    .order('created_at')

  return json({ loja: dadosLoja(config), pedido: paraTela(pedido, itens || []) })
}

const dadosLoja = (config: any) => ({
  nome: config.nome_loja || 'Loja',
  slug: config.slug,
  whatsapp: config.whatsapp || '',
})

function paraTela(pedido: any, itens: any[]) {
  return {
    id: pedido.id,
    codigo: pedido.codigo,
    status: pedido.status,
    itens,
    valor_itens: Number(pedido.valor_itens || 0),
    valor_frete: Number(pedido.valor_frete || 0),
    total: Number(pedido.total || 0),
    peso_gramas: Number(pedido.peso_gramas || 0),
    reserva_expira_em: pedido.reserva_expira_em,
    cliente: {
      nome: pedido.cliente_nome || '',
      whatsapp: pedido.cliente_whatsapp || '',
      cpf: pedido.cliente_cpf || '',
      email: pedido.cliente_email || '',
    },
    endereco: pedido.endereco || null,
    cotacoes: pedido.frete_cotacoes || [],
    frete: pedido.frete_escolhido || null,
    forma_pagamento: pedido.forma_pagamento || null,
    // Como ela acompanha o pedido sozinha depois de pagar
    acesso_portal: pedido.acesso_portal === true,
    identificador: pedido.cliente_instagram || '',
    pix: pedido.pix_qr_code
      ? {
          qr_code: pedido.pix_qr_code,
          qr_code_base64: pedido.pix_qr_code_base64,
          expiracao: pedido.pix_expiracao,
        }
      : null,
    pago_em: pedido.pago_em,
  }
}

/** Pedido que ainda pode ser mexido: pago ou cancelado não volta para o checkout */
function emAberto(pedido: any) {
  if (!ABERTOS.includes(pedido.status)) return false
  if (pedido.reserva_expira_em && new Date(pedido.reserva_expira_em) <= new Date()) return false
  return true
}

// ────────────────────────────────────────────────────────────────────────────
// PORTAL — a cliente que já compra entrou com a conta dela
// ────────────────────────────────────────────────────────────────────────────
// O navegador manda o token da sessão do portal, não o @: quem diz de quem é
// a conta é o Supabase, validando o token. Aceitar um @ vindo da tela deixaria
// qualquer pessoa se dizer outra cliente e ver o endereço dela.
async function acaoPortal(supabase: any, pedido: any, payload: any) {
  const cliente = await clienteDoPortal(supabase, payload.portal_token)
  if (!cliente) return json({ error: 'Sua sessão expirou. Entre de novo.' }, 401)

  const { data: enderecos } = await supabase
    .from('enderecos_clientes')
    .select('*')
    .eq('tenant_id', pedido.tenant_id)
    .eq('cliente_instagram', cliente.instagram)
    .order('padrao', { ascending: false })

  // O cadastro da loja costuma estar mais completo que o do portal (CPF,
  // e-mail), então ele entra primeiro e o portal preenche o que faltar
  const { data: naLoja } = await supabase
    .from('clientes')
    .select('*')
    .eq('tenant_id', pedido.tenant_id)
    .ilike('instagram', cliente.instagram)
    .maybeSingle()

  const preferido = (...valores: any[]) =>
    valores.map(v => String(v || '').trim()).find(Boolean) || ''

  return json({
    instagram: cliente.instagram,
    cliente: {
      nome: preferido(naLoja?.nome_completo, cliente.nome_completo),
      whatsapp: preferido(naLoja?.whatsapp, cliente.celular).replace(/\D/g, ''),
      cpf: preferido(naLoja?.cpf, cliente.cpf).replace(/\D/g, ''),
      email: preferido(naLoja?.email),
    },
    enderecos: (enderecos || []).map((e: any) => ({
      id: e.id,
      apelido: e.apelido,
      cep: String(e.cep || '').replace(/\D/g, ''),
      rua: e.rua,
      numero: e.numero,
      complemento: e.complemento || '',
      bairro: e.bairro,
      cidade: e.cidade,
      estado: e.estado,
    })),
  })
}

/** Dono do token, pelo cadastro do portal. Token inválido devolve null. */
async function clienteDoPortal(supabase: any, token: any) {
  const jwt = String(token || '')
  if (jwt.length < 20) return null

  const { data, error } = await supabase.auth.getUser(jwt)
  if (error || !data?.user?.id) return null

  const { data: perfil } = await supabase
    .from('portal_clientes')
    .select('user_id, instagram, nome_completo, cpf, celular, bloqueado')
    .eq('user_id', data.user.id)
    .maybeSingle()

  if (!perfil || perfil.bloqueado) return null
  return perfil
}

// ────────────────────────────────────────────────────────────────────────────
// IDENTIFICAR — quem compra e para onde vai
// ────────────────────────────────────────────────────────────────────────────
async function acaoIdentificar(supabase: any, pedido: any, payload: any) {
  if (!emAberto(pedido)) return json({ error: 'A reserva das peças expirou. Monte a sacola de novo.' }, 409)

  const c = payload.cliente || {}
  const e = payload.endereco || {}

  const nome = String(c.nome || '').trim()
  const whatsapp = String(c.whatsapp || '').replace(/\D/g, '')
  const cpf = String(c.cpf || '').replace(/\D/g, '')
  const email = String(c.email || '').trim().toLowerCase()

  if (nome.length < 3) return json({ error: 'Escreva seu nome completo' }, 400)
  if (whatsapp.length < 10 || whatsapp.length > 11) return json({ error: 'WhatsApp com DDD, só números' }, 400)
  // CPF e e-mail não são burocracia nossa: o Melhor Envio não emite etiqueta sem eles
  if (!cpfValido(cpf)) return json({ error: 'CPF inválido. Confira os números.' }, 400)
  if (!EMAIL_RE.test(email)) return json({ error: 'Informe um e-mail válido' }, 400)

  const endereco = {
    cep: String(e.cep || '').replace(/\D/g, ''),
    rua: String(e.rua || '').trim(),
    numero: String(e.numero || '').trim(),
    complemento: String(e.complemento || '').trim(),
    bairro: String(e.bairro || '').trim(),
    cidade: String(e.cidade || '').trim(),
    estado: String(e.estado || '').trim().toUpperCase().slice(0, 2),
  }

  const faltando = ['cep', 'rua', 'numero', 'bairro', 'cidade', 'estado']
    .filter(campo => !(endereco as any)[campo])
  if (faltando.length) return json({ error: 'Complete o endereço de entrega' }, 400)
  if (endereco.cep.length !== 8) return json({ error: 'CEP inválido' }, 400)

  // Identificador da cliente no sistema, em ordem de confiança:
  //   1. entrou com a conta do portal — é o @ dela, confirmado pelo token;
  //   2. o WhatsApp informado já está no cadastro — é a cliente de sempre
  //      comprando pela loja, e a virada confirma isso de novo;
  //   3. cliente nova: o WhatsApp vira o identificador, com prefixo para não
  //      colidir com um @ de verdade e para mostrar na Produção de onde veio.
  const doPortal = await clienteDoPortal(supabase, payload.portal_token)

  const { data: jaCadastrada } = await supabase
    .rpc('loja_cliente_por_whatsapp', { p_tenant_id: pedido.tenant_id, p_whatsapp: whatsapp })

  const identificador = doPortal?.instagram || jaCadastrada || `loja.${whatsapp}`

  // Trocar de endereço invalida a cotação: o frete era para outro CEP
  const mudouCep = String(pedido.endereco?.cep || '') !== endereco.cep

  const { error } = await supabase
    .from('loja_pedidos')
    .update({
      cliente_nome: nome,
      cliente_whatsapp: whatsapp,
      cliente_cpf: cpf,
      cliente_email: email,
      cliente_instagram: identificador,
      cliente_user_id: doPortal?.user_id || null,
      endereco,
      ...(mudouCep ? { frete_cotacoes: null, frete_escolhido: null, valor_frete: 0, total: 0 } : {}),
    })
    .eq('id', pedido.id)

  if (error) {
    console.error('Erro ao salvar os dados da cliente:', error)
    return json({ error: 'Não foi possível salvar seus dados' }, 500)
  }

  return json({ ok: true, cotacao_perdida: mudouCep })
}

// ────────────────────────────────────────────────────────────────────────────
// COTAR — frete de verdade no Melhor Envio
// ────────────────────────────────────────────────────────────────────────────
async function acaoCotar(supabase: any, pedido: any, config: any) {
  if (!emAberto(pedido)) return json({ error: 'A reserva das peças expirou. Monte a sacola de novo.' }, 409)

  const endereco = pedido.endereco
  if (!endereco?.cep) return json({ error: 'Informe o endereço antes de calcular o frete' }, 400)

  const { data: itens } = await supabase
    .from('loja_pedido_itens')
    .select('peso_gramas')
    .eq('pedido_id', pedido.id)

  if (!itens?.length) return json({ error: 'Sua sacola está vazia' }, 409)

  const pesoGramas = itens.reduce((s: number, i: any) => s + Number(i.peso_gramas || 0), 0)
  const caixa = escolherCaixa(config.loja_caixas || [], pesoGramas, itens.length)

  if (!caixa) {
    console.error('Tenant sem caixa cadastrada:', pedido.tenant_id)
    return json({ error: 'A loja ainda não configurou as caixas de envio. Fale com a loja.' }, 422)
  }

  if (!config.token_melhor_envio) {
    return json({ error: 'A loja ainda não configurou o frete. Fale com a loja.' }, 422)
  }
  if (!config.endereco_cep) {
    return json({ error: 'A loja ainda não configurou o endereço de origem. Fale com a loja.' }, 422)
  }

  const apiUrl = config.melhor_envio_api_url || 'https://sandbox.melhorenvio.com.br'
  const habilitadas: string[] = config.transportadoras_habilitadas || ['Correios']
  const bloqueados: string[] = config.servicos_bloqueados || []
  const margem = Number(config.margem_frete ?? 15)

  const corpo = {
    from: {
      postal_code: String(config.endereco_cep).replace(/\D/g, ''),
      address: config.endereco_rua,
      number: config.endereco_numero || 's/n',
      district: config.endereco_bairro,
      city: config.endereco_cidade,
      state_abbr: config.endereco_estado,
    },
    to: {
      postal_code: endereco.cep,
      address: endereco.rua,
      number: endereco.numero,
      district: endereco.bairro,
      city: endereco.cidade,
      state_abbr: endereco.estado,
    },
    package: {
      height: Number(caixa.altura),
      width: Number(caixa.largura),
      length: Number(caixa.comprimento),
      // O Melhor Envio quer o peso em quilos
      weight: Math.max(0.1, pesoGramas / 1000),
    },
  }

  const resp = await fetch(`${apiUrl}/api/v2/me/shipment/calculate`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      'Authorization': `Bearer ${config.token_melhor_envio}`,
    },
    body: JSON.stringify(corpo),
  })

  if (!resp.ok) {
    const erro = await resp.json().catch(() => ({}))
    console.error('Erro Melhor Envio:', erro)
    return json({ error: 'Não foi possível calcular o frete agora. Tente de novo em instantes.' }, 502)
  }

  const todas = await resp.json()

  const doTenant = (todas || []).filter((c: any) => {
    const transportadora = c.company?.name || c.name || ''
    const completo = `${transportadora} ${c.name || ''}`.toLowerCase()
    if (bloqueados.some(b => String(b).trim() && completo.includes(String(b).trim().toLowerCase()))) return false
    return habilitadas.some(h => transportadora.toLowerCase().includes(String(h).toLowerCase()))
  })

  const validas = doTenant.filter((c: any) => !c.error)

  if (!validas.length) {
    // O Melhor Envio recusa serviço a serviço (peso, dimensão, área de
    // entrega). Devolvemos o motivo dele, não um "sem transportadora" genérico.
    const motivos = [...new Set(
      doTenant.map((c: any) => `${c.company?.name || c.name}: ${c.error}`)
        .filter((m: string) => !m.endsWith('undefined'))
    )]
    console.log('Nenhuma cotação válida', { pacote: corpo.package, destino: corpo.to.postal_code, motivos })
    return json({
      error: motivos.length
        ? `A transportadora não aceitou este envio: ${motivos.join(' | ')}`
        : 'Nenhuma transportadora entrega nesse endereço.',
    }, 422)
  }

  // Guardamos a cotação com a margem já aplicada: é esse o valor que a cliente
  // vê e paga, e é contra esta lista que a escolha dela é conferida.
  const cotacoes = validas
    .map((c: any) => ({
      id: String(c.id),
      transportadora: c.company?.name || c.name,
      servico: c.name,
      prazo: c.delivery_time || c.delivery_range?.max || 0,
      valor: Number((Number(c.price || c.custom_price || c.final_price || 0) * (1 + margem / 100)).toFixed(2)),
      valor_base: Number(c.price || c.custom_price || c.final_price || 0),
    }))
    .sort((a: any, b: any) => a.valor - b.valor)

  const { error } = await supabase
    .from('loja_pedidos')
    .update({ frete_cotacoes: cotacoes, caixa, peso_gramas: pesoGramas })
    .eq('id', pedido.id)

  if (error) console.error('Erro ao guardar as cotações:', error)

  return json({ cotacoes, caixa, peso_gramas: pesoGramas })
}

/**
 * A caixa sai do peso total e da contagem de peças, a maior das duas
 * exigências: dez camisetas leves não cabem na caixa pequena, mesmo pesando
 * pouco. A lista vem ordenada da menor para a maior, e a última (sem limite)
 * atende de lá para cima.
 */
function escolherCaixa(caixas: any[], pesoGramas: number, quantidade: number) {
  if (!caixas.length) return null

  const cabe = caixas.find((c: any) => {
    const pesoOk = c.ate_gramas === null || c.ate_gramas === undefined || pesoGramas <= Number(c.ate_gramas)
    const pecasOk = c.max_pecas === null || c.max_pecas === undefined || quantidade <= Number(c.max_pecas)
    return pesoOk && pecasOk
  })

  return cabe || caixas[caixas.length - 1]
}

// ────────────────────────────────────────────────────────────────────────────
// PAGAR — PIX na própria página ou cartão no Mercado Pago
// ────────────────────────────────────────────────────────────────────────────
async function acaoPagar(supabase: any, pedido: any, config: any, payload: any) {
  if (!emAberto(pedido)) return json({ error: 'A reserva das peças expirou. Monte a sacola de novo.' }, 409)

  const forma = payload.forma === 'cartao' ? 'cartao' : 'pix'

  const cotacoes: any[] = pedido.frete_cotacoes || []
  const escolhida = cotacoes.find((c: any) => String(c.id) === String(payload.cotacao_id))
  if (!escolhida) return json({ error: 'Escolha uma opção de frete. Se demorou, calcule de novo.' }, 409)

  if (!pedido.cliente_cpf || !pedido.endereco?.cep) {
    return json({ error: 'Complete seus dados antes de pagar' }, 400)
  }

  const { data: itens } = await supabase
    .from('loja_pedido_itens')
    .select('preco, produto, modelo, cor, codigo')
    .eq('pedido_id', pedido.id)

  if (!itens?.length) return json({ error: 'Sua sacola está vazia' }, 409)

  // O total é recalculado aqui, sempre: o navegador manda só a escolha
  const valorItens = itens.reduce((s: number, i: any) => s + Number(i.preco || 0), 0)
  const valorFrete = Number(escolhida.valor)
  const total = Number((valorItens + valorFrete).toFixed(2))
  if (!(total > 0)) return json({ error: 'Valor do pedido inválido' }, 422)

  const token = String(config.mp_access_token || '').trim()
  if (!token) return json({ error: 'A loja ainda não configurou o pagamento. Fale com a loja.' }, 422)

  const expiracao = new Date(Date.now() + MINUTOS_PAGAMENTO * 60_000).toISOString()
  const referencia = `LOJA:${pedido.id}`
  const supabaseUrl = Deno.env.get('SUPABASE_URL')!

  const base = {
    frete_escolhido: escolhida,
    valor_itens: valorItens,
    valor_frete: valorFrete,
    total,
    forma_pagamento: forma,
    status: 'aguardando_pagamento',
    // A reserva passa a valer o tempo do pagamento: a peça não pode voltar à
    // vitrine com um PIX de pé.
    reserva_expira_em: expiracao,
  }

  const pagador = {
    email: pedido.cliente_email,
    first_name: String(pedido.cliente_nome || '').split(/\s+/)[0] || 'Cliente',
    last_name: String(pedido.cliente_nome || '').split(/\s+/).slice(1).join(' ') || undefined,
    identification: { type: 'CPF', number: pedido.cliente_cpf },
  }

  if (forma === 'pix') {
    // PIX anterior ainda válido e do mesmo valor: devolve o mesmo QR Code em
    // vez de encher a conta do MP de pagamentos pendentes
    const aindaVale =
      pedido.pix_qr_code &&
      pedido.pix_expiracao &&
      new Date(pedido.pix_expiracao) > new Date() &&
      Number(pedido.total) === total &&
      pedido.forma_pagamento === 'pix'

    if (aindaVale) {
      await supabase.from('loja_pedidos').update(base).eq('id', pedido.id)
      return json({
        forma: 'pix',
        pix: {
          qr_code: pedido.pix_qr_code,
          qr_code_base64: pedido.pix_qr_code_base64,
          expiracao: pedido.pix_expiracao,
        },
        total,
      })
    }

    // QR antigo com outro valor (frete trocado) pagaria o preço errado
    if (pedido.mp_payment_id && pedido.forma_pagamento === 'pix') {
      try {
        await fetch(`https://api.mercadopago.com/v1/payments/${pedido.mp_payment_id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ status: 'cancelled' }),
        })
      } catch (e) {
        console.error('Não foi possível cancelar o PIX anterior:', e)
      }
    }

    const mpResp = await fetch('https://api.mercadopago.com/v1/payments', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
        'X-Idempotency-Key': crypto.randomUUID(),
      },
      body: JSON.stringify({
        transaction_amount: total,
        description: `Pedido ${pedido.codigo} — ${config.nome_loja || 'Loja'}`,
        payment_method_id: 'pix',
        external_reference: referencia,
        notification_url: `${supabaseUrl}/functions/v1/mercadopago-webhook`,
        date_of_expiration: expiraEm(MINUTOS_PAGAMENTO),
        payer: pagador,
      }),
    })

    const pagamento = await mpResp.json().catch(() => ({}))
    const dados = pagamento?.point_of_interaction?.transaction_data

    if (!mpResp.ok || !dados?.qr_code) {
      console.error('Erro MP ao criar PIX:', mpResp.status, JSON.stringify(pagamento).slice(0, 500))
      return json({ error: 'Não foi possível gerar o PIX agora. Tente de novo em instantes.' }, 502)
    }

    const { error } = await supabase
      .from('loja_pedidos')
      .update({
        ...base,
        mp_payment_id: String(pagamento.id),
        pix_qr_code: dados.qr_code,
        pix_qr_code_base64: dados.qr_code_base64 || null,
        pix_expiracao: pagamento.date_of_expiration
          ? new Date(pagamento.date_of_expiration).toISOString()
          : expiracao,
      })
      .eq('id', pedido.id)

    if (error) {
      console.error('Erro ao salvar o PIX no pedido:', error)
      return json({ error: 'Erro ao gravar o pagamento' }, 500)
    }

    return json({
      forma: 'pix',
      pix: {
        qr_code: dados.qr_code,
        qr_code_base64: dados.qr_code_base64 || null,
        expiracao,
      },
      total,
    })
  }

  // ── Cartão: Checkout Pro ──────────────────────────────────────────────────
  // A cliente sai do site e volta pela back_url. Por isso a página de
  // acompanhamento do pedido existe: é para onde ela volta, e é lá que ela vê
  // a confirmação chegar.
  const voltaPara = `${siteBase()}/loja/${config.slug}/pedido/${pedido.id}`

  const mpResp = await fetch('https://api.mercadopago.com/checkout/preferences', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({
      items: [
        ...itens.map((i: any) => ({
          title: [i.codigo, i.produto, i.modelo, i.cor].filter(Boolean).join(' ').slice(0, 250) || 'Peça',
          quantity: 1,
          currency_id: 'BRL',
          unit_price: Number(Number(i.preco).toFixed(2)),
        })),
        {
          title: `Frete — ${escolhida.transportadora} ${escolhida.servico}`.slice(0, 250),
          quantity: 1,
          currency_id: 'BRL',
          unit_price: valorFrete,
        },
      ],
      payer: {
        name: pedido.cliente_nome,
        email: pedido.cliente_email,
        identification: { type: 'CPF', number: pedido.cliente_cpf },
      },
      external_reference: referencia,
      notification_url: `${supabaseUrl}/functions/v1/mercadopago-webhook`,
      back_urls: { success: voltaPara, failure: voltaPara, pending: voltaPara },
      auto_return: 'approved',
      expires: true,
      expiration_date_to: expiraEm(MINUTOS_PAGAMENTO),
    }),
  })

  const preferencia = await mpResp.json().catch(() => ({}))

  if (!mpResp.ok || !preferencia?.init_point) {
    console.error('Erro MP ao criar preferência:', mpResp.status, JSON.stringify(preferencia).slice(0, 500))
    return json({ error: 'Não foi possível abrir o pagamento no cartão. Tente de novo.' }, 502)
  }

  const { error } = await supabase
    .from('loja_pedidos')
    .update({ ...base, mp_preference_id: String(preferencia.id) })
    .eq('id', pedido.id)

  if (error) {
    console.error('Erro ao salvar a preferência no pedido:', error)
    return json({ error: 'Erro ao gravar o pagamento' }, 500)
  }

  return json({ forma: 'cartao', link: preferencia.init_point, total })
}

/**
 * Endereço do site para onde o Mercado Pago devolve a cliente.
 *
 * Vem de SITE_URL (secret da função). Sem ele, o domínio de produção: a
 * back_url errada joga a cliente num endereço que não existe depois de ela já
 * ter pago, que é o pior momento possível para um link quebrado.
 */
function siteBase() {
  const configurado = (Deno.env.get('SITE_URL') || '').trim().replace(/\/+$/, '')
  return (configurado || 'https://sellcontrol.app').replace('://www.', '://')
}
