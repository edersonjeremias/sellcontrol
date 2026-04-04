import { createContext, useContext, useEffect, useMemo, useState, useCallback } from 'react'
import { useNavigate, Navigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { getUserProfile, getPagesForUser } from '../services/authService'

const AuthContext = createContext(null)

const DEFAULT_PAGES = [
  { slug: 'dashboard', label: 'Dashboard', category: 'Principal', icon: 'dashboard', order_index: 10 },
  { slug: 'vendas', label: 'Vendas', category: 'Operações', icon: 'sell', order_index: 20 },
]

export function AuthProvider({ children }) {
  const [loading, setLoading] = useState(true)
  const [session, setSession] = useState(null)
  const [profile, setProfile] = useState(null)
  const [menuItems, setMenuItems] = useState(DEFAULT_PAGES)

  const loadProfile = useCallback(async (user) => {
    if (!user) {
      setProfile(null)
      setMenuItems(DEFAULT_PAGES)
      return
    }
    const { data, error } = await getUserProfile(user.id)
    if (error || !data) {
      console.error('Perfil não encontrado', error)
      setProfile(null)
      setMenuItems(DEFAULT_PAGES)
      return
    }
    setProfile(data)
    const pagesRes = await getPagesForUser(data.id, data.tenant_id, data.role)
    if (pagesRes.error) {
      console.error('Erro ao carregar menu', pagesRes.error)
      setMenuItems(DEFAULT_PAGES)
    } else {
      setMenuItems(pagesRes.data && pagesRes.data.length > 0 ? pagesRes.data : DEFAULT_PAGES)
    }
  }, [])

  useEffect(() => {
    let subscription = null

    async function init() {
      const { data } = await supabase.auth.getSession()
      setSession(data?.session ?? null)
      await loadProfile(data?.session?.user)
      setLoading(false)
    }

    init()

    const { data: listener } = supabase.auth.onAuthStateChange(async (_event, session) => {
      setSession(session)
      await loadProfile(session?.user)
    })
    subscription = listener?.subscription

    return () => {
      if (subscription?.unsubscribe) {
        subscription.unsubscribe()
      }
    }
  }, [loadProfile])

  const signIn = useCallback(async (email, password) => {
    const result = await supabase.auth.signInWithPassword({ email, password })
    if (result.error) throw result.error
    await loadProfile(result.data.session?.user)
    setSession(result.data.session)
    return result
  }, [loadProfile])

  const signOut = useCallback(async () => {
    const result = await supabase.auth.signOut()
    setProfile(null)
    setMenuItems(DEFAULT_PAGES)
    setSession(null)
    return result
  }, [])

  const value = useMemo(() => ({
    loading,
    session,
    profile,
    menuItems,
    signIn,
    signOut,
  }), [loading, session, profile, menuItems, signIn, signOut])

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth deve ser usado dentro de AuthProvider')
  return ctx
}

export function RequireAuth({ children }) {
  const { loading, profile } = useAuth()
  if (loading) return <div style={{ padding: 24, color: '#fff' }}>Carregando...</div>
  if (!profile) return <Navigate to="/login" replace />
  return children
}

export function RequireRole({ allowed, children }) {
  const { profile } = useAuth()
  if (!profile) return null
  if (!allowed.includes(profile.role)) return <Navigate to="/dashboard" replace />
  return children
}
