import { supabase } from '../lib/supabase'

export async function getClientes(tenantId) {
  let todos = []
  let pag = 0
  const LOTE = 1000

  while (true) {
    const { data, error } = await supabase
      .from('clientes')
      .select('*')
      .eq('tenant_id', tenantId)
      .order('instagram')
      .range(pag * LOTE, (pag + 1) * LOTE - 1)

    if (error) return { data: [], error }
    if (!data || data.length === 0) break

    todos = todos.concat(data)
    if (data.length < LOTE) break // Última página
    pag++
  }

  return { data: todos, error: null }
}

// Busca clientes por termo (busca sob demanda para autocomplete)
export async function searchClientes(tenantId, searchTerm, limit = 20) {
  if (!searchTerm || searchTerm.length < 2) {
    return { data: [], error: null }
  }

  const { data, error } = await supabase
    .from('clientes')
    .select('*')
    .eq('tenant_id', tenantId)
    .ilike('instagram', `%${searchTerm}%`)
    .order('instagram')
    .limit(limit)

  return { data: data || [], error }
}

// Busca avançada com múltiplos filtros
export async function searchClientesAvancada(tenantId, filtros, limit = 200) {
  // Se houver filtros de endereço (CEP, Cidade, UF), buscar com JOIN
  const temFiltroEndereco = filtros.cep?.trim() || filtros.cidade?.trim() || filtros.estado?.trim()

  if (temFiltroEndereco) {
    // Busca com JOIN na tabela de endereços (apenas endereço padrão)
    let query = supabase
      .from('clientes')
      .select(`
        *,
        endereco:enderecos_clientes!inner(cep, rua, numero, bairro, cidade, estado)
      `)
      .eq('tenant_id', tenantId)
      .eq('enderecos_clientes.padrao', true)

    // Aplicar filtros de cliente
    if (filtros.instagram?.trim()) {
      query = query.ilike('instagram', `%${filtros.instagram.trim()}%`)
    }
    if (filtros.nome?.trim()) {
      query = query.ilike('nome_completo', `%${filtros.nome.trim()}%`)
    }
    if (filtros.whatsapp?.trim()) {
      const digitos = filtros.whatsapp.replace(/\D/g, '')
      if (digitos) {
        query = query.ilike('whatsapp', `%${digitos}%`)
      }
    }
    if (filtros.cpf?.trim()) {
      const digitos = filtros.cpf.replace(/\D/g, '')
      if (digitos) {
        query = query.ilike('cpf_cnpj', `%${digitos}%`)
      }
    }
    if (filtros.email?.trim()) {
      query = query.ilike('email', `%${filtros.email.trim()}%`)
    }

    // Aplicar filtros de endereço
    if (filtros.cep?.trim()) {
      const digitos = filtros.cep.replace(/\D/g, '')
      if (digitos) {
        query = query.ilike('enderecos_clientes.cep', `%${digitos}%`)
      }
    }
    if (filtros.cidade?.trim()) {
      query = query.ilike('enderecos_clientes.cidade', `%${filtros.cidade.trim()}%`)
    }
    if (filtros.estado?.trim()) {
      query = query.ilike('enderecos_clientes.estado', `%${filtros.estado.trim()}%`)
    }

    // Filtro de bloqueado
    if (filtros.bloqueado === 'sim') {
      query = query.eq('bloqueado', true)
    } else if (filtros.bloqueado === 'nao') {
      query = query.eq('bloqueado', false)
    }

    const { data, error } = await query
      .order('instagram')
      .limit(limit)

    // Achatar os dados do endereço para o formato esperado
    const flatData = (data || []).map(c => ({
      ...c,
      cep: c.endereco?.[0]?.cep || '',
      cidade: c.endereco?.[0]?.cidade || '',
      uf: c.endereco?.[0]?.estado || '',
      endereco: undefined // Remove o objeto aninhado
    }))

    return { data: flatData, error }
  }

  // Busca simples SEM JOIN (quando não há filtro de endereço)
  let query = supabase
    .from('clientes')
    .select('*')
    .eq('tenant_id', tenantId)

  // Aplicar filtros apenas se preenchidos
  if (filtros.instagram?.trim()) {
    query = query.ilike('instagram', `%${filtros.instagram.trim()}%`)
  }
  if (filtros.nome?.trim()) {
    query = query.ilike('nome_completo', `%${filtros.nome.trim()}%`)
  }
  if (filtros.whatsapp?.trim()) {
    const digitos = filtros.whatsapp.replace(/\D/g, '')
    if (digitos) {
      query = query.ilike('whatsapp', `%${digitos}%`)
    }
  }
  if (filtros.cpf?.trim()) {
    const digitos = filtros.cpf.replace(/\D/g, '')
    if (digitos) {
      query = query.ilike('cpf_cnpj', `%${digitos}%`)
    }
  }
  if (filtros.email?.trim()) {
    query = query.ilike('email', `%${filtros.email.trim()}%`)
  }
  if (filtros.bloqueado === 'sim') {
    query = query.eq('bloqueado', true)
  } else if (filtros.bloqueado === 'nao') {
    query = query.eq('bloqueado', false)
  }

  const { data, error } = await query
    .order('instagram')
    .limit(limit)

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
