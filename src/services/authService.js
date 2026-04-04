import { supabase } from '../lib/supabase'

export async function getUserProfile(userId) {
  return supabase
    .from('users_perfil')
    .select('id, nome, role, tenant_id')
    .eq('id', userId)
    .single()
}

export async function getPagesForUser(userId, tenantId, role) {
  if (!tenantId) return { data: [] }
  if (role === 'master') {
    return supabase
      .from('pages')
      .select('id, slug, label, category, icon, order_index')
      .eq('tenant_id', tenantId)
      .order('order_index', { ascending: true })
  }
  const accessRes = await supabase
    .from('pages_access')
    .select('page_id')
    .eq('user_id', userId)

  if (accessRes.error) return accessRes
  const pageIds = (accessRes.data || []).map(item => item.page_id)
  if (!pageIds.length) return { data: [] }

  return supabase
    .from('pages')
    .select('id, slug, label, category, icon, order_index')
    .eq('tenant_id', tenantId)
    .in('id', pageIds)
    .order('order_index', { ascending: true })
}

export async function getTenantUsers(tenantId) {
  return supabase
    .from('users_perfil')
    .select('id, nome, role')
    .eq('tenant_id', tenantId)
    .order('role', { ascending: true })
}

export async function getTenantPages(tenantId) {
  return supabase
    .from('pages')
    .select('id, slug, label, category, icon, order_index')
    .eq('tenant_id', tenantId)
    .order('order_index', { ascending: true })
}

export async function getUserPageIds(userId) {
  const result = await supabase
    .from('pages_access')
    .select('page_id')
    .eq('user_id', userId)
  return { data: (result.data || []).map(item => item.page_id), error: result.error }
}

export async function saveUserPageAccess(userId, tenantId, pageIds) {
  const { error: deleteError } = await supabase
    .from('pages_access')
    .delete()
    .eq('user_id', userId)

  if (deleteError) throw deleteError
  if (!Array.isArray(pageIds) || pageIds.length === 0) {
    return { data: [] }
  }

  const inserts = pageIds.map(page_id => ({ user_id: userId, page_id, tenant_id: tenantId }))
  return supabase.from('pages_access').insert(inserts)
}

export async function createPage(tenantId, page) {
  return supabase
    .from('pages')
    .insert([{ tenant_id: tenantId, ...page }])
}
