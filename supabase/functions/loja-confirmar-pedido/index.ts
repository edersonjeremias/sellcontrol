// ============================================================================
// LOJA — VIRADA: pedido pago vira venda, romaneio e peça na Produção
// ============================================================================
// Chamada por dois caminhos, de propósito:
//   - o webhook do Mercado Pago, que é o normal;
//   - a tela de acompanhamento do pedido, enquanto a cliente espera — se o
//     webhook atrasar ou se perder, a confirmação não fica dependendo dele.
//
// Por isso tudo aqui é idempotente: rodar duas vezes não cria dois romaneios.
//
// POST { pedido_id, payment_id? }
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

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const { pedido_id, payment_id } = await req.json()
    if (!UUID_RE.test(String(pedido_id || ''))) return json({ error: 'Pedido inválido' }, 400)

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    const { data: pedido } = await supabase
      .from('loja_pedidos')
      .select('*')
      .eq('id', pedido_id)
      .maybeSingle()

    if (!pedido) return json({ error: 'Pedido não encontrado' }, 404)
    if (pedido.virada_em) return json({ ok: true, ja_confirmado: true, numero_pedido: pedido.numero_pedido })

    const { data: config } = await supabase
      .from('configuracoes')
      .select('mp_access_token, slug')
      .eq('tenant_id', pedido.tenant_id)
      .maybeSingle()

    // ── O pagamento está mesmo aprovado? ────────────────────────────────────
    // Nunca confiamos em quem chamou: quem diz que o dinheiro entrou é o
    // Mercado Pago, consultado com o token da loja.
    const idPagamento = String(payment_id || pedido.mp_payment_id || '')
    const aprovado = await pagamentoAprovado(
      config?.mp_access_token,
      idPagamento,
      pedido.id,
      Number(pedido.total || 0),
    )

    if (!aprovado.ok) {
      return json({ ok: false, pago: false, motivo: aprovado.motivo }, 200)
    }

    // ── Trava: duas chamadas ao mesmo tempo não criam dois romaneios ────────
    // Quem conseguir marcar virada_em segue; a outra chamada só observa.
    const { data: travado } = await supabase
      .from('loja_pedidos')
      .update({
        status: 'pago',
        pago_em: pedido.pago_em || aprovado.pagoEm,
        mp_payment_id: aprovado.paymentId || pedido.mp_payment_id,
        virada_em: new Date().toISOString(),
        virada_erro: null,
      })
      .eq('id', pedido.id)
      .is('virada_em', null)
      .select('id')
      .maybeSingle()

    if (!travado) {
      const { data: atual } = await supabase
        .from('loja_pedidos')
        .select('numero_pedido')
        .eq('id', pedido.id)
        .maybeSingle()
      return json({ ok: true, ja_confirmado: true, numero_pedido: atual?.numero_pedido })
    }

    try {
      const numero = await virar(supabase, pedido, aprovado.pagoEm)
      return json({ ok: true, pago: true, numero_pedido: numero })
    } catch (erro) {
      // Devolve a trava para a próxima chamada poder tentar de novo, e deixa o
      // motivo gravado: pedido pago que não entrou na Produção é o que a loja
      // mais precisa enxergar.
      console.error('Falha na virada do pedido', pedido.id, erro)
      await supabase
        .from('loja_pedidos')
        .update({ virada_em: null, virada_erro: String((erro as Error).message).slice(0, 500) })
        .eq('id', pedido.id)

      return json({ ok: false, pago: true, error: 'Pagamento confirmado, mas o pedido não entrou na produção.' }, 500)
    }
  } catch (error) {
    console.error('Erro geral:', error)
    return json({ error: (error as Error).message }, 500)
  }
})

