import { createContext, useContext, useEffect, useMemo, useState, useCallback, useRef } from 'react'
import { Navigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { getUserProfile, getPagesForUser, createGoogleUserProfile } from '../services/authService'

const AuthContext = createContext(null)

// Captura o hash ANTES de o Supabase limpá-lo da URL.
// Supabase limpa o hash de forma assíncrona, então esta verificação
// a nível de módulo pega o valor original no carregamento inicial da página.
const _recoveryOnLoad =
  typeof window !== 'undefined' && window.location.hash.includes('type=recovery')

export function AuthProvider({ children }) {
  const [loading,    setLoading]    = useState(true)
  const [session,    setSession]    = useState(null)
  const [profile,    setProfile]    = useState(null)
  const [menuItems,  setMenuItems]  = useState([])
  const [isRecovery, setIsRecovery] = useState(_recoveryOnLoad)
  const initializedRef              = useRef(false)

  const loadProfile = useCallback(async (user) => {
    if (!user) {
      setProfile(null)
      setMenuItems([])
      return null
    }
    const { data, error } = await getUserProfile(user.id)
    if (error || !data) {
      const isGoogle =
        user.app_metadata?.provider === 'google' ||
        (user.identities || []).some((i) => i.provider === 'google')
      const tenantId = import.meta.env.VITE_TENANT_ID
      if (isGoogle && tenantId) {
        const created = await createGoogleUserProfile(user, tenantId)
        if (created) {
          setProfile(created)
          setMenuItems([])
          return created
        }
      }
      console.error('Perfil não encontrado', error)
      setProfile(null)
      setMenuItems([])
      return null
    }
    // Verifica se o usuário está ativo
    if (data.ativo === false) {
      console.warn('Usuário inativo - fazendo logout')
      await supabase.auth.signOut()
      setProfile(null)
      setMenuItems([])
      return null
    }

    setProfile(data)
    const pagesRes = await getPagesForUser(data.id, data.tenant_id, data.role)
    if (pagesRes.error) {
      console.error('Erro ao carregar menu', pagesRes.error)
      setMenuItems([])
    } else {
      const fetched = pagesRes.data || []
      console.log('🔍 DEBUG - Páginas retornadas do banco:', fetched)
      console.log('🔍 DEBUG - Total de páginas:', fetched.length)
      console.log('🔍 DEBUG - Slugs:', fetched.map(p => p.slug))

      // Todas as roles (master, admin, vendedor) usam apenas as páginas do banco
      setMenuItems(fetched)
    }
    return data
  }, [])

  useEffect(() => {
    let isMounted = true

    const safetyTimeout = setTimeout(() => {
      if (isMounted) setLoading(false)
    }, 8000)

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, sess) => {
      if (!isMounted) return

      if (event === 'INITIAL_SESSION') {
        setSession(sess)
        // Se for fluxo de recuperação de senha, NÃO faz login normal —
        // aguarda o evento PASSWORD_RECOVERY redirecionar para /reset-password
        if (sess?.user && !_recoveryOnLoad) {
          await loadProfile(sess.user)
        }
        clearTimeout(safetyTimeout)
        if (isMounted) setLoading(false)
        initializedRef.current = true

      } else if (event === 'PASSWORD_RECOVERY') {
        // Supabase confirmou que é um fluxo de reset — bloqueia login normal
        setSession(sess)
        setProfile(null)
        setMenuItems([])
        setIsRecovery(true)
        if (isMounted) setLoading(false)

      } else if (event === 'SIGNED_IN') {
        setSession(sess)
        if (sess?.user && initializedRef.current && !isRecovery) {
          await loadProfile(sess.user)
        }

      } else if (event === 'TOKEN_REFRESHED') {
        setSession(sess)

      } else if (event === 'SIGNED_OUT') {
        setSession(null)
        setProfile(null)
        setMenuItems([])
        setIsRecovery(false)
        if (isMounted) setLoading(false)
      }
    })

    return () => {
      isMounted = false
      clearTimeout(safetyTimeout)
      subscription.unsubscribe()
    }
  }, [loadProfile]) // isRecovery não entra nas deps para evitar re-subscribe

  // ── Realtime: Monitora se usuário foi inativado ──
  useEffect(() => {
    if (!profile?.id) return

    const channel = supabase
      .channel(`user-status-${profile.id}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'users_perfil',
          filter: `id=eq.${profile.id}`,
        },
        async (payload) => {
          const novoAtivo = payload.new?.ativo
          if (novoAtivo === false) {
            console.warn('⚠️ Usuário foi inativado - fazendo logout imediato')
            await supabase.auth.signOut()
          }
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [profile?.id])

  const signIn = useCallback(async (email, password) => {
    const result = await supabase.auth.signInWithPassword({ email, password })
    if (result.error) throw result.error
    const profileData = await loadProfile(result.data.session?.user)
    setSession(result.data.session)
    initializedRef.current = true
    if (!profileData) {
      throw new Error('Login feito, mas o perfil não existe em users_perfil. Crie o perfil manualmente no Supabase ou use outro email.')
    }
    return result
  }, [loadProfile])

  const signInWithGoogle = useCallback(async () => {
    const base = import.meta.env.VITE_SITE_URL?.replace(/\/$/, '') || window.location.origin
    const result = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: `${base}/dashboard` },
    })
    if (result.error) throw result.error
    return result
  }, [])

  const signOut = useCallback(async () => {
    const result = await supabase.auth.signOut()
    setProfile(null)
    setMenuItems([])
    setSession(null)
    setIsRecovery(false)
    initializedRef.current = false
    return result
  }, [])

  const value = useMemo(() => ({
    loading,
    session,
    profile,
    menuItems,
    isRecovery,
    signIn,
    signInWithGoogle,
    signOut,
  }), [loading, session, profile, menuItems, isRecovery, signIn, signInWithGoogle, signOut])

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth deve ser usado dentro de AuthProvider')
  return ctx
}

export function RequireAuth({ children }) {
  const { loading, session, profile, isRecovery } = useAuth()
  if (loading) return <div style={{ padding: 24, color: '#fff' }}>Carregando...</div>
  // Fluxo de reset de senha — redireciona para a página correta
  if (isRecovery) return <Navigate to="/reset-password" replace />
  // Tem sessão mas o profile ainda não veio (DB lento) → aguarda
  if (session && !profile) return <div style={{ padding: 24, color: '#fff' }}>Carregando...</div>
  if (!profile) return <Navigate to="/login" replace />
  return children
}

export function RequireRole({ allowed, children }) {
  const { profile } = useAuth()
  if (!profile) return null
  if (!allowed.includes(profile.role)) return <Navigate to="/dashboard" replace />
  return children
}
