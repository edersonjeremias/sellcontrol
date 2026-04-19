import { supabase } from '../lib/supabase'

export async function getClientes(tenantId) {
  const { data, error } = await supabase
    .from('clientes')
    .select('*')
    .eq('tenant_id', tenantId)
    .order('instagram')
  return { data: data || [], error }
}

function isSchemaError(error) {
  return error?.message?.includes('schema cache') ||
    error?.message?.includes('column') ||
    error?.code === 'PGRST204'
}

export async function saveCliente(tenantId, { instagram, whatsapp, msg_bloqueio, senha, oldInstagram }) {
  const ig = instagram.trim()
  const full = { tenant_id: tenantId, instagram: ig, whatsapp, msg_bloqueio, senha }
  const base = { tenant_id: tenantId, instagram: ig, whatsapp, msg_bloqueio }

  if (oldInstagram && oldInstagram !== ig) {
    let r = await supabase.from('clientes')
      .update({ instagram: ig, whatsapp, msg_bloqueio, senha })
      .eq('tenant_id', tenantId).eq('instagram', oldInstagram)
      .select().single()
    if (r.error && isSchemaError(r.error)) {
      r = await supabase.from('clientes')
        .update({ instagram: ig, whatsapp, msg_bloqueio })
        .eq('tenant_id', tenantId).eq('instagram', oldInstagram)
        .select().single()
    }
    return r
  }

  let r = await supabase.from('clientes')
    .upsert(full, { onConflict: 'tenant_id,instagram' })
    .select().single()
  if (r.error && isSchemaError(r.error)) {
    r = await supabase.from('clientes')
      .upsert(base, { onConflict: 'tenant_id,instagram' })
      .select().single()
  }
  return r
}

export async function toggleBloqueio(tenantId, instagram, bloqueado) {
  const { data, error } = await supabase
    .from('clientes')
    .update({ bloqueado })
    .eq('tenant_id', tenantId)
    .eq('instagram', instagram)
    .select().single()
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

// Salva os campos de detalhes como colunas individuais
export async function saveDetalhes(tenantId, instagram, d) {
  const payload = {
    nome_completo:   d.nomeCompleto   || '',
    cpf:             d.cpf            || '',
    data_nascimento: d.nasc           || null,
    cep:             d.cep            || '',
    rua:             d.rua            || '',
    numero:          d.num            || '',
    complemento:     d.comp           || '',
    bairro:          d.bairro         || '',
    cidade:          d.cidade         || '',
    uf:              d.estado         || '',
    email:           d.email          || '',
  }
  const { data, error } = await supabase
    .from('clientes')
    .update(payload)
    .eq('tenant_id', tenantId)
    .eq('instagram', instagram)
    .select().single()
  return { data, error }
}
