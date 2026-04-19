import { supabase } from '../lib/supabase'

export async function getClientes(tenantId) {
  const { data, error } = await supabase
    .from('clientes')
    .select('instagram, whatsapp, bloqueado, msg_bloqueio, senha, detalhes, created_at')
    .eq('tenant_id', tenantId)
    .order('instagram')
  return { data: data || [], error }
}

export async function saveCliente(tenantId, { instagram, whatsapp, msg_bloqueio, senha, oldInstagram }) {
  const ig = instagram.trim()

  if (oldInstagram && oldInstagram !== ig) {
    // Renomeando instagram: update direto
    const { data, error } = await supabase
      .from('clientes')
      .update({ instagram: ig, whatsapp, msg_bloqueio, senha })
      .eq('tenant_id', tenantId)
      .eq('instagram', oldInstagram)
      .select()
      .single()
    return { data, error }
  }

  // Novo ou mesmo nome: upsert
  const { data, error } = await supabase
    .from('clientes')
    .upsert(
      { tenant_id: tenantId, instagram: ig, whatsapp, msg_bloqueio, senha },
      { onConflict: 'tenant_id,instagram' }
    )
    .select()
    .single()
  return { data, error }
}

export async function toggleBloqueio(tenantId, instagram, bloqueado) {
  const { data, error } = await supabase
    .from('clientes')
    .update({ bloqueado })
    .eq('tenant_id', tenantId)
    .eq('instagram', instagram)
    .select()
    .single()
  return { data, error }
}

export async function deleteCliente(tenantId, instagram) {
  const { error } = await supabase
    .from('clientes')
    .delete()
    .eq('tenant_id', tenantId)
    .eq('instagram', instagram)
  return { error }
}

export async function saveDetalhes(tenantId, instagram, detalhes) {
  const { data, error } = await supabase
    .from('clientes')
    .update({ detalhes })
    .eq('tenant_id', tenantId)
    .eq('instagram', instagram)
    .select()
    .single()
  return { data, error }
}
