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

export async function getConversas(tenantId) {
  const { data, error } = await supabase
    .from('conversas')
    .select('id, cliente_instagram, assunto, coluna, nao_lidas, encerrado, created_at, updated_at')
    .eq('tenant_id', tid(tenantId))
    .order('updated_at', { ascending: false })
  if (error) throw error
  return data || []
}

export async function getMensagens(conversaId) {
  const { data, error } = await supabase
    .from('mensagens_contato')
    .select('id, remetente, texto, created_at')
    .eq('conversa_id', conversaId)
    .order('created_at')
  if (error) throw error
  return data || []
}

export async function responderAdmin(conversaId, texto) {
  const { error } = await supabase
    .from('mensagens_contato')
    .insert([{ conversa_id: conversaId, remetente: 'admin', texto }])
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

// ── Portal: RPCs (SECURITY DEFINER) ────────────────────────────

export async function portalCriarConversa(assunto, mensagem) {
  const { data, error } = await portalSb.rpc('portal_criar_conversa', {
    p_assunto: assunto, p_mensagem: mensagem,
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

export async function portalResponder(conversaId, texto) {
  const { error } = await portalSb.rpc('portal_responder_conversa', {
    p_conversa_id: conversaId, p_texto: texto,
  })
  if (error) throw error
}

export async function portalMarcarLida(conversaId) {
  const { error } = await portalSb.rpc('portal_marcar_lida', { p_conversa_id: conversaId })
  if (error) throw error
}
