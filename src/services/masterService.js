import { supabase } from '../lib/supabase'

export async function createTenantAndAdmin(payload) {
  const { data, error } = await supabase.functions.invoke('create-tenant-admin', {
    body: payload,
  })

  if (error) {
    // Tenta extrair a mensagem real do corpo da resposta da Edge Function
    let msg = error.message || 'Erro ao criar empresa.'
    try {
      const ctx = error.context
      if (ctx && typeof ctx.json === 'function') {
        const body = await ctx.json()
        if (body?.message) msg = body.message
      } else if (ctx && typeof ctx.text === 'function') {
        const text = await ctx.text()
        try { const parsed = JSON.parse(text); if (parsed?.message) msg = parsed.message } catch {}
      }
    } catch {}
    return { data: null, error: new Error(msg) }
  }

  return { data, error: null }
}
