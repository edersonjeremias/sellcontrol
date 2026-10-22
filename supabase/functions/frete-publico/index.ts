// ============================================================================
// FRETE PÚBLICO — cliente cota e paga o frete pelo link do WhatsApp
// ============================================================================
// A página /frete/:token não tem login, então ela NÃO lê as tabelas direto
// (o RLS de romaneios é só para authenticated). Tudo passa por aqui: o token
// identifica o romaneio e o service role faz o resto.
//
// POST { acao, token, ...payload }
//   acao = dados | salvar_endereco | cotar | pagar | status
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

const SEM_MEDIDAS =
  'Este pedido ainda está sem o peso e as medidas da caixa, então não dá para calcular o frete. ' +
  'Entre em contato com a equipe da loja que a gente resolve rapidinho.'

/**
 * A balança da loja mostra gramas e é comum digitar 1168 em vez de 1,168.
 * Nenhum serviço dos Correios aceita acima de 30 kg, então um valor maior
 * que isso só pode estar em gramas.
 */
function pesoEmKg(peso: any) {
  const n = Number(peso)
  if (!n || n <= 0) return 0
  return n > 30 ? n / 1000 : n
}

/** Romaneio só pode ser cotado com peso e as três dimensões preenchidas */
function temMedidas(romaneio: any) {
  return Boolean(
    Number(romaneio.peso) > 0 &&
    Number(romaneio.altura) > 0 &&
    Number(romaneio.largura) > 0 &&
    Number(romaneio.comprimento) > 0
  )
}

/** Valida CPF pelos dígitos verificadores (o Melhor Envio recusa CPF inválido) */
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

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const { acao, token, ...payload } = await req.json()

    if (!acao || !token) return json({ error: 'Parâmetros obrigatórios: acao, token' }, 400)

    const chave = String(token)
    const ehUuid = UUID_RE.test(chave)

    // Código curto: 10 caracteres hexadecimais (/f/<codigo>)
    if (!ehUuid && !/^[0-9a-f]{6,32}$/i.test(chave)) {
      return json({ error: 'Link inválido' }, 404)
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    // ── Valida o token ───────────────────────────────────────────────────────
    const { data: romaneio, error: romError } = await supabase
      .from('romaneios')
      .select('*')
      .eq(ehUuid ? 'link_token' : 'link_codigo', chave)
      .maybeSingle()

    if (romError) {
      console.error('Erro ao buscar romaneio:', romError)
      return json({ error: 'Erro ao carregar o pedido' }, 500)
    }
    if (!romaneio) return json({ error: 'Link inválido ou expirado' }, 404)

    const instagram = String(romaneio.cliente_instagram || '').replace('@', '')

    switch (acao) {
      case 'dados':           return await acaoDados(supabase, romaneio, instagram)
      case 'salvar_endereco': return await acaoSalvarEndereco(supabase, romaneio, instagram, payload)
      case 'cotar':           return await acaoCotar(supabase, romaneio, instagram, payload)
      case 'pagar':           return await acaoPagar(supabase, romaneio, payload)
      case 'status':          return await acaoStatus(supabase, romaneio)
      default:                return json({ error: 'Ação desconhecida' }, 400)
    }
  } catch (error) {
    console.error('Erro geral:', error)
    return json({ error: (error as Error).message }, 500)
  }
})

