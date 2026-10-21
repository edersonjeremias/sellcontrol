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

// Cada solicitação vira uma linha, mesmo que a cliente peça duas vezes no
// mesmo dia: é preferível a equipe ver uma linha repetida e apagar a mais,
// do que um pedido se perder por ter sido tratado como repetição.

// Espelha STATUS_ENTREGA_OPTS de src/services/producaoService.js
const STATUS_ENTREGA_VALIDOS = [
  'Aguard. pagamento', 'Aguard. dados', 'Cliente informado', 'Cliente Retira',
  'Frete pago', 'Enviado', 'Retirou', 'Voltou estoque', 'Conferir pg',
]

// A function roda em UTC. Depois das 21h no Brasil já é o dia seguinte lá,
// e o pedido nasceria com a data de amanhã na página de Produção.
const FUSO_LOJA = 'America/Sao_Paulo'

function hojeNaLoja() {
  // en-CA formata como 'YYYY-MM-DD', que é o formato da coluna DATE
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: FUSO_LOJA, year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date())
}

// Quando o campo personalizado está vazio para aquele contato, o ManyChat
// manda o nome da variável como texto ('{{cuf_12081946}}') em vez de string
// vazia. Isso chegava a virar observação na tela da equipe.
function limparPlaceholder(valor: string) {
  const limpo = valor.replace(/\{\{[^}]*\}\}/g, '').trim()
  return limpo === '-' ? '' : limpo
}

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

  const cliente = limparPlaceholder(String(usuarioRaw || '')).replace(/^@/, '').trim().toLowerCase()
  let observacao = limparPlaceholder(String(obsRaw || ''))
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

  // Sem o Instagram o pedido entra assim mesmo, marcado para a equipe conferir
  // no Direct. Descartar seria pior: a cliente pediu e ninguém ficaria sabendo.
  if (!cliente) {
    observacao = ['⚠ Cliente não identificado — conferir no Direct', observacao]
      .filter(Boolean).join(' | ')
  }

  const hoje = hojeNaLoja()

  // 3. Garante a cliente cadastrada (para o WhatsApp e o controle de bloqueio)
  if (cliente) {
    await supabase
      .from('clientes')
      .upsert(
        { tenant_id: tenantId, instagram: cliente },
        { onConflict: 'tenant_id,instagram', ignoreDuplicates: true }
      )
  }

  // 4. Cria o pedido na página de Produção
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
