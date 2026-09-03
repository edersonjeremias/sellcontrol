import { supabase } from '../lib/supabase'

/**
 * Busca todos os status de expedição do tenant
 * @param {string} tenantId
 * @returns {Promise<Array>}
 */
export async function getStatusExpedicao(tenantId) {
  const { data, error } = await supabase
    .from('status_expedicao')
    .select('*')
    .eq('tenant_id', tenantId)
    .eq('ativo', true)
    .order('ordem', { ascending: true })

  if (error) throw error
  return data || []
}

/**
 * Busca todos os status (incluindo inativos) para administração
 * @param {string} tenantId
 * @returns {Promise<Array>}
 */
export async function getAllStatusExpedicao(tenantId) {
  const { data, error } = await supabase
    .from('status_expedicao')
    .select('*')
    .eq('tenant_id', tenantId)
    .order('ordem', { ascending: true })

  if (error) throw error
  return data || []
}

/**
 * Cria um novo status
 * @param {string} tenantId
 * @param {Object} status - { nome, cor, ordem? }
 * @returns {Promise<Object>}
 */
export async function createStatus(tenantId, status) {
  const { data, error } = await supabase
    .from('status_expedicao')
    .insert([{
      tenant_id: tenantId,
      nome: status.nome,
      cor: status.cor,
      ordem: status.ordem || 999,
      ativo: true,
    }])
    .select()
    .single()

  if (error) throw error
  return data
}

/**
 * Atualiza um status existente
 * @param {string} statusId
 * @param {Object} updates - { nome?, cor?, ordem?, ativo? }
 * @returns {Promise<Object>}
 */
export async function updateStatus(statusId, updates) {
  const { data, error } = await supabase
    .from('status_expedicao')
    .update(updates)
    .eq('id', statusId)
    .select()
    .single()

  if (error) throw error
  return data
}

/**
 * Deleta um status (soft delete - marca como inativo)
 * @param {string} statusId
 * @returns {Promise<void>}
 */
export async function deleteStatus(statusId) {
  const { error } = await supabase
    .from('status_expedicao')
    .update({ ativo: false })
    .eq('id', statusId)

  if (error) throw error
}

/**
 * Deleta um status permanentemente
 * @param {string} statusId
 * @returns {Promise<void>}
 */
export async function deleteStatusPermanently(statusId) {
  const { error } = await supabase
    .from('status_expedicao')
    .delete()
    .eq('id', statusId)

  if (error) throw error
}

/**
 * Reordena status
 * @param {string} tenantId
 * @param {Array} statusIds - Array de IDs na nova ordem
 * @returns {Promise<void>}
 */
export async function reorderStatus(tenantId, statusIds) {
  const updates = statusIds.map((id, index) => ({
    id,
    ordem: index + 1,
  }))

  for (const update of updates) {
    await supabase
      .from('status_expedicao')
      .update({ ordem: update.ordem })
      .eq('id', update.id)
      .eq('tenant_id', tenantId)
  }
}
