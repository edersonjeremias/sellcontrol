import { supabase } from '../lib/supabase'

// Catálogo completo de páginas disponíveis no sistema
export const ALL_PAGES = [
  { slug: 'dashboard',                   label: 'Dashboard',                 category: 'Principal',  icon: 'dashboard',      order_index: 10 },
  { slug: 'vendas',                      label: 'Vendas',                    category: 'Operações',  icon: 'sell',           order_index: 20 },
  { slug: 'producao',                    label: 'Produção',                  category: 'Operações',  icon: 'factory',        order_index: 30 },
  { slug: 'expedicao',                   label: 'Expedição',                 category: 'Operações',  icon: 'local_shipping', order_index: 35 },
  { slug: 'impressao-sacolinha',         label: 'Impressão Sacolinha',       category: 'Operações',  icon: 'local_offer',    order_index: 40 },
  { slug: 'impressao-pedidos',           label: 'Impressão Pedidos',         category: 'Operações',  icon: 'receipt_long',   order_index: 45 },
  { slug: 'impressao-sacolinha-cliente', label: 'Impressão Sacol. Cliente',  category: 'Operações',  icon: 'shopping_bag',   order_index: 50 },
  { slug: 'etiquetas',                   label: 'Etiquetas',                 category: 'Operações',  icon: 'label',          order_index: 55 },
  { slug: 'cobrancas',                   label: 'Cobranças',                 category: 'Financeiro', icon: 'payments',       order_index: 60 },
]

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
    .select('id, nome, role, tenant_id')
    .eq('id', userId)
    .single()
}

export async function getPagesForUser(userId, tenantId, role) {
  if (!tenantId) return { data: [] }
  if (!pagesResourceAvailable) return { data: [] }
  if (role === 'master') {
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
  if (!pagesAccessResourceAvailable) return { data: [] }
  const accessRes = await supabase
    .from('pages_access')
    .select('page_id')
    .eq('user_id', userId)

  if (isMissingResource(accessRes.error)) {
    pagesAccessResourceAvailable = false
    return { data: [] }
  }
  if (accessRes.error) return accessRes
  const pageIds = (accessRes.data || []).map(item => item.page_id)
  if (!pageIds.length) return { data: [] }

  const pagesRes = await supabase
    .from('pages')
    .select('id, slug, label, category, icon')
    .eq('tenant_id', tenantId)
    .in('id', pageIds)
    .order('slug', { ascending: true })
  if (isMissingResource(pagesRes.error)) {
    pagesResourceAvailable = false
    return { data: [] }
  }
  if (!pagesRes.error) return { ...pagesRes, data: normalizePages(pagesRes.data) }
  return pagesRes
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
    .from('configuracoes')
    .select('tenant_id, nome_loja, whatsapp')
    .order('nome_loja')
  return { data: data || [], error }
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

// Sincroniza quais páginas uma empresa pode usar (master)
export async function saveTenantPages(tenantId, slugs) {
  const { data: current } = await supabase
    .from('pages').select('id, slug').eq('tenant_id', tenantId)

  const currentMap = new Map((current || []).map(p => [p.slug, p.id]))
  const currentSlugs = new Set(currentMap.keys())
  const newSlugs = new Set(slugs)

  const toRemoveSlugs = [...currentSlugs].filter(s => !newSlugs.has(s))
  const toRemoveIds   = toRemoveSlugs.map(s => currentMap.get(s)).filter(Boolean)
  const toAddSlugs    = [...newSlugs].filter(s => !currentSlugs.has(s))

  if (toRemoveIds.length > 0) {
    await supabase.from('pages_access').delete().in('page_id', toRemoveIds)
    await supabase.from('pages').delete().eq('tenant_id', tenantId).in('slug', toRemoveSlugs)
  }

  if (toAddSlugs.length > 0) {
    const rows = toAddSlugs.map(slug => {
      const p = ALL_PAGES.find(x => x.slug === slug)
      return { tenant_id: tenantId, slug, label: p?.label || slug, category: p?.category || '', icon: p?.icon || '', order_index: p?.order_index || 99 }
    })
    const { error } = await supabase.from('pages').insert(rows)
    if (error) throw error
  }
}

// Cria perfil automático para usuários que entram pela primeira vez via Google OAuth
export async function createGoogleUserProfile(user, tenantId) {
  const nome =
    user.user_metadata?.full_name ||
    user.user_metadata?.name ||
    user.email?.split('@')[0] ||
    'Usuário Google'
  const { data, error } = await supabase
    .from('users_perfil')
    .insert([{ id: user.id, tenant_id: tenantId, role: 'master', nome, email: user.email || '' }])
    .select('id, nome, role, tenant_id')
    .single()
  if (error) {
    console.error('Erro ao criar perfil para usuário Google:', error)
    return null
  }
  return data
}
