import { supabase } from '../lib/supabase'

const tid = (tenantId) => tenantId || import.meta.env.VITE_TENANT_ID

// Evento global para atualizar os badges do header na hora
// (disparado pelas páginas quando uma conversa é marcada como lida)
export const BADGES_EVENT = 'badges:refresh'

export function avisarBadges() {
  window.dispatchEvent(new Event(BADGES_EVENT))
}

// ── Notificações internas (Kanban de Notificações) ──────────────
// Conversas encerradas não entram na conta: elas saem do Kanban e
// o usuário não teria como zerar o contador.
export async function contarNotificacoesNaoLidas(tenantId) {
  if (!tenantId) return 0

  const { data, error } = await supabase
    .from('notificacoes')
    .select('nao_lidas, encerrado')
    .eq('tenant_id', tid(tenantId))
    .gt('nao_lidas', 0)

  if (error) throw error

  return (data || [])
    .filter(n => !n.encerrado)
    .reduce((s, n) => s + (n.nao_lidas || 0), 0)
}

// ── CRM Contatos (mensagens de clientes) ────────────────────────
// Respeita os assuntos permitidos do usuário, igual à ContatosPage.
export async function contarContatosNaoLidos(tenantId, userId = null) {
  if (!tenantId) return 0

  let query = supabase
    .from('conversas')
    .select('nao_lidas, encerrado')
    .eq('tenant_id', tid(tenantId))
    .gt('nao_lidas', 0)

  if (userId) {
    const { data: perfil } = await supabase
      .from('users_perfil')
      .select('role, assuntos_permitidos')
      .eq('id', userId)
      .single()

    // Admin e master contam tudo, igual à ContatosPage: sem isso, mensagem com
    // assunto fora da lista de todo mundo não gera badge para ninguém.
    if (!['admin', 'master'].includes(perfil?.role)) {
      const permitidos = perfil?.assuntos_permitidos || []
      if (permitidos.length === 0) return 0
      query = query.in('assunto', permitidos)
    }
  }

  const { data, error } = await query
  if (error) throw error

  return (data || [])
    .filter(c => !c.encerrado)
    .reduce((s, c) => s + (c.nao_lidas || 0), 0)
}
