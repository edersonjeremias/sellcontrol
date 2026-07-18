import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL
const key = import.meta.env.VITE_SUPABASE_ANON_KEY

// Cliente separado para o portal — usa storageKey próprio para não
// conflitar com a sessão do painel interno (vmk_auth).
const _k = '__portal_sb__'
if (!globalThis[_k]) {
  globalThis[_k] = createClient(url, key, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: false,
      storageKey: 'portal_auth',
    },
  })
}

export const portalSb = globalThis[_k]