// ────────────────────────────────────────────────────────────────────────────
// DADOS — tudo que a página precisa para montar a tela
// ────────────────────────────────────────────────────────────────────────────
async function acaoDados(supabase: any, romaneio: any, instagram: string) {
  // O código de rastreio só existe depois que a transportadora registra o
  // objeto: tentamos buscar agora para o cliente não ficar sem resposta.
  if (romaneio.melhor_envio_order_id && !romaneio.codigo_rastreio &&
      ['etiqueta_gerada', 'despachado', 'em_transito'].includes(romaneio.status)) {
    try {
      await fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/sincronizar-rastreio`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`,
        },
        body: JSON.stringify({ tenant_id: romaneio.tenant_id, romaneio_id: romaneio.id }),
      })

      const { data: atualizado } = await supabase
        .from('romaneios')
        .select('codigo_rastreio')
        .eq('id', romaneio.id)
        .maybeSingle()

      if (atualizado?.codigo_rastreio) romaneio.codigo_rastreio = atualizado.codigo_rastreio
    } catch (err) {
      console.error('Falha ao sincronizar rastreio:', err)
    }
  }

  const { data: config } = await supabase
    .from('configuracoes')
    .select('nome_loja, margem_frete')
    .eq('tenant_id', romaneio.tenant_id)
    .maybeSingle()

  const numeroRomaneio = parseInt(String(romaneio.numero).replace(/\D/g, ''))

  const { data: itens } = await supabase
    .from('vendas')
    .select('id, codigo, produto, modelo, cor, marca, tamanho, preco, data_live')
    .eq('tenant_id', romaneio.tenant_id)
    .eq('numero_pedido', numeroRomaneio)
    .order('codigo')

  // Cadastro do cliente: completa telefone, CPF e e-mail que o endereço não tem
  const cadastro = await buscarCadastro(supabase, romaneio.tenant_id, instagram)

  const { data: enderecos } = await supabase
    .from('enderecos_clientes')
    .select('*')
    .eq('tenant_id', romaneio.tenant_id)
    .eq('cliente_instagram', instagram)
    .order('padrao', { ascending: false })

  const pagamento = await buscarPagamento(supabase, romaneio.id)
  const margem = Number(config?.margem_frete ?? 15)

  // Cotações já salvas (cliente voltou ao link sem ter escolhido ainda)
  const { data: cotacoes } = await supabase
    .from('cotacoes_frete')
    .select('*')
    .eq('romaneio_id', romaneio.id)
    .order('valor', { ascending: true })

  return json({
    loja: config?.nome_loja || 'Loja',
    margem_frete: margem,
    medidas_ok: temMedidas(romaneio),
    romaneio: {
      numero: romaneio.numero,
      link_codigo: romaneio.link_codigo,
      status: romaneio.status,
      cliente_instagram: instagram,
      transportadora: romaneio.transportadora,
      servico: romaneio.servico,
      prazo_entrega: romaneio.prazo_entrega,
      valor_frete: romaneio.valor_frete,
      endereco_id: romaneio.endereco_id,
      codigo_rastreio: romaneio.codigo_rastreio,
      frete_pago_em: romaneio.frete_pago_em,
    },
    itens: itens || [],
    cliente: {
      nome: cadastro?.nome || '',
      telefone: cadastro?.telefone || '',
      cpf: cadastro?.cpf || '',
      email: cadastro?.email || '',
    },
    enderecos: enderecos || [],
    cotacoes: (cotacoes || []).map((c: any) => comMargem(c, margem)),
    pagamento,
  })
}

