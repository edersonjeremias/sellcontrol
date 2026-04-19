import { createContext, useContext, useEffect, useMemo, useState, useCallback } from 'react'
import { Navigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { getUserProfile, getPagesForUser, createGoogleUserProfile } from '../services/authService'

const AuthContext = createContext(null)

const DEFAULT_PAGES = [
  { slug: 'dashboard', label: 'Dashboard', category: 'Principal', icon: 'dashboard', order_index: 10 },
  { slug: 'vendas', label: 'Vendas', category: 'Operações', icon: 'sell', order_index: 20 },
  { slug: 'producao', label: 'Produção', category: 'Operações', icon: 'factory', order_index: 30 },
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
      return null
    }
    const { data, error } = await getUserProfile(user.id)
    if (error || !data) {
      // Auto-cria perfil para quem entra pela primeira vez via Google OAuth
      const isGoogle =
        user.app_metadata?.provider === 'google' ||
        (user.identities || []).some((i) => i.provider === 'google')
      const tenantId = import.meta.env.VITE_TENANT_ID
      if (isGoogle && tenantId) {
        const created = await createGoogleUserProfile(user, tenantId)
        if (created) {
          setProfile(created)
          setMenuItems(DEFAULT_PAGES)
          return created
        }
      }
      console.error('Perfil não encontrado', error)
      setProfile(null)
      setMenuItems(DEFAULT_PAGES)
      return null
    }
    setProfile(data)
    const pagesRes = await getPagesForUser(data.id, data.tenant_id, data.role)
    if (pagesRes.error) {
      console.error('Erro ao carregar menu', pagesRes.error)
      setMenuItems(DEFAULT_PAGES)
    } else {
      const fetched = pagesRes.data || []
      if (data.role === 'master') {
        const bySlug = new Map(DEFAULT_PAGES.map((item) => [item.slug, item]))
        fetched.forEach((item) => bySlug.set(item.slug, item))
        const merged = Array.from(bySlug.values())
          .sort((a, b) => (a.order_index || 999) - (b.order_index || 999))
        setMenuItems(merged)
      } else {
        setMenuItems(fetched.length > 0 ? fetched : DEFAULT_PAGES)
      }
    }
    return data
  }, [])

  useEffect(() => {
    let subscription = null

    async function init() {
      try {
        await Promise.race([
          (async () => {
            const { data } = await supabase.auth.getSession()
            setSession(data?.session ?? null)
            await loadProfile(data?.session?.user)
          })(),
          new Promise(resolve => setTimeout(resolve, 6000)),
        ])
      } catch (e) {
        console.error('Auth init error:', e)
      } finally {
        setLoading(false)
      }
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
    const profileData = await loadProfile(result.data.session?.user)
    setSession(result.data.session)
    if (!profileData) {
      throw new Error('Login feito, mas o perfil não existe em users_perfil. Crie o perfil manualmente no Supabase ou use outro email.')
    }
    return result
  }, [loadProfile])

  const signInWithGoogle = useCallback(async () => {
    const redirectTo = `${window.location.origin}/dashboard`
    const result = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo },
    })
    if (result.error) throw result.error
    return result
  }, [])

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
    signInWithGoogle,
    signOut,
  }), [loading, session, profile, menuItems, signIn, signInWithGoogle, signOut])

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
