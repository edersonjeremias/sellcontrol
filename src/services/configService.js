import { supabase } from '../lib/supabase'

// ── Configurações do tenant ────────────────────────────────────

export async function getConfig(tenantId) {
  const { data, error } = await supabase
    .from('configuracoes')
    .select('*')
    .eq('tenant_id', tenantId)
    .maybeSingle()
  if (error) throw error
  return data
}

export async function saveConfig(tenantId, campos) {
  const { data: existing } = await supabase
    .from('configuracoes')
    .select('id')
    .eq('tenant_id', tenantId)
    .maybeSingle()

  if (existing) {
    const { error } = await supabase
      .from('configuracoes')
      .update({ ...campos, updated_at: new Date().toISOString() })
      .eq('tenant_id', tenantId)
    if (error) throw error
  } else {
    const { error } = await supabase
      .from('configuracoes')
      .insert([{ tenant_id: tenantId, ...campos }])
    if (error) throw error
  }
}

// Cache em memória para não bater no banco a cada link gerado
let _cache = { tenantId: null, token: null }

export async function getMpToken(tenantId) {
  if (_cache.tenantId === tenantId && _cache.token) return _cache.token
  const { data } = await supabase
    .from('configuracoes')
    .select('mp_access_token')
    .eq('tenant_id', tenantId)
    .maybeSingle()
  const token = data?.mp_access_token?.trim() || import.meta.env.VITE_MP_ACCESS_TOKEN || ''
  _cache = { tenantId, token }
  return token
}

export function invalidateMpTokenCache() {
  _cache = { tenantId: null, token: null }
}

// ── Usuários do tenant ─────────────────────────────────────────

export const ROLES = [
  { value: 'admin',      label: 'Admin',      desc: 'Acesso total à empresa' },
  { value: 'gerente',    label: 'Gerente',    desc: 'Vendas, Cobranças e Dashboard' },
  { value: 'vendedor',   label: 'Vendedor',   desc: 'Somente Vendas' },
  { value: 'financeiro', label: 'Financeiro', desc: 'Somente Cobranças e Dashboard' },
]

export async function getUsuarios(tenantId) {
  const { data, error } = await supabase
    .from('users_perfil')
    .select('id, nome, email, role, created_at')
    .eq('tenant_id', tenantId)
    .order('nome')
  if (error) throw error
  return data || []
}

export async function updateUsuarioRole(userId, role) {
  const { error } = await supabase
    .from('users_perfil')
    .update({ role })
    .eq('id', userId)
  if (error) throw error
}
