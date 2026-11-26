import { supabase } from '../lib/supabase'
import { exigirTenant } from '../lib/tenant'

const tid = (tenantId) => exigirTenant(tenantId, 'badgesService')

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

// ── Contas a pagar (vencidas + vencendo hoje) ───────────────────
// Separa as duas contagens para o header poder avisar em vermelho quando já
// existe conta atrasada e só em amarelo quando é coisa do dia.
export const SEM_CONTAS_A_VENCER = { vencidas: 0, hoje: 0, total: 0 }

export async function contarContasPagarVencendo(tenantId) {
  if (!tenantId) return SEM_CONTAS_A_VENCER

  // Data local: toISOString() devolveria o dia seguinte à noite, porque o
  // Brasil fica atrás do UTC, e as contas de hoje apareceriam como vencidas.
  const d = new Date()
  const hoje = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`

  const { data, error } = await supabase
    .from('contas_pagar')
    .select('data_vencimento')
    .eq('tenant_id', tid(tenantId))
    .or('status.is.null,status.neq.PAGO')
    .lte('data_vencimento', hoje)

  if (error) throw error

  const linhas = data || []
  const vencidas = linhas.filter(c => c.data_vencimento < hoje).length
  return { vencidas, hoje: linhas.length - vencidas, total: linhas.length }
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
