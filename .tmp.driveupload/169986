import { createContext, useContext, useState, useEffect } from 'react'
import { portalSb } from '../lib/portalSupabase'

const Ctx = createContext(null)

export function PortalAuthProvider({ children }) {
  const [cliente, setCliente] = useState(null)
  const [loading, setLoading] = useState(true)

  async function loadCliente(uid) {
    const { data } = await portalSb
      .from('portal_clientes')
      .select('*')
      .eq('user_id', uid)
      .single()
    setCliente(data || null)
    setLoading(false)
  }

  useEffect(() => {
    portalSb.auth.getSession().then(({ data: { session } }) => {
      if (session?.user) loadCliente(session.user.id)
      else setLoading(false)
    })

    const { data: { subscription } } = portalSb.auth.onAuthStateChange((_, session) => {
      if (session?.user) loadCliente(session.user.id)
      else { setCliente(null); setLoading(false) }
    })

    return () => subscription.unsubscribe()
  }, [])

  async function login(instagram, senha) {
    const insta = instagram.trim().replace(/^@/, '').toLowerCase()
    const email = `${insta}@portal.vmkids.com.br`
    const { error } = await portalSb.auth.signInWithPassword({ email, password: senha })
    if (error) throw error
  }

  async function logout() {
    await portalSb.auth.signOut()
    setCliente(null)
  }

  async function refreshCliente() {
    const { data: { session } } = await portalSb.auth.getSession()
    if (session?.user) await loadCliente(session.user.id)
  }

  return (
    <Ctx.Provider value={{ cliente, loading, login, logout, refreshCliente }}>
      {children}
    </Ctx.Provider>
  )
}

export const usePortalAuth = () => useContext(Ctx)
