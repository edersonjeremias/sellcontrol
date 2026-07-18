import { supabase } from '../lib/supabase'

export const ASSUNTOS_DISPONIVEIS = [
  { value: 'Vendas', label: 'Vendas' },
  { value: 'Envios', label: 'Envios' },
  { value: 'SAC', label: 'SAC (Atendimento)' },
  { value: 'Financeiro', label: 'Financeiro' },
]

// Busca assuntos permitidos de um usuário
export async function getUserAssuntos(userId) {
  const { data, error } = await supabase
    .from('users_perfil')
    .select('assuntos_permitidos')
    .eq('id', userId)
    .single()

  if (error) return []
  return data?.assuntos_permitidos || []
}

// Salva assuntos permitidos de um usuário
export async function saveUserAssuntos(userId, assuntos) {
  const { error } = await supabase
    .from('users_perfil')
    .update({ assuntos_permitidos: assuntos })
    .eq('id', userId)

  if (error) throw error
}

// Lista todos os usuários com seus assuntos
export async function getUsuariosComAssuntos(tenantId) {
  const { data, error } = await supabase
    .from('users_perfil')
    .select('id, nome, username, email, role, assuntos_permitidos')
    .eq('tenant_id', tenantId)
    .order('nome')

  if (error) throw error
  return data || []
}
