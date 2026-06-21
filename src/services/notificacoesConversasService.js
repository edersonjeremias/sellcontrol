import { supabase } from '../lib/supabase'

// ══════════════════════════════════════════════════════════════
// COLUNAS DO KANBAN
// ══════════════════════════════════════════════════════════════

export const COLUNAS_DEFAULT = ['Novo', 'Orçamento', 'Negociação', 'Aguardando Resposta', 'Encerrado']

export async function getColunas(tenantId) {
  const { data } = await supabase
    .from('notificacoes_colunas')
    .select('colunas')
    .eq('tenant_id', tenantId)
    .single()

  return data?.colunas || COLUNAS_DEFAULT
}

export async function salvarColunas(tenantId, colunas) {
  const { error } = await supabase
    .from('notificacoes_colunas')
    .upsert({ tenant_id: tenantId, colunas }, { onConflict: 'tenant_id' })

  if (error) throw error
}

// ══════════════════════════════════════════════════════════════
// NOTIFICAÇÕES/CONVERSAS
// ══════════════════════════════════════════════════════════════

export async function getNotificacoesConversas(tenantId) {
  const { data, error } = await supabase
    .from('notificacoes')
    .select('*')
    .eq('tenant_id', tenantId)
    .order('created_at', { ascending: false })

  if (error) throw error
  return data || []
}

export async function getMensagensNotificacao(notificacaoId) {
  const { data, error } = await supabase
    .from('notificacoes_mensagens')
    .select('*')
    .eq('notificacao_id', notificacaoId)
    .order('created_at', { ascending: true })

  if (error) throw error
  return data || []
}

export async function responderNotificacao(notificacaoId, tenantId, remetente, mensagem) {
  const { data: user } = await supabase.auth.getUser()

  const { error } = await supabase
    .from('notificacoes_mensagens')
    .insert({
      notificacao_id: notificacaoId,
      tenant_id: tenantId,
      user_id: user?.user?.id || null,
      remetente,
      mensagem,
    })

  if (error) throw error

  // Atualiza timestamp da notificação
  await supabase
    .from('notificacoes')
    .update({ created_at: new Date().toISOString() })
    .eq('id', notificacaoId)
}

export async function moverNotificacao(notificacaoId, novaColuna) {
  const { error } = await supabase
    .from('notificacoes')
    .update({ coluna: novaColuna })
    .eq('id', notificacaoId)

  if (error) throw error
}

export async function marcarNotificacaoLida(notificacaoId) {
  const { error } = await supabase
    .from('notificacoes')
    .update({ lida: true, nao_lidas: 0 })
    .eq('id', notificacaoId)

  if (error) throw error
}

export async function encerrarNotificacao(notificacaoId) {
  const { error } = await supabase
    .from('notificacoes')
    .update({ encerrado: true, coluna: 'Encerrado' })
    .eq('id', notificacaoId)

  if (error) throw error
}

export async function criarNotificacaoManual(tenantId, remetente, destinatario, assunto, mensagem) {
  const { data: user } = await supabase.auth.getUser()

  const { data, error } = await supabase
    .from('notificacoes')
    .insert({
      tenant_id: tenantId,
      user_id: user?.user?.id || null,
      tipo: 'mensagem',
      titulo: assunto,
      mensagem,
      remetente,
      destinatario,
      assunto,
      coluna: 'Novo',
      nao_lidas: 1,
    })
    .select()
    .single()

  if (error) throw error
  return data
}

// ══════════════════════════════════════════════════════════════
// CRIAR NOTIFICAÇÃO AUTOMÁTICA DE CANCELAMENTO
// ══════════════════════════════════════════════════════════════

export async function criarNotificacaoCancelamentoConversa(tenantId, itemData) {
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

  // Cria notificação como conversa
  const { data, error } = await supabase
    .from('notificacoes')
    .insert({
      tenant_id: tenantId,
      user_id: null,
      tipo: 'cancelamento',
      titulo: '❌ Peça Cancelada',
      assunto: `Peça ${codigo} Cancelada`,
      mensagem,
      remetente: 'SISTEMA',
      destinatario: 'TODOS',
      coluna: 'Novo',
      nao_lidas: 1,
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
    console.error('Erro ao criar notificação:', error)
    throw error
  }

  return data
}