// ────────────────────────────────────────────────────────────────────────────
// O pagamento está aprovado?
// ────────────────────────────────────────────────────────────────────────────
async function pagamentoAprovado(
  token: string | undefined,
  paymentId: string,
  pedidoId: string,
  totalDevido: number,
) {
  // Pagar menos que o pedido não confirma o pedido. O link da loja é montado
  // aqui no servidor, então o valor certo é o do banco; esta conferência é a
  // rede de segurança — e um centavo de folga cobre arredondamento.
  const cobre = (p: any) =>
    !(totalDevido > 0) || Number(p?.transaction_amount ?? 0) >= totalDevido - 0.011
  const chave = String(token || '').trim()
  if (!chave) return { ok: false, motivo: 'Loja sem token do Mercado Pago' }

  // Com o id do pagamento em mãos, consulta direta
  if (paymentId) {
    const r = await fetch(`https://api.mercadopago.com/v1/payments/${paymentId}`, {
      headers: { Authorization: `Bearer ${chave}` },
    })
    if (r.ok) {
      const p = await r.json()
      if (p.status === 'approved' && !cobre(p)) {
        console.error(`Pedido ${pedidoId}: pago ${p.transaction_amount}, devido ${totalDevido}`)
        return { ok: false, motivo: 'Valor pago menor que o do pedido' }
      }
      if (p.status === 'approved') {
        return {
          ok: true,
          paymentId: String(p.id),
          pagoEm: p.date_approved ? new Date(p.date_approved).toISOString() : new Date().toISOString(),
        }
      }
      return { ok: false, motivo: `Pagamento ${p.status}` }
    }
  }

  // Cartão: o id do pagamento só nasce quando a cliente paga, e a preferência
  // não o conhece. Procuramos pelo external_reference, que é nosso.
  const busca = await fetch(
    `https://api.mercadopago.com/v1/payments/search?external_reference=LOJA:${pedidoId}&sort=date_created&criteria=desc`,
    { headers: { Authorization: `Bearer ${chave}` } }
  )

  if (!busca.ok) return { ok: false, motivo: 'Não foi possível consultar o pagamento' }

  const resultado = await busca.json()
  const aprovado = (resultado?.results || []).find((p: any) => p.status === 'approved' && cobre(p))
  if (!aprovado) return { ok: false, motivo: 'Pagamento ainda não aprovado' }

  return {
    ok: true,
    paymentId: String(aprovado.id),
    pagoEm: aprovado.date_approved ? new Date(aprovado.date_approved).toISOString() : new Date().toISOString(),
  }
}

