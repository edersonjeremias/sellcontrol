import { supabase } from '../lib/supabase'

export const ASSUNTOS_DISPONIVEIS = [
  { value: 'Vendas', label: 'Vendas' },
  { value: 'Envios', label: 'Envios' },
  { value: 'SAC', label: 'SAC (Atendimento)' },
  { value: 'Financeiro', label: 'Financeiro' },
]

// Busca configuração de assuntos do tenant
export async function getAssuntosConfig(tenantId) {
  const { data, error } = await supabase
    .from('configuracoes')
    .select('assuntos_responsaveis')
    .eq('tenant_id', tenantId)
    .single()

  if (error) return {}
  return data?.assuntos_responsaveis || {}
}

// Salva configuração de assuntos
export async function saveAssuntosConfig(tenantId, config) {
  const { error } = await supabase
    .from('configuracoes')
    .update({ assuntos_responsaveis: config })
    .eq('tenant_id', tenantId)

  if (error) throw error
}

// Busca responsável por assunto
export async function getResponsavelPorAssunto(tenantId, assunto) {
  const config = await getAssuntosConfig(tenantId)
  return config[assunto] || null
}

// Lista usuários disponíveis para atribuição
export async function getUsuariosDisponiveis(tenantId) {
  const { data, error } = await supabase
    .from('users_perfil')
    .select('id, nome, username, email')
    .eq('tenant_id', tenantId)
    .order('nome')

  if (error) throw error
  return data || []
}