// ────────────────────────────────────────────────────────────────────────────
// SALVAR ENDEREÇO — cria um novo ou atualiza o que o cliente editou
// ────────────────────────────────────────────────────────────────────────────
async function acaoSalvarEndereco(supabase: any, romaneio: any, instagram: string, payload: any) {
  const e = payload.endereco || {}
  const obrigatorios = ['destinatario', 'telefone', 'cpf', 'email', 'cep', 'rua', 'numero', 'bairro', 'cidade', 'estado']
  const faltando = obrigatorios.filter(c => !String(e[c] || '').trim())
  if (faltando.length) return json({ error: `Preencha: ${faltando.join(', ')}` }, 400)

  // CPF e e-mail são exigidos pelo Melhor Envio para emitir a etiqueta
  if (!cpfValido(e.cpf)) return json({ error: 'CPF inválido. Confira os números.' }, 400)
  if (!EMAIL_RE.test(String(e.email).trim())) return json({ error: 'E-mail inválido.' }, 400)

  const registro = {
    tenant_id: romaneio.tenant_id,
    cliente_instagram: instagram,
    apelido: String(e.apelido || 'Entrega').trim(),
    destinatario: String(e.destinatario).trim(),
    telefone: String(e.telefone).replace(/\D/g, ''),
    cpf: String(e.cpf).replace(/\D/g, ''),
    email: String(e.email).trim().toLowerCase(),
    cep: String(e.cep).replace(/\D/g, ''),
    rua: String(e.rua).trim(),
    numero: String(e.numero).trim(),
    complemento: String(e.complemento || '').trim() || null,
    bairro: String(e.bairro).trim(),
    cidade: String(e.cidade).trim(),
    estado: String(e.estado).trim().toUpperCase().slice(0, 2),
  }

  let enderecoId = payload.endereco_id || null

  if (enderecoId) {
    // Só deixa editar endereço que é do próprio cliente
    const { data: dono } = await supabase
      .from('enderecos_clientes')
      .select('id')
      .eq('id', enderecoId)
      .eq('tenant_id', romaneio.tenant_id)
      .eq('cliente_instagram', instagram)
      .maybeSingle()

    if (!dono) return json({ error: 'Endereço não encontrado' }, 404)

    const { error } = await supabase
      .from('enderecos_clientes')
      .update(registro)
      .eq('id', enderecoId)

    if (error) {
      console.error('Erro ao atualizar endereço:', error)
      return json({ error: `Erro ao salvar o endereço: ${error.message}` }, 500)
    }
  } else {
    const { data: criado, error } = await supabase
      .from('enderecos_clientes')
      .insert([registro])
      .select('id')
      .single()

    if (error) {
      console.error('Erro ao criar endereço:', error)
      return json({ error: `Erro ao salvar o endereço: ${error.message}` }, 500)
    }
    enderecoId = criado.id
  }

  await supabase.from('romaneios').update({ endereco_id: enderecoId }).eq('id', romaneio.id)

  // Aproveita para completar o cadastro do cliente, sem sobrescrever o que a loja já tem
  const { data: cliente } = await supabase
    .from('clientes')
    .select('id, cpf, email')
    .eq('tenant_id', romaneio.tenant_id)
    .ilike('instagram', romaneio.cliente_instagram)
    .maybeSingle()

  if (cliente) {
    const completar: Record<string, string> = {}
    if (!String(cliente.cpf || '').trim()) completar.cpf = registro.cpf
    if (!String(cliente.email || '').trim()) completar.email = registro.email
    if (Object.keys(completar).length) {
      await supabase.from('clientes').update(completar).eq('id', cliente.id)
    }
  }

  const { data: enderecos } = await supabase
    .from('enderecos_clientes')
    .select('*')
    .eq('tenant_id', romaneio.tenant_id)
    .eq('cliente_instagram', instagram)
    .order('padrao', { ascending: false })

  return json({ endereco_id: enderecoId, enderecos: enderecos || [] })
}

