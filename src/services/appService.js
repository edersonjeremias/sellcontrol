import { supabase } from '../lib/supabase'

function isMissingResource(error) {
  if (!error) return false
  return error.code === 'PGRST205' || error.code === '42P01' || error.status === 404
}

let informativosResourceAvailable = true

export async function getInformativos(tenantId) {
  if (!informativosResourceAvailable) return { data: [] }
  const result = await supabase
    .from('informativos')
    .select('*')
    .eq('tenant_id', tenantId)
    .order('id', { ascending: false })
  if (isMissingResource(result.error)) {
    informativosResourceAvailable = false
    return { data: [] }
  }
  return result
}

export async function addInformativo(tenantId, mensagem, destinatario, criador) {
  if (!informativosResourceAvailable) return { data: null, error: null }
  const result = await supabase
    .from('informativos')
    .insert([{ tenant_id: tenantId, mensagem, destinatario, criador }])
  if (isMissingResource(result.error)) {
    informativosResourceAvailable = false
    return { data: null, error: null }
  }
  return result
}

export async function markInformativoRead(informativoId) {
  if (!informativosResourceAvailable) return { data: null, error: null }
  const result = await supabase
    .from('informativos')
    .update({ status: 'Lido', data_conclusao: new Date() })
    .eq('id', informativoId)
  if (isMissingResource(result.error)) {
    informativosResourceAvailable = false
    return { data: null, error: null }
  }
  return result
}
