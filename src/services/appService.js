import { supabase } from '../lib/supabase'

function isMissingResource(error) {
  if (!error) return false
  return error.code === 'PGRST205' || error.code === '42P01' || error.status === 404
}

// Desativado permanentemente para evitar erros 404 no console
let informativosResourceAvailable = false

export async function getInformativos(tenantId) {
  return { data: [] }
}

export async function addInformativo(tenantId, mensagem, destinatario, criador) {
  return { data: null, error: null }
}

export async function markInformativoRead(informativoId) {
  return { data: null, error: null }
}
