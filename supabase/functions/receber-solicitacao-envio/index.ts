// ============================================================
// RECEBER SOLICITAÇÃO DE ENVIO (encerrar sacolinha via ManyChat)
// Substitui a ação "Google Sheets: Insert Row" do fluxo
// "solicitar envio.v3": grava direto em producao_pedidos.
//
// Multi-empresa: a função NÃO tem tenant fixo. Cada empresa gera o
// próprio token em Configurações → Integrações e o envia no header
// x-webhook-secret (ou ?token= na URL). O token identifica o tenant.
//
// Deploy:
//   supabase functions deploy receber-solicitacao-envio --no-verify-jwt
// ============================================================
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

// Status que indicam que o pedido já saiu — não participam da deduplicação.
// 'Cliente Retira' fica de fora: é intenção de retirada, o pedido segue aberto.
const ENTREGA_FINAL = ['Enviado', 'Retirou', 'Voltou estoque']

// Espelha STATUS_ENTREGA_OPTS de src/services/producaoService.js
const STATUS_ENTREGA_VALIDOS = [
  'Aguard. pagamento', 'Aguard. dados', 'Cliente informado', 'Cliente Retira',
  'Frete pago', 'Enviado', 'Retirou', 'Voltou estoque', 'Conferir pg',
]

function responder(ok: boolean, mensagem: string, extra: Record<string, unknown> = {}) {
  // Sempre 200: o ManyChat só consegue ler o corpo da resposta em status 200
  return new Response(
    JSON.stringify({ ok, mensagem, ...extra }),
    { status: 200, headers: { 'Content-Type': 'application/json' } }
  )
}

serve(async (req) => {
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  )

  // 1. Token da empresa: header do ManyChat ou query string
  const token = (
    req.headers.get('x-webhook-secret') ||
    new URL(req.url).searchParams.get('token') ||
    ''
  ).trim()

  if (!token) {
    return new Response(JSON.stringify({ erro: 'Acesso negado' }), { status: 401 })
  }

  const { data: config, error: erroConfig } = await supabase
    .from('configuracoes')
    .select('tenant_id')
    .eq('manychat_webhook_token', token)
    .maybeSingle()

  if (erroConfig) {
    console.error('Erro ao resolver token:', erroConfig)
    return responder(false, 'Erro interno no sistema da loja.')
  }
  if (!config?.tenant_id) {
    return new Response(JSON.stringify({ erro: 'Acesso negado' }), { status: 401 })
  }

  const tenantId = config.tenant_id
  const body = await req.json().catch(() => ({}))

  // 2. Extrai os dados aceitando os nomes de campo que o ManyChat pode mandar
  const usuarioRaw =
    body?.instagram_username ??
    body?.instagram ??
    body?.usuario ??
    body?.username ??
    body?.cliente ??
    body?.nome_cliente ??
    body?.contact?.instagram ??
    body?.user?.instagram ??
    ''

  const obsRaw =
    body?.observacoes ??
    body?.observacao ??
    body?.obs_cliente ??
    body?.obs ??
    body?.ultima_entrada_texto ??
    body?.last_input ??
    body?.message ??
    ''

  const cliente = String(usuarioRaw || '').replace(/^@/, '').trim().toLowerCase()
  let observacao = String(obsRaw || '').trim()
  // O fluxo manda "Não"/"-" quando a cliente não tem observação
  if (/^(n[ãa]o|nao|-|sem observa[çc][ãa]o)$/i.test(observacao)) observacao = ''

  // Status de entrega opcional: o fluxo "cliente retira" manda 'Cliente Retira'.
  // Só aceita valores da lista da página de Produção, sem diferenciar maiúsculas.
  const statusEnviado = String(body?.status_entrega ?? body?.statusEntrega ?? '').trim()
  const statusEntrega = STATUS_ENTREGA_VALIDOS.find(
    (s) => s.toLowerCase() === statusEnviado.toLowerCase()
  ) || ''
  const avisoStatus = statusEnviado && !statusEntrega
    ? `status_entrega "${statusEnviado}" não existe na página de Produção e foi ignorado.`
    : null

  if (!cliente) {
    return responder(false, 'Dados inválidos: usuário do Instagram ausente.', {
      payload_keys: Object.keys(body || {}),
    })
  }

  const hoje = new Date().toISOString().slice(0, 10)

  // 3. Deduplicação: se a cliente já pediu envio hoje e o pedido ainda está
  //    aberto, só complementa a observação em vez de criar linha duplicada.
  const { data: abertos, error: erroBusca } = await supabase
    .from('producao_pedidos')
    .select('id, obs_cliente, status_entrega')
    .eq('tenant_id', tenantId)
    .eq('cliente_nome', cliente)
    .eq('data_solicitado', hoje)
    .is('data_enviado', null)

  if (erroBusca) {
    console.error('Erro ao buscar pedidos abertos:', erroBusca)
    return responder(false, 'Erro interno no sistema da loja.')
  }

  const pedidoAberto = (abertos || []).find(
    (p: any) => !ENTREGA_FINAL.includes(String(p.status_entrega || ''))
  )

  if (pedidoAberto) {
    // Complementa o pedido que já existe: observação nova e/ou status de entrega
    const patch: Record<string, string> = {}

    if (observacao && !String(pedidoAberto.obs_cliente || '').includes(observacao)) {
      patch.obs_cliente = [pedidoAberto.obs_cliente, observacao].filter(Boolean).join(' | ')
    }
    if (statusEntrega && statusEntrega !== pedidoAberto.status_entrega) {
      patch.status_entrega = statusEntrega
    }

    if (Object.keys(patch).length > 0) {
      const { error: erroUpdate } = await supabase
        .from('producao_pedidos')
        .update(patch)
        .eq('tenant_id', tenantId)
        .eq('id', pedidoAberto.id)

      if (erroUpdate) {
        console.error('Erro ao atualizar pedido existente:', erroUpdate)
        return responder(false, 'Erro interno no sistema da loja.')
      }
    }

    const mensagem = patch.status_entrega === 'Cliente Retira'
      ? 'Anotamos que você vai retirar o seu pedido. 💛'
      : 'Sua solicitação já está com o setor responsável. 💛'

    return responder(true, mensagem, {
      duplicado: true,
      atualizado: Object.keys(patch),
      pedido_id: pedidoAberto.id,
      ...(avisoStatus ? { aviso: avisoStatus } : {}),
    })
  }

  // 4. Garante a cliente cadastrada (para o WhatsApp e o controle de bloqueio)
  await supabase
    .from('clientes')
    .upsert(
      { tenant_id: tenantId, instagram: cliente },
      { onConflict: 'tenant_id,instagram', ignoreDuplicates: true }
    )

  // 5. Cria o pedido na página de Produção
  const { data: criado, error: erroInsert } = await supabase
    .from('producao_pedidos')
    .insert({
      tenant_id: tenantId,
      cliente_nome: cliente,
      obs_cliente: observacao,
      status_entrega: statusEntrega,
      data_solicitado: hoje,
    })
    .select('id')
    .single()

  if (erroInsert) {
    console.error('Erro ao criar pedido de produção:', erroInsert)
    return responder(false, 'Erro interno no sistema da loja.')
  }

  const mensagem = statusEntrega === 'Cliente Retira'
    ? 'Anotamos que você vai retirar o seu pedido. 💛'
    : 'Sua solicitação foi enviada ao setor responsável. 💛'

  return responder(true, mensagem, {
    pedido_id: criado?.id,
    ...(statusEntrega ? { status_entrega: statusEntrega } : {}),
    ...(avisoStatus ? { aviso: avisoStatus } : {}),
  })
})
