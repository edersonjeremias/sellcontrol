// ============================================================
// RECEBER SOLICITAÇÃO DE ENVIO (encerrar sacolinha via ManyChat)
// Substitui a ação "Google Sheets: Insert Row" do fluxo
// "solicitar envio.v3": grava direto em producao_pedidos.
//
// Deploy:
//   supabase functions deploy receber-solicitacao-envio --no-verify-jwt
// ============================================================
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SECRET = Deno.env.get('MANYCHAT_WEBHOOK_SECRET') ?? ''
const TENANT_PADRAO = Deno.env.get('TENANT_ID') ?? ''

// Status que indicam que o pedido já saiu — não participam da deduplicação
const ENTREGA_FINAL = ['Enviado', 'Retirou', 'Voltou estoque', 'Cliente Retira']

function responder(ok: boolean, mensagem: string, extra: Record<string, unknown> = {}) {
  // Sempre 200: o ManyChat só consegue ler o corpo da resposta em status 200
  return new Response(
    JSON.stringify({ ok, mensagem, ...extra }),
    { status: 200, headers: { 'Content-Type': 'application/json' } }
  )
}

serve(async (req) => {
  // 1. Senha de segurança (header x-webhook-secret no ManyChat)
  // O valor vive no secret MANYCHAT_WEBHOOK_SECRET, nunca no codigo.
  if (!SECRET || req.headers.get('x-webhook-secret') !== SECRET) {
    return new Response(JSON.stringify({ erro: 'Acesso negado' }), { status: 401 })
  }

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

  const tenantId = String(body?.tenant_id || TENANT_PADRAO || '').trim()

  if (!cliente) {
    return responder(false, 'Dados inválidos: usuário do Instagram ausente.', {
      payload_keys: Object.keys(body || {}),
    })
  }
  if (!tenantId) {
    return responder(false, 'Configuração ausente: defina TENANT_ID na function.')
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  )

  const hoje = new Date().toISOString().slice(0, 10)

  // 3. Deduplicação: se a cliente já pediu envio hoje e o pedido ainda está
  //    aberto, só complementa a observação em vez de criar linha duplicada.
  const { data: abertos, error: erroBusca } = await supabase
    .from('producao_pedidos')
    .select('id, obs_cliente, status_entrega, data_enviado')
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
    if (observacao && !String(pedidoAberto.obs_cliente || '').includes(observacao)) {
      const obsFinal = [pedidoAberto.obs_cliente, observacao].filter(Boolean).join(' | ')
      await supabase
        .from('producao_pedidos')
        .update({ obs_cliente: obsFinal })
        .eq('tenant_id', tenantId)
        .eq('id', pedidoAberto.id)
    }
    return responder(true, 'Sua solicitação já está com o setor responsável. 💛', {
      duplicado: true,
      pedido_id: pedidoAberto.id,
    })
  }

  // 4. Garante a cliente cadastrada (para o WhatsApp e o controle de bloqueio)
  await supabase
    .from('clientes')
    .upsert({ tenant_id: tenantId, instagram: cliente }, { onConflict: 'tenant_id,instagram', ignoreDuplicates: true })

  // 5. Cria o pedido na página de Produção
  const { data: criado, error: erroInsert } = await supabase
    .from('producao_pedidos')
    .insert({
      tenant_id: tenantId,
      cliente_nome: cliente,
      obs_cliente: observacao,
      data_solicitado: hoje,
    })
    .select('id')
    .single()

  if (erroInsert) {
    console.error('Erro ao criar pedido de produção:', erroInsert)
    return responder(false, 'Erro interno no sistema da loja.')
  }

  return responder(true, 'Sua solicitação foi enviada ao setor responsável. 💛', {
    pedido_id: criado?.id,
  })
})