// ────────────────────────────────────────────────────────────────────────────
// COTAR — chama o Melhor Envio e devolve as opções já com a margem da loja
// ────────────────────────────────────────────────────────────────────────────
async function acaoCotar(supabase: any, romaneio: any, instagram: string, payload: any) {
  if (['frete_pago', 'etiqueta_gerada', 'despachado'].includes(romaneio.status)) {
    return json({ error: 'O frete deste pedido já foi pago' }, 409)
  }

  // Sem peso/medidas reais a cotação sairia errada — melhor parar aqui
  if (!temMedidas(romaneio)) return json({ error: SEM_MEDIDAS, sem_medidas: true }, 422)

  const enderecoId = payload.endereco_id || romaneio.endereco_id
  if (!enderecoId) return json({ error: 'Informe o endereço de entrega' }, 400)

  const { data: endereco } = await supabase
    .from('enderecos_clientes')
    .select('*')
    .eq('id', enderecoId)
    .eq('tenant_id', romaneio.tenant_id)
    .eq('cliente_instagram', instagram)
    .maybeSingle()

  if (!endereco) return json({ error: 'Endereço não encontrado' }, 404)

  // Endereço antigo, cadastrado antes de o CPF/e-mail virarem obrigatórios
  if (!cpfValido(endereco.cpf) || !EMAIL_RE.test(String(endereco.email || ''))) {
    return json({ error: 'Complete o CPF e o e-mail do endereço para calcular o frete.', dados_incompletos: true }, 428)
  }

  const { data: config } = await supabase
    .from('configuracoes')
    .select('token_melhor_envio, melhor_envio_api_url, transportadoras_habilitadas, servicos_bloqueados, margem_frete, endereco_cep, endereco_rua, endereco_numero, endereco_bairro, endereco_cidade, endereco_estado')
    .eq('tenant_id', romaneio.tenant_id)
    .maybeSingle()

  if (!config?.token_melhor_envio) {
    return json({ error: 'A loja ainda não configurou o frete. Fale com a loja.' }, 422)
  }
  if (!config?.endereco_cep) {
    return json({ error: 'A loja ainda não configurou o endereço de origem. Fale com a loja.' }, 422)
  }

  const apiUrl = config.melhor_envio_api_url || 'https://sandbox.melhorenvio.com.br'
  const habilitadas: string[] = config.transportadoras_habilitadas || ['Correios']
  const margem = Number(config.margem_frete ?? 15)

  const body = {
    from: {
      postal_code: String(config.endereco_cep).replace(/\D/g, ''),
      address: config.endereco_rua,
      number: config.endereco_numero || 's/n',
      district: config.endereco_bairro,
      city: config.endereco_cidade,
      state_abbr: config.endereco_estado,
    },
    to: {
      postal_code: String(endereco.cep).replace(/\D/g, ''),
      address: endereco.rua,
      number: endereco.numero,
      district: endereco.bairro,
      city: endereco.cidade,
      state_abbr: endereco.estado,
    },
    package: {
      height: Number(romaneio.altura),
      width: Number(romaneio.largura),
      length: Number(romaneio.comprimento),
      weight: pesoEmKg(romaneio.peso),
    },
  }

  const resp = await fetch(`${apiUrl}/api/v2/me/shipment/calculate`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      'Authorization': `Bearer ${config.token_melhor_envio}`,
    },
    body: JSON.stringify(body),
  })

  if (!resp.ok) {
    const erro = await resp.json().catch(() => ({}))
    console.error('Erro Melhor Envio:', erro)
    return json({ error: 'Não foi possível calcular o frete agora. Tente de novo em instantes.' }, 502)
  }

  const todas = await resp.json()

  // Modalidades que a loja não usa (ex.: Jadlog Centralizado, que exige
  // levar o volume até uma unidade centralizadora)
  const bloqueados: string[] = config.servicos_bloqueados || []

  const doTenant = (todas || []).filter((c: any) => {
    const transportadora = c.company?.name || c.name || ''
    const servico = c.name || ''
    const completo = `${transportadora} ${servico}`.toLowerCase()

    if (bloqueados.some(b => String(b).trim() && completo.includes(String(b).trim().toLowerCase()))) {
      return false
    }

    return habilitadas.some(h => transportadora.toLowerCase().includes(String(h).toLowerCase()))
  })

  const validas = doTenant.filter((c: any) => !c.error)

  if (!validas.length) {
    // O Melhor Envio recusa serviço a serviço (peso, dimensão, área de entrega).
    // Devolvemos o motivo dele em vez de um "nenhuma transportadora" genérico.
    const motivos = [...new Set(
      doTenant
        .map((c: any) => `${c.company?.name || c.name}: ${c.error}`)
        .filter((m: string) => !m.endsWith('undefined'))
    )]

    console.log('❌ Nenhuma cotação válida', {
      pacote: body.package,
      destino: body.to.postal_code,
      recebidas: (todas || []).length,
      doTenant: doTenant.length,
      motivos,
    })

    return json({
      error: motivos.length
        ? `A transportadora não aceitou este envio: ${motivos.join(' | ')}`
        : 'Nenhuma transportadora atende esse endereço.',
      motivos,
      pacote: body.package,
    }, 422)
  }

  // Troca as cotações antigas pelas novas
  await supabase.from('cotacoes_frete').delete().eq('romaneio_id', romaneio.id)

  const registros = validas.map((c: any) => ({
    romaneio_id: romaneio.id,
    transportadora: c.company?.name || c.name,
    servico: c.name,
    valor: parseFloat(c.price || c.custom_price || c.final_price || 0),
    prazo: c.delivery_time || c.delivery_range?.max || 0,
    melhor_envio_data: c,
  }))

  const { data: salvas, error: saveError } = await supabase
    .from('cotacoes_frete')
    .insert(registros)
    .select()

  if (saveError) {
    console.error('Erro ao salvar cotações:', saveError)
    return json({ error: 'Erro ao salvar as opções de frete' }, 500)
  }

  await supabase.from('romaneios').update({ endereco_id: enderecoId }).eq('id', romaneio.id)

  const ordenadas = [...(salvas || [])].sort((a: any, b: any) => a.valor - b.valor)
  return json({ cotacoes: ordenadas.map((c: any) => comMargem(c, margem)) })
}

