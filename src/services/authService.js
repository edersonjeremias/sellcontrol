import { supabase } from '../lib/supabase'

// O catálogo de páginas e módulos do sistema mora em src/lib/modulos.js.
// Aqui não há segunda lista: duas listas divergiam toda vez que uma página
// nova entrava no sistema e alguém atualizava só uma delas.

function isMissingResource(error) {
  if (!error) return false
  return error.code === 'PGRST205' || error.code === '42P01' || error.status === 404
}

let pagesResourceAvailable = true
let pagesAccessResourceAvailable = true

function normalizePages(data) {
  return (data || [])
    .map((item, index) => ({ ...item, order_index: item.order_index ?? (index + 1) * 10 }))
    .sort((a, b) => (a.order_index || 0) - (b.order_index || 0))
}

export async function getUserProfile(userId) {
  return supabase
    .from('users_perfil')
    .select('id, nome, username, role, tenant_id')
    .eq('id', userId)
    .single()
}

export async function getPagesForUser(userId, tenantId, role) {
  if (!tenantId) return { data: [] }
  if (!pagesResourceAvailable) return { data: [] }

  // APENAS Master: TODAS as páginas do tenant
  if (role === 'master') {
    const result = await supabase
      .from('pages')
      .select('id, slug, label, category, icon, order_index')
      .eq('tenant_id', tenantId)
      .order('order_index', { ascending: true })

    if (isMissingResource(result.error)) {
      pagesResourceAvailable = false
      return { data: [] }
    }

    if (!result.error) return { ...result, data: normalizePages(result.data) }
    return result
  }

  // Admin/Vendedor/Gerente/Financeiro: APENAS páginas autorizadas via pages_access
  if (!pagesAccessResourceAvailable) return { data: [] }

  const result = await supabase
    .from('pages_access')
    .select('page_id, pages!inner(id, slug, label, category, icon, order_index, tenant_id)')
    .eq('user_id', userId)
    .eq('tenant_id', tenantId)

  if (isMissingResource(result.error)) {
    pagesAccessResourceAvailable = false
    return { data: [] }
  }

  if (result.error) {
    console.error('Erro ao buscar páginas do usuário:', result.error)
    return { data: [], error: result.error }
  }

  // Extrai as páginas do relacionamento
  const pages = (result.data || [])
    .map(item => item.pages)
    .filter(Boolean)

  console.log('🔍 DEBUG - Páginas autorizadas para usuário:', pages.map(p => p.slug))

  return { data: normalizePages(pages), error: null }
}

export async function getTenantUsers(tenantId) {
  return supabase
    .from('users_perfil')
    .select('id, nome, role')
    .eq('tenant_id', tenantId)
    .order('role', { ascending: true })
}

export async function getTenantPages(tenantId) {
  if (!pagesResourceAvailable) return { data: [] }
  const result = await supabase
    .from('pages')
    .select('id, slug, label, category, icon')
    .eq('tenant_id', tenantId)
    .order('slug', { ascending: true })
  if (isMissingResource(result.error)) {
    pagesResourceAvailable = false
    return { data: [] }
  }
  if (!result.error) return { ...result, data: normalizePages(result.data) }
  return result
}

export async function getUserPageIds(userId) {
  if (!pagesAccessResourceAvailable) return { data: [], error: null }
  const result = await supabase
    .from('pages_access')
    .select('page_id')
    .eq('user_id', userId)
  if (isMissingResource(result.error)) {
    pagesAccessResourceAvailable = false
    return { data: [], error: null }
  }
  return { data: (result.data || []).map(item => item.page_id), error: result.error }
}

export async function saveUserPageAccess(userId, tenantId, pageIds) {
  if (!pagesAccessResourceAvailable) return { data: [] }
  const { error: deleteError } = await supabase
    .from('pages_access')
    .delete()
    .eq('user_id', userId)

  if (isMissingResource(deleteError)) {
    pagesAccessResourceAvailable = false
    return { data: [] }
  }
  if (deleteError) throw deleteError
  if (!Array.isArray(pageIds) || pageIds.length === 0) {
    return { data: [] }
  }

  const inserts = pageIds.map(page_id => ({ user_id: userId, page_id, tenant_id: tenantId }))
  return supabase.from('pages_access').insert(inserts)
}

export async function createPage(tenantId, page) {
  if (!pagesResourceAvailable) return { data: null, error: null }
  const result = await supabase
    .from('pages')
    .insert([{ tenant_id: tenantId, ...page }])
  if (isMissingResource(result.error)) {
    pagesResourceAvailable = false
    return { data: null, error: null }
  }
  return result
}

// Lista todas as empresas (para o master gerenciar)
export async function getAllTenants() {
  const { data, error } = await supabase
    .from('tenants')
    .select(`
      id,
      nome,
      cnpj,
      plano,
      ativo,
      created_at
    `)
    .order('nome')

  if (error) return { data: [], error }

  // Busca configurações de cada tenant para pegar nome_loja e whatsapp
  const tenantsComConfig = await Promise.all(
    (data || []).map(async (t) => {
      const { data: config } = await supabase
        .from('configuracoes')
        .select('nome_loja, whatsapp')
        .eq('tenant_id', t.id)
        .maybeSingle()

      return {
        tenant_id: t.id,
        nome_loja: config?.nome_loja || t.nome,
        whatsapp: config?.whatsapp || '',
        cnpj: t.cnpj,
        plano: t.plano,
        ativo: t.ativo,
        created_at: t.created_at
      }
    })
  )

  return { data: tenantsComConfig, error: null }
}

export async function getTenantAdmin(tenantId) {
  const { data } = await supabase
    .from('users_perfil')
    .select('id, nome, email, role')
    .eq('tenant_id', tenantId)
    .in('role', ['admin', 'master'])
    .order('role')
    .limit(1)
    .maybeSingle()
  return data
}

export async function updateTenantAdmin(userId, fields) {
  const { error } = await supabase
    .from('users_perfil')
    .update(fields)
    .eq('id', userId)
  if (error) throw error
}

export async function updateTenantInfo(tenantId, fields) {
  const { error } = await supabase
    .from('configuracoes')
    .update({ ...fields, updated_at: new Date().toISOString() })
    .eq('tenant_id', tenantId)
  if (error) throw error
}

export async function deleteTenant(tenantId) {
  // Ordem: pages_access → pages → users_perfil → configuracoes
  const { data: pages } = await supabase.from('pages').select('id').eq('tenant_id', tenantId)
  const pageIds = (pages || []).map(p => p.id)
  if (pageIds.length) {
    await supabase.from('pages_access').delete().in('page_id', pageIds)
    await supabase.from('pages').delete().eq('tenant_id', tenantId)
  }
  await supabase.from('users_perfil').delete().eq('tenant_id', tenantId)
  const { error } = await supabase.from('configuracoes').delete().eq('tenant_id', tenantId)
  if (error) throw error
}

// NÃO criamos perfil automaticamente para quem entra pelo Google.
// Quem cria acesso é o master/admin em Configurações → Usuários e Permissões
// (api/criar-usuario.js, que roda com service role). Qualquer criação automática
// aqui transformava qualquer pessoa com conta Google em usuário do sistema.
