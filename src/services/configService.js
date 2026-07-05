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
  const { error } = await supabase
    .from('configuracoes')
    .upsert(
      { tenant_id: tenantId, ...campos, updated_at: new Date().toISOString() },
      { onConflict: 'tenant_id' }
    )
  if (error) throw error
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
    .select('id, nome, email, username, role, ativo, created_at')
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

// Atualiza dados do usuário (nome, email)
export async function updateUsuario(userId, { nome, email }) {
  const updates = {}
  if (nome !== undefined) updates.nome = nome
  if (email !== undefined) updates.email = email

  const { error } = await supabase
    .from('users_perfil')
    .update(updates)
    .eq('id', userId)

  if (error) throw error
}

// Ativa/Inativa usuário
export async function toggleUsuarioAtivo(userId, ativo) {
  const { error } = await supabase
    .from('users_perfil')
    .update({ ativo })
    .eq('id', userId)

  if (error) throw error
}

// Reseta senha do usuário (via serverless function)
export async function resetUsuarioSenha(userId, novaSenha) {
  const API_URL = import.meta.env.VITE_API_URL || 'https://sellcontrol.vercel.app'

  const response = await fetch(`${API_URL}/api/reset-senha-usuario`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ userId, novaSenha }),
  })

  if (!response.ok) {
    const data = await response.json()
    throw new Error(data.error || 'Erro ao resetar senha')
  }

  return await response.json()
}