// ────────────────────────────────────────────────────────────────────────────
// PAGAR — grava a escolha e gera o PIX (reusa a função já existente)
// ────────────────────────────────────────────────────────────────────────────
async function acaoPagar(supabase: any, romaneio: any, payload: any) {
  if (['frete_pago', 'etiqueta_gerada', 'despachado'].includes(romaneio.status)) {
    return json({ error: 'O frete deste pedido já foi pago' }, 409)
  }
  if (!temMedidas(romaneio)) return json({ error: SEM_MEDIDAS, sem_medidas: true }, 422)
  if (!payload.cotacao_id) return json({ error: 'Escolha uma opção de frete' }, 400)

  const { data: cotacao } = await supabase
    .from('cotacoes_frete')
    .select('*')
    .eq('id', payload.cotacao_id)
    .eq('romaneio_id', romaneio.id)
    .maybeSingle()

  if (!cotacao) return json({ error: 'Opção de frete não encontrada. Calcule o frete de novo.' }, 404)

  await supabase
    .from('romaneios')
    .update({
      transportadora: cotacao.transportadora,
      servico: cotacao.servico,
      valor_frete: cotacao.valor,
      prazo_entrega: cotacao.prazo,
      status: 'frete_cotado',
      // UUID da linha de cotacoes_frete: é o que a geração da etiqueta busca
      melhor_envio_cotacao_id: cotacao.id,
    })
    .eq('id', romaneio.id)

  // Descarta PIX pendente anterior para não ficar dois QR Codes válidos
  await supabase
    .from('pagamentos_frete')
    .delete()
    .eq('romaneio_id', romaneio.id)
    .eq('status', 'pendente')

  // Dados do pagador: o que o próprio cliente informou no endereço
  const { data: endereco } = await supabase
    .from('enderecos_clientes')
    .select('destinatario, email, cpf')
    .eq('id', romaneio.endereco_id)
    .maybeSingle()

  const resp = await fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/criar-pagamento-pix-frete`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`,
    },
    body: JSON.stringify({
      tenant_id: romaneio.tenant_id,
      romaneio_id: romaneio.id,
      valor: Number(cotacao.valor),
      dados: {
        numeroRomaneio: romaneio.numero,
        email: endereco?.email || 'cliente@email.com',
        nome: endereco?.destinatario || romaneio.cliente_instagram,
        documento: String(endereco?.cpf || '').replace(/\D/g, '') || undefined,
      },
    }),
  })

  const pix = await resp.json()
  if (!resp.ok) {
    console.error('Erro ao criar PIX:', pix)
    return json({ error: pix.error || 'Erro ao gerar o PIX' }, 502)
  }

  return json({
    pagamento: {
      status: 'pendente',
      qr_code: pix.qr_code,
      qr_code_base64: pix.qr_code_base64,
      expiracao: pix.expiracao,
      ticket_url: pix.ticket_url,
      valor_cobrado: pix.valor_cobrado,
    },
  })
}