// ────────────────────────────────────────────────────────────────────────────
// A virada
// ────────────────────────────────────────────────────────────────────────────
async function virar(supabase: any, pedido: any, pagoEm: string) {
  const tenantId = pedido.tenant_id

  // Quem é esta cliente no sistema.
  //
  // A loja pede WhatsApp, não @ do Instagram — mas quem já compra nas lives
  // tem cadastro com o mesmo número. Sem procurar por ele, a mesma pessoa
  // ganharia um cadastro novo a cada compra, e as peças da loja cairiam num
  // segundo romaneio, com um segundo frete.
  const { data: jaCadastrada } = await supabase
    .rpc('loja_cliente_por_whatsapp', {
      p_tenant_id: tenantId,
      p_whatsapp: pedido.cliente_whatsapp,
    })

  const identificador = String(
    jaCadastrada || pedido.cliente_instagram || `loja.${pedido.cliente_whatsapp}`
  )

  if (identificador !== pedido.cliente_instagram) {
    await supabase
      .from('loja_pedidos')
      .update({ cliente_instagram: identificador })
      .eq('id', pedido.id)
  }

  const { data: itens, error: itensErro } = await supabase
    .from('loja_pedido_itens')
    .select('*')
    .eq('pedido_id', pedido.id)

  if (itensErro) throw itensErro
  if (!itens?.length) throw new Error('Pedido pago sem itens')

  // ── 1. Cliente ──────────────────────────────────────────────────────────
  // A loja não pede @ do Instagram, então o identificador vem do WhatsApp. É
  // por ele que a Produção, o romaneio e o portal acham esta cliente.
  const { data: clienteExistente } = await supabase
    .from('clientes')
    .select('*')
    .eq('tenant_id', tenantId)
    .ilike('instagram', identificador)
    .maybeSingle()

  const dadosCliente = {
    nome_completo: pedido.cliente_nome,
    whatsapp: pedido.cliente_whatsapp,
    cpf: pedido.cliente_cpf,
    email: pedido.cliente_email,
  }

  if (clienteExistente) {
    // Cliente de live que comprou na loja: completa o que falta no cadastro,
    // sem passar por cima do que a loja já tinha anotado dela
    const faltando: Record<string, string> = {}
    for (const [campo, valor] of Object.entries(dadosCliente)) {
      if (!String(valor || '').trim()) continue
      if (!String(clienteExistente[campo] || '').trim()) faltando[campo] = String(valor)
    }
    if (Object.keys(faltando).length) {
      await supabase.from('clientes').update(faltando).eq('id', clienteExistente.id)
    }
  } else {
    const { error } = await supabase
      .from('clientes')
      .insert([{ tenant_id: tenantId, instagram: identificador, ...dadosCliente }])
    if (error) console.error('Não foi possível cadastrar a cliente da loja:', error)
  }

  // ── 2. Guardar na sacolinha: sem romaneio, sem frete ────────────────────
  // A peça já está paga e fica esperando o fechamento junto com as da live. É
  // lá que ela entra num romaneio e num frete só — o motivo de a cliente ter
  // pedido para guardar.
  if (pedido.destino === 'sacolinha') {
    const vendas = itens.map((i: any) => linhaDeVenda(i, tenantId, identificador, null))

    const { data: criadas, error: vendasErro } = await supabase
      .from('vendas')
      .insert(vendas)
      .select('id')

    if (vendasErro) throw vendasErro

    for (let i = 0; i < itens.length; i++) {
      const venda = criadas?.[i]
      if (venda) await supabase.from('loja_pedido_itens').update({ venda_id: venda.id }).eq('id', itens[i].id)
    }

    const acessoSacolinha = await garantirAcessoPortal(supabase, identificador, pedido)
    await supabase
      .from('loja_pedidos')
      .update({ acesso_portal: acessoSacolinha })
      .eq('id', pedido.id)

    return null
  }

  // ── 2. Endereço ─────────────────────────────────────────────────────────
  const e = pedido.endereco || {}
  const { data: enderecoCriado, error: endErro } = await supabase
    .from('enderecos_clientes')
    .insert([{
      tenant_id: tenantId,
      cliente_instagram: identificador,
      apelido: 'Entrega',
      destinatario: pedido.cliente_nome,
      telefone: pedido.cliente_whatsapp,
      cpf: pedido.cliente_cpf,
      email: pedido.cliente_email,
      cep: e.cep,
      rua: e.rua,
      numero: e.numero,
      complemento: e.complemento || null,
      bairro: e.bairro,
      cidade: e.cidade,
      estado: e.estado,
      padrao: true,
    }])
    .select('id')
    .single()

  if (endErro) throw endErro

  // ── 3. Romaneio, com o frete já pago ────────────────────────────────────
  const { data: numeroRomaneio, error: numErro } = await supabase
    .rpc('gerar_numero_romaneio', { p_tenant_id: tenantId })
  if (numErro) throw numErro

  const frete = pedido.frete_escolhido || {}
  const caixa = pedido.caixa || {}
  const valorPecas = itens.reduce((s: number, i: any) => s + Number(i.preco || 0), 0)

  const { data: romaneio, error: romErro } = await supabase
    .from('romaneios')
    .insert([{
      tenant_id: tenantId,
      numero: numeroRomaneio,
      cliente_instagram: identificador,
      endereco_id: enderecoCriado.id,
      peso: Number(pedido.peso_gramas || 0) / 1000,
      altura: Number(caixa.altura) || null,
      largura: Number(caixa.largura) || null,
      comprimento: Number(caixa.comprimento) || null,
      produto_declaracao: 'LOTE DE ROUPAS USADAS',
      produto_quantidade: itens.length,
      produto_valor_declarado: valorPecas,
      transportadora: frete.transportadora || null,
      servico: frete.servico || null,
      // O custo da etiqueta, sem a margem da loja: é o que o financeiro do
      // frete compara com o extrato. O que a cliente pagou fica no pedido.
      valor_frete: Number(frete.valor_base ?? frete.valor ?? 0),
      prazo_entrega: Number(frete.prazo || 0),
      status: 'frete_pago',
      pronto_em: pagoEm,
      frete_pago_em: pagoEm,
    }])
    .select('id, numero')
    .single()

  if (romErro) throw romErro

  // A geração da etiqueta procura a linha escolhida em cotacoes_frete: sem
  // ela, este romaneio não conseguiria comprar a etiqueta como os outros.
  const { data: cotacao, error: cotErro } = await supabase
    .from('cotacoes_frete')
    .insert([{
      romaneio_id: romaneio.id,
      transportadora: frete.transportadora || '',
      servico: frete.servico || '',
      valor: Number(frete.valor_base ?? frete.valor ?? 0),
      prazo: Number(frete.prazo || 0),
      // A compra da etiqueta manda melhor_envio_data.id como `service` para o
      // Melhor Envio, que espera número — o nosso id vem como texto porque a
      // tela compara opção escolhida por string.
      melhor_envio_data: { ...frete, id: Number(frete.id) || frete.id },
    }])
    .select('id')
    .single()

  if (cotErro) console.error('Não foi possível gravar a cotação do romaneio:', cotErro)
  else await supabase.from('romaneios').update({ melhor_envio_cotacao_id: cotacao.id }).eq('id', romaneio.id)

  // O frete entrou junto com as peças, num pagamento só. Sem registrar aqui,
  // a tela de Frete e Pagamentos mostra este romaneio como "baixa manual, não
  // entrou pelo Mercado Pago" — e ele entrou.
  const { error: pagErro } = await supabase
    .from('pagamentos_frete')
    .insert([{
      romaneio_id: romaneio.id,
      valor: Number(pedido.valor_frete || 0),
      valor_original: Number(frete.valor_base ?? frete.valor ?? 0),
      metodo: pedido.forma_pagamento === 'cartao' ? 'cartao' : 'pix',
      status: 'aprovado',
      gateway_transaction_id: pedido.mp_payment_id ? String(pedido.mp_payment_id) : null,
      pago_em: pagoEm,
      observacao: `Pago junto com as peças no pedido ${pedido.codigo} da loja`,
    }])

  if (pagErro) console.error('Não foi possível registrar o pagamento do frete:', pagErro)

  // ── 4. As peças viram venda e entram na Produção ────────────────────────
  const numeroPedido = parseInt(String(romaneio.numero).replace(/\D/g, ''), 10) || null

  const vendas = itens.map((i: any) => linhaDeVenda(i, tenantId, identificador, numeroPedido))

  const { data: criadas, error: vendasErro } = await supabase
    .from('vendas')
    .insert(vendas)
    .select('id, codigo')

  if (vendasErro) throw vendasErro

  // ── 5. Amarra o item à venda ────────────────────────────────────────────
  // É o que diz que a peça saiu do catálogo pelo estoque, e não mais pela
  // reserva (a baixa de estoque é feita pelo trigger trg_vendas_estoque).
  for (let i = 0; i < itens.length; i++) {
    const venda = criadas?.[i]
    if (!venda) continue
    await supabase.from('loja_pedido_itens').update({ venda_id: venda.id }).eq('id', itens[i].id)
  }

  // ── 6. Acesso ao portal ─────────────────────────────────────────────────
  const acesso = await garantirAcessoPortal(supabase, identificador, pedido)

  await supabase
    .from('loja_pedidos')
    .update({ numero_pedido: numeroPedido, romaneio_id: romaneio.id, acesso_portal: acesso })
    .eq('id', pedido.id)

  return numeroPedido
}

