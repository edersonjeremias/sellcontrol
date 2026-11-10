import { supabase } from '../lib/supabase'
import { portalSb } from '../lib/portalSupabase'

const tid = (tenantId) => tenantId || import.meta.env.VITE_TENANT_ID

// Colunas Kanban padrão — salvas em configuracoes.kanban_colunas
export const COLUNAS_DEFAULT = [
  { titulo: 'Novo',               cor: '#8ab4f8' },
  { titulo: 'Orçamento',          cor: '#fbbc04' },
  { titulo: 'Negociação',         cor: '#c58af9' },
  { titulo: 'Aguardando Resposta',cor: '#f28b82' },
  { titulo: 'Encerrado',          cor: '#81c995' },
]

// ── Admin: Colunas ──────────────────────────────────────────────

export async function getColunas(tenantId) {
  const { data } = await supabase
    .from('configuracoes').select('kanban_colunas').eq('tenant_id', tid(tenantId)).maybeSingle()
  return data?.kanban_colunas || COLUNAS_DEFAULT
}

export async function salvarColunas(tenantId, colunas) {
  const { error } = await supabase
    .from('configuracoes')
    .update({ kanban_colunas: colunas })
    .eq('tenant_id', tid(tenantId))
  if (error) throw error
}

// ── Admin: Conversas ────────────────────────────────────────────

export async function getConversas(tenantId, userId = null) {
  const CAMPOS = 'id, cliente_instagram, assunto, coluna, nao_lidas, encerrado, created_at, updated_at'

  let query = supabase
    .from('conversas')
    .select(CAMPOS)
    .eq('tenant_id', tid(tenantId))

  if (userId) {
    const { data: perfil } = await supabase
      .from('users_perfil')
      .select('role, assuntos_permitidos')
      .eq('id', userId)
      .single()

    // Admin e master respondem por tudo. Para os demais, a caixa é recortada
    // pelos assuntos liberados — sem essa exceção, uma mensagem que chega com
    // assunto fora da lista de todo mundo não aparece para ninguém.
    const veTudo = ['admin', 'master'].includes(perfil?.role)

    if (!veTudo) {
      const permitidos = perfil?.assuntos_permitidos || []
      if (permitidos.length === 0) return []
      query = query.in('assunto', permitidos)
    }
  }

  const { data, error } = await query.order('updated_at', { ascending: false })
  if (error) throw error
  return data || []
}

export async function getMensagens(conversaId) {
  const { data, error } = await supabase
    .from('mensagens_contato')
    .select('id, remetente, texto, anexos, created_at')
    .eq('conversa_id', conversaId)
    .order('created_at')
  if (error) {
    console.error('Erro getMensagens:', error)
    throw error
  }
  console.log('getMensagens retornou:', data?.length || 0, 'mensagens')
  return data || []
}

// autorNome é gravado na mensagem, e não resolvido na leitura: o cliente
// continua vendo quem o atendeu mesmo que a pessoa saia da equipe depois.
export async function responderAdmin(conversaId, texto, anexos = [], autorNome = null) {
  const { error } = await supabase
    .from('mensagens_contato')
    .insert([{
      conversa_id: conversaId,
      remetente: 'admin',
      texto: texto || '',
      anexos,
      autor_nome: autorNome || null,
    }])
  if (error) throw error
  await supabase.from('conversas')
    .update({ updated_at: new Date().toISOString(), nao_lidas: 0 })
    .eq('id', conversaId)
}

export async function moverConversa(id, novaColuna) {
  const { error } = await supabase
    .from('conversas').update({ coluna: novaColuna }).eq('id', id)
  if (error) throw error
}

export async function marcarLida(id) {
  await supabase.from('conversas').update({ nao_lidas: 0 }).eq('id', id)
}

export async function encerrarConversa(id, encerrado = true) {
  const { error } = await supabase
    .from('conversas').update({ encerrado, coluna: encerrado ? 'Encerrado' : 'Novo' }).eq('id', id)
  if (error) throw error
}

export async function criarConversaAdmin(tenantId, clienteInstagram, assunto, mensagemInicial, anexos = []) {
  // Normaliza instagram (remove @ se tiver)
  const igNormalizado = clienteInstagram?.replace('@', '') || clienteInstagram

  const { data: conv, error: e1 } = await supabase
    .from('conversas')
    .insert([{
      tenant_id: tid(tenantId),
      cliente_instagram: igNormalizado,
      assunto,
      coluna: 'Novo',
      nao_lidas_cliente: 1,
    }])
    .select('id')
    .single()
  if (e1) throw e1

  const { error: e2 } = await supabase
    .from('mensagens_contato')
    .insert([{ conversa_id: conv.id, remetente: 'admin', texto: mensagemInicial || '', anexos }])
  if (e2) throw e2

  return conv.id
}

// ── Portal: RPCs (SECURITY DEFINER) ────────────────────────────

export async function portalCriarConversa(assunto, mensagem, anexos = []) {
  const { data, error } = await portalSb.rpc('portal_criar_conversa', {
    p_assunto: assunto, p_mensagem: mensagem || '', p_anexos: anexos,
  })
  if (error) throw error
  return data
}

export async function portalGetConversas() {
  const { data, error } = await portalSb.rpc('portal_get_minhas_conversas')
  if (error) throw error
  return data || []
}

export async function portalGetMensagens(conversaId) {
  const { data, error } = await portalSb.rpc('portal_get_mensagens', { p_conversa_id: conversaId })
  if (error) throw error
  return data || []
}

export async function portalResponder(conversaId, texto, anexos = []) {
  const { error } = await portalSb.rpc('portal_responder_conversa', {
    p_conversa_id: conversaId, p_texto: texto || '', p_anexos: anexos,
  })
  if (error) throw error
}

export async function portalMarcarLida(conversaId) {
  const { error } = await portalSb.rpc('portal_marcar_lida', { p_conversa_id: conversaId })
  if (error) throw error
}
