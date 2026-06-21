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
 * Cria notificação de cancelamento de peça (direto via INSERT)
 */
export async function criarNotificacaoCancelamento(tenantId, pedidoId, codigoPeca, descricao) {
  const { data: user } = await supabase.auth.getUser()

  // Busca o nome do cliente do pedido
  const { data: pedido } = await supabase
    .from('pedidos_itens')
    .select('cliente_nome')
    .eq('id', pedidoId)
    .single()

  const clienteNome = pedido?.cliente_nome || 'Cliente'

  // Busca todos os admins/master do tenant (exceto quem cancelou)
  const { data: admins } = await supabase
    .from('users_perfil')
    .select('id')
    .eq('tenant_id', tenantId)
    .in('role', ['admin', 'master'])
    .neq('id', user?.user?.id || '')

  if (!admins || admins.length === 0) {
    console.warn('Nenhum admin encontrado para criar notificação')
    return null
  }

  // Cria notificação para cada admin
  const notificacoes = admins.map(admin => ({
    tenant_id: tenantId,
    user_id: admin.id,
    tipo: 'cancelamento',
    titulo: '❌ Peça Cancelada',
    mensagem: `A peça "${codigoPeca} - ${descricao}" do cliente "${clienteNome}" foi cancelada na expedição.`,
    metadata: {
      pedido_id: pedidoId,
      codigo_peca: codigoPeca,
      cliente: clienteNome
    }
  }))

  const { data, error } = await supabase
    .from('notificacoes')
    .insert(notificacoes)
    .select()

  if (error) throw error
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