/**
 * A peça da loja como linha de venda.
 *
 * `origem: 'loja'` é o que diz à Produção de onde ela veio e o que mantém a
 * peça fora da busca de cobrança: ela já foi paga no pedido, e cobrá-la de
 * novo no fechamento seria cobrar duas vezes pela mesma peça.
 *
 * `numeroPedido` nulo é a peça guardada na sacolinha: ela ganha romaneio no
 * fechamento, junto com as da live.
 */
function linhaDeVenda(item: any, tenantId: string, identificador: string, numeroPedido: number | null) {
  return {
    tenant_id: tenantId,
    codigo: item.codigo || '',
    produto: item.produto || '',
    modelo: item.modelo || '',
    cor: item.cor || '',
    marca: item.marca || '',
    tamanho: item.tamanho || '',
    preco: Number(item.preco || 0),
    cliente_nome: identificador,
    data_live: new Date().toISOString().slice(0, 10),
    live_nome: 'LOJA',
    status: 'Vendido',
    etapa: 'fechada',
    numero_pedido: numeroPedido,
    origem: 'loja',
  }
}

/**
 * Acesso da cliente ao portal, criado na primeira compra.
 *
 * Mesma regra do botão que a loja já usa no cadastro de clientes
 * (api/portal-cliente.js): o login é o @ (ou o identificador da loja) e a
 * senha é o número do WhatsApp, só dígitos. É o que permite mandar o acesso
 * junto com a confirmação sem inventar senha nova nem guardá-la em lugar
 * nenhum.
 *
 * Falhar aqui não derruba a virada: a venda já está feita, e acesso ao portal
 * se resolve depois.
 */
