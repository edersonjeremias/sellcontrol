import { createClient } from '@supabase/supabase-js'

const supabaseUrl     = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Crie o arquivo .env com VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY')
}

// Singleton — garante uma única instância no browser (evita warning Multiple GoTrueClient)
const _key = '__supabase_client__'
if (!globalThis[_key]) {
  globalThis[_key] = createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
      storageKey: 'vmk_auth',
    }
  })
}

export const supabase = globalThis[_key]
export const supabasePublic = supabase