// ────────────────────────────────────────────────────────────────────────────
// STATUS — polling enquanto o cliente paga
// ────────────────────────────────────────────────────────────────────────────
async function acaoStatus(supabase: any, romaneio: any) {
  const pagamento = await buscarPagamento(supabase, romaneio.id)
  return json({
    status: romaneio.status,
    pago: ['frete_pago', 'etiqueta_gerada', 'despachado'].includes(romaneio.status),
    pagamento_status: pagamento?.status || null,
  })
}

// ── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Cadastro do cliente pelo instagram. A base tem registros duplicados e com
 * variações de @ e maiúsculas, então buscamos uma lista e ficamos com o
 * registro mais completo em vez de exigir linha única.
 */
async function buscarCadastro(supabase: any, tenantId: string, instagram: string) {
  // ilike como filtro próprio: no `or` um instagram com ponto (fulano.rc)
  // quebraria a sintaxe campo.operador.valor do PostgREST.
  // select('*') de propósito: a tabela clientes variou de schema entre
  // instalações e pedir uma coluna ausente derrubaria a consulta inteira.
  const buscar = (valor: string) => supabase
    .from('clientes')
    .select('*')
    .eq('tenant_id', tenantId)
    .ilike('instagram', valor)
    .limit(10)

  let { data, error } = await buscar(instagram)
  if (!error && !(data || []).length) ({ data, error } = await buscar(`@${instagram}`))

  if (error) {
    console.error('Erro ao buscar cadastro do cliente:', error)
    return null
  }

  // Os dados pessoais ficam em colunas próprias ou no jsonb legado `detalhes`
  const normalizar = (c: any) => {
    const d = c.detalhes && typeof c.detalhes === 'object' ? c.detalhes : {}
    return {
      nome: c.nome_completo || d.nomeCompleto || c.nome || '',
      telefone: c.whatsapp || c.telefone || d.whatsapp || '',
      cpf: c.cpf || c.cpf_cnpj || d.cpf || '',
      email: c.email || d.email || '',
    }
  }

  const candidatos = (data || []).map(normalizar)
  const preenchidos = (c: any) =>
    [c.nome, c.telefone, c.cpf, c.email].filter(v => String(v || '').trim()).length

  return candidatos.sort((a, b) => preenchidos(b) - preenchidos(a))[0] || null
}

async function buscarPagamento(supabase: any, romaneioId: string) {
  const { data } = await supabase
    .from('pagamentos_frete')
    .select('status, pix_qr_code, pix_qr_code_base64, pix_expiracao, valor')
    .eq('romaneio_id', romaneioId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (!data) return null
  return {
    status: data.status,
    qr_code: data.pix_qr_code,
    qr_code_base64: data.pix_qr_code_base64,
    expiracao: data.pix_expiracao,
    valor_cobrado: Number(data.valor),
  }
}

function comMargem(cotacao: any, margem: number) {
  return {
    id: cotacao.id,
    transportadora: cotacao.transportadora,
    servico: cotacao.servico,
    prazo: cotacao.prazo,
    valor: Number((Number(cotacao.valor) * (1 + margem / 100)).toFixed(2)),
  }
}
