import { supabase } from '../lib/supabase'

export async function getInformativos(tenantId) {
  return supabase
    .from('informativos')
    .select('id, mensagem, status, criador, destinatario, data_insercao, data_conclusao')
    .eq('tenant_id', tenantId)
    .order('data_insercao', { ascending: false })
}

export async function addInformativo(tenantId, mensagem, destinatario, criador) {
  return supabase
    .from('informativos')
    .insert([{ tenant_id: tenantId, mensagem, destinatario, criador }])
}

export async function markInformativoRead(informativoId) {
  return supabase
    .from('informativos')
    .update({ status: 'Lido', data_conclusao: new Date() })
    .eq('id', informativoId)
}
