import { portalSb } from '../lib/portalSupabase'

const STATUS_ENCERRADO = ['Pronto', 'Enviado', 'Entregue', 'Retirou', 'Repetido']
// Valores de status_entrega que indicam que o pedido já foi despachado
const STATUS_ENTREGA_FINALIZADA = ['Enviado', 'Entregue', 'Retirou', 'Retirada']

export const STATUS_ENVIADO_PECA = ['enviado', 'entregue', 'retirou', 'retirada']

// Busca itens via RPC que lê diretamente da tabela vendas (SECURITY DEFINER)
export async function getProdutos(instagram) {
  const { data, error } = await portalSb.rpc('portal_get_minha_sacolinha')
  if (error) throw error
  return data || []
}

export async function getCobrancas(instagram) {
  const { data, error } = await portalSb
    .from('portal_cobrancas')
    .select('*')
    .eq('cliente_instagram', instagram)
  if (error) throw error
  return data || []
}

// Busca débitos pendentes do cliente da tabela principal de cobranças (SECURITY DEFINER)
export async function getMeusDebitos() {
  const { data, error } = await portalSb.rpc('portal_get_meus_debitos')
  if (error) throw error
  return data || []
}

export async function getUltimaProducao(instagram) {
  const { data, error } = await portalSb
    .from('portal_producao')
    .select('*')
    .eq('cliente_instagram', instagram)
    .order('data_solicitacao', { ascending: false })
    .limit(1)
  if (error) throw error
  return data?.[0] || null
}

// Produção "ativa" = ainda não foi despachada/encerrada
// status_entrega "Enviado/Entregue/Retirou" = pedido despachado → libera nova sacolinha
export function isProducaoAtiva(producao) {
  if (!producao) return false
  if (STATUS_ENTREGA_FINALIZADA.includes(producao.status_entrega)) return false
  return !STATUS_ENCERRADO.includes(producao.status_producao)
}

export async function encerrarSacolinha(instagram, tipoEntrega, obs) {
  const obsTexto = obs?.trim()
    ? `[${tipoEntrega}] ${obs.trim()}`
    : `[${tipoEntrega}]`

  // Busca tenant_id do cliente
  const slug = instagram.replace(/^@/, '').toLowerCase()
  const { data: clienteData } = await portalSb
    .from('clientes')
    .select('tenant_id')
    .ilike('instagram', `%${slug}%`)
    .limit(1)
    .single()

  let tenantId = clienteData?.tenant_id

  // Se não achou tenant_id em clientes, tenta buscar de vendas
  if (!tenantId) {
    const { data: vendaData } = await portalSb
      .from('vendas')
      .select('tenant_id')
      .ilike('cliente_nome', `%${slug}%`)
      .limit(1)
      .single()

    if (!vendaData?.tenant_id) {
      throw new Error('Cliente não encontrado no sistema')
    }
    tenantId = vendaData.tenant_id
  }

  // Cria registro em producao_pedidos (tabela oficial da página Produção)
  const dataHoje = new Date().toISOString().split('T')[0]
  const { error: errPedido } = await portalSb
    .from('producao_pedidos')
    .insert({
      tenant_id: tenantId,
      cliente_nome: instagram,
      data_solicitado: dataHoje,
      status_prod: 'Em fila',
      status_entrega: 'Aguardando',
      obs_cliente: obsTexto,
    })

  if (errPedido) throw errPedido

  // Cria registro em portal_producao (para o portal visualizar)
  const { data, error } = await portalSb
    .from('portal_producao')
    .insert({
      cliente_instagram: instagram,
      status_producao: 'Em fila',
      status_entrega: 'Aguardando',
      obs_cliente: obsTexto,
    })
    .select()
    .single()
  if (error) throw error
  return data
}

export async function uploadComprovante(instagram, file) {
  const ext = file.name.split('.').pop()
  const slug = instagram.replace(/[^a-z0-9]/gi, '')
  const path = `${slug}/${Date.now()}.${ext}`

  const { error: upErr } = await portalSb.storage
    .from('comprovantes')
    .upload(path, file, { upsert: true })
  if (upErr) throw upErr

  const { data } = portalSb.storage.from('comprovantes').getPublicUrl(path)
  return data.publicUrl
}

export async function salvarComprovante(producaoId, url) {
  const { error } = await portalSb
    .from('portal_producao')
    .update({ link_comprovante_frete: url, status_entrega: 'Conferir pg' })
    .eq('id', producaoId)
  if (error) throw error
}

export async function atualizarCadastro(userId, dados) {
  const { error } = await portalSb
    .from('portal_clientes')
    .update(dados)
    .eq('user_id', userId)
  if (error) throw error
}
