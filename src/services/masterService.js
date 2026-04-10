import { supabase } from '../lib/supabase'

export async function createTenantAndAdmin(payload) {
  const timeoutMs = 20000

  const invokePromise = supabase.functions.invoke('create-tenant-admin', {
    body: payload,
  })

  const timeoutPromise = new Promise((_, reject) => {
    setTimeout(() => {
      reject(new Error('Tempo de resposta excedido ao criar empresa. Verifique se a função create-tenant-admin foi publicada no Supabase.'))
    }, timeoutMs)
  })

  return Promise.race([invokePromise, timeoutPromise])
}
