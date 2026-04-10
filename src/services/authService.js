import { supabase } from '../lib/supabase'

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
