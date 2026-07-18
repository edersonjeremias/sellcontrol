import { supabase } from '../lib/supabase'

/**
 * Busca todas as notificações do usuário atual
 */
export async function getNotificacoes(tenantId) {
  const { data, error } = await supabase
    .from('notificacoes')
    .select('*')
    .eq('tenant_id', tenantId)
    .order('created_at', { ascending: false })

  if (error) throw error
  return data || []
}

/**
 * Conta notificações não lidas
 */
export async function countNaoLidas(tenantId) {
  const { count, error } = await supabase
    .from('notificacoes')
    .select('*', { count: 'exact', head: true })
    .eq('tenant_id', tenantId)
    .eq('lida', false)

  if (error) throw error
  return count || 0
}

/**
 * Marca notificação como lida
 */
export async function marcarComoLida(notificacaoId) {
  const { error } = await supabase
    .from('notificacoes')
    .update({ lida: true, lida_em: new Date().toISOString() })
    .eq('id', notificacaoId)

  if (error) throw error
}

/**
 * Marca todas como lidas
 */
export async function marcarTodasComoLidas(tenantId) {
  const { error } = await supabase
    .from('notificacoes')
    .update({ lida: true, lida_em: new Date().toISOString() })
    .eq('tenant_id', tenantId)
    .eq('lida', false)

  if (error) throw error
}

/**
 * Cria notificação de cancelamento de peça (broadcast para todos do tenant)
 */
export async function criarNotificacaoCancelamento(tenantId, itemData) {
  const {
    codigo,
    produto,
    modelo,
    cor,
    marca,
    tamanho,
    cliente_nome,
    data_live,
    preco
  } = itemData

  // Formata data da live
  const dataLiveFormatada = data_live
    ? new Date(data_live).toLocaleDateString('pt-BR')
    : 'Sem data'

  // Descrição completa da peça
  const descricaoPeca = [produto, modelo, cor, marca, tamanho]
    .filter(Boolean)
    .join(' ')

  // Mensagem detalhada
  const mensagem = `Pedido cancelado:
${cliente_nome} | ${dataLiveFormatada}
Código: ${codigo} - ${descricaoPeca}
Preço: R$ ${(preco || 0).toFixed(2)}`

  // Cria notificação broadcast (user_id = null, todos veem)
  const { data, error } = await supabase
    .from('notificacoes')
    .insert({
      tenant_id: tenantId,
      user_id: null, // Broadcast - todos do tenant veem
      tipo: 'cancelamento',
      titulo: '❌ Peça Cancelada',
      mensagem,
      metadata: {
        codigo,
        produto,
        modelo,
        cor,
        marca,
        tamanho,
        cliente_nome,
        data_live,
        preco
      }
    })
    .select()
    .single()

  if (error) {
    console.error('Erro RLS ao criar notificação:', error)
    throw error
  }

  return data
}

/**
 * Cria notificação genérica
 */
export async function criarNotificacao(tenantId, tipo, titulo, mensagem, metadata = {}) {
  const { data: user } = await supabase.auth.getUser()

  const { data, error } = await supabase
    .from('notificacoes')
    .insert({
      tenant_id: tenantId,
      user_id: user?.user?.id || null,
      tipo,
      titulo,
      mensagem,
      metadata,
    })
    .select()
    .single()

  if (error) throw error
  return data
}