async function garantirAcessoPortal(supabase: any, instagram: string, pedido: any) {
  try {
    const insta = instagram.replace(/^@/, '').toLowerCase()
    // Mesmo domínio de api/portal-cliente.js e src/lib/emailInterno.js:
    // é identificador interno da conta, e trocá-lo invalida login já criado.
    const dominioPortal = Deno.env.get('PORTAL_EMAIL_DOMINIO') ?? 'portal.vmkids.com.br'
    // A conta da cliente no portal é por empresa: um pedaço do tenant entra
    // no endereço, senão a @maria de duas lojas divide a mesma conta.
    const sufixoEmpresa = String(pedido.tenant_id || '').replace(/-/g, '').slice(0, 8).toLowerCase()
    const email = `${insta}.${sufixoEmpresa}@${dominioPortal}`
    const senha = String(pedido.cliente_whatsapp || '').replace(/\D/g, '')
    if (senha.length < 6) return false

    // Já tem acesso? Então não mexemos na senha dela.
    const { data: jaTem } = await supabase
      .from('portal_clientes')
      .select('id, user_id')
      .eq('instagram', insta)
      .eq('tenant_id', pedido.tenant_id)
      .maybeSingle()

    if (jaTem?.user_id) return true

    const { data: criado, error } = await supabase.auth.admin.createUser({
      email,
      password: senha,
      email_confirm: true,
    })

    // Conta já existe no Auth sem linha em portal_clientes: deixa como está,
    // porque trocar a senha de quem já usa o portal seria pior que não criar
    if (error || !criado?.user?.id) {
      console.error('Não foi possível criar o acesso ao portal:', error?.message)
      return false
    }

    const { error: perfilErro } = await supabase
      .from('portal_clientes')
      .insert([{
        user_id: criado.user.id,
        tenant_id: pedido.tenant_id,
        instagram: insta,
        nome_completo: pedido.cliente_nome || '',
        cpf: pedido.cliente_cpf || null,
        celular: pedido.cliente_whatsapp || null,
      }])

    if (perfilErro) {
      console.error('Não foi possível criar o perfil do portal:', perfilErro)
      return false
    }
    return true
  } catch (erro) {
    console.error('Falha ao preparar o acesso ao portal:', erro)
    return false
  }
}
