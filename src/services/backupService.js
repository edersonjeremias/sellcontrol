import { supabase } from '../lib/supabase'

const TENANT_ID = (tenantId) => tenantId || import.meta.env.VITE_TENANT_ID

// O id do usuário não muda durante a sessão e o backup roda a cada poucos
// segundos, então vale guardar para não refazer a chamada toda vez.
let usuarioIdCache = null

async function getUsuarioId() {
  if (usuarioIdCache) return usuarioIdCache
  const { data } = await supabase.auth.getSession()
  usuarioIdCache = data?.session?.user?.id || null
  return usuarioIdCache
}

export function limparCacheUsuario() {
  usuarioIdCache = null
}

// ── salvarBackupRemoto ─────────────────────────────────────────
// Espelha no banco o mesmo payload que já vai para o localStorage.
// Falha em silêncio: um erro de rede nunca pode atrapalhar a live.
export async function salvarBackupRemoto(tenantId, payload) {
  try {
    const tid = TENANT_ID(tenantId)
    const usuarioId = await getUsuarioId()
    if (!tid || !usuarioId) return false

    const { error } = await supabase
      .from('vendas_backup')
      .upsert({
        tenant_id: tid,
        usuario_id: usuarioId,
        payload,
        atualizado_em: new Date().toISOString(),
      }, { onConflict: 'tenant_id,usuario_id' })

    if (error) throw error
    return true
  } catch (err) {
    console.warn('Backup remoto falhou (live continua normal):', err.message)
    return false
  }
}

// ── getBackupRemoto ────────────────────────────────────────────
export async function getBackupRemoto(tenantId) {
  try {
    const tid = TENANT_ID(tenantId)
    const usuarioId = await getUsuarioId()
    if (!tid || !usuarioId) return null

    const { data, error } = await supabase
      .from('vendas_backup')
      .select('payload, atualizado_em')
      .eq('tenant_id', tid)
      .eq('usuario_id', usuarioId)
      .maybeSingle()

    if (error) throw error
    return data?.payload || null
  } catch (err) {
    console.warn('Não foi possível ler o backup remoto:', err.message)
    return null
  }
}

// ── limparBackupRemoto ─────────────────────────────────────────
export async function limparBackupRemoto(tenantId) {
  try {
    const tid = TENANT_ID(tenantId)
    const usuarioId = await getUsuarioId()
    if (!tid || !usuarioId) return false

    const { error } = await supabase
      .from('vendas_backup')
      .delete()
      .eq('tenant_id', tid)
      .eq('usuario_id', usuarioId)

    if (error) throw error
    return true
  } catch (err) {
    console.warn('Não foi possível limpar o backup remoto:', err.message)
    return false
  }
}

// ── listarBackupsDoTenant ──────────────────────────────────────
// Só admin/master enxergam (a policy no banco é quem garante isso).
// Serve para o dono da loja achar a live que ficou presa no login de um
// vendedor que foi embora sem salvar.
export async function listarBackupsDoTenant(tenantId) {
  try {
    const tid = TENANT_ID(tenantId)
    if (!tid) return []

    const { data, error } = await supabase
      .from('vendas_backup')
      .select('usuario_id, payload, atualizado_em')
      .eq('tenant_id', tid)
      .order('atualizado_em', { ascending: false })

    if (error) throw error
    const backups = data || []
    if (!backups.length) return []

    // usuario_id não tem FK para users_perfil, então o nome vem numa 2a query
    const ids = [...new Set(backups.map(b => b.usuario_id))]
    const { data: perfis } = await supabase
      .from('users_perfil')
      .select('id, nome, username')
      .in('id', ids)

    const nomePorId = new Map((perfis || []).map(p => [p.id, p.nome || p.username || '']))

    return backups.map(b => {
      const linhas = Array.isArray(b.payload?.linhas) ? b.payload.linhas : []
      const comCliente = linhas.filter(l => !l.deleted && l.cliente_nome?.trim())
      return {
        usuarioId:    b.usuario_id,
        usuarioNome:  nomePorId.get(b.usuario_id) || 'Usuário removido',
        atualizadoEm: b.atualizado_em,
        dataLive:     b.payload?.dataLive || '',
        liveNome:     b.payload?.liveNome || '',
        totalLinhas:  linhas.filter(l => !l.deleted).length,
        totalVendas:  comCliente.length,
      }
    })
  } catch (err) {
    console.warn('Não foi possível listar os backups da loja:', err.message)
    return []
  }
}

// ── getBackupDeUsuario ─────────────────────────────────────────
export async function getBackupDeUsuario(tenantId, usuarioId) {
  try {
    const tid = TENANT_ID(tenantId)
    if (!tid || !usuarioId) return null

    const { data, error } = await supabase
      .from('vendas_backup')
      .select('payload')
      .eq('tenant_id', tid)
      .eq('usuario_id', usuarioId)
      .maybeSingle()

    if (error) throw error
    return data?.payload || null
  } catch (err) {
    console.warn('Não foi possível ler o backup do vendedor:', err.message)
    return null
  }
}
