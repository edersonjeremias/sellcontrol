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
 * Cria notificação de cancelamento de peça (via função do banco)
 */
export async function criarNotificacaoCancelamento(tenantId, pedidoId, codigoPeca, descricao) {
  const { data: user } = await supabase.auth.getUser()

  const { data, error } = await supabase.rpc('criar_notificacao_cancelamento', {
    p_tenant_id: tenantId,
    p_pedido_id: pedidoId,
    p_codigo_peca: codigoPeca,
    p_descricao: descricao,
    p_usuario_que_cancelou: user?.user?.id || null,
  })

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
