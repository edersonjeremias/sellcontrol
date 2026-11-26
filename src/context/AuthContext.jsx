import { createContext, useContext, useEffect, useMemo, useState, useCallback, useRef } from 'react'
import { Navigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { siteUrl } from '../lib/siteUrl'
import { getUserProfile, getPagesForUser } from '../services/authService'
import { getMeusModulos } from '../services/modulosService'
import { moduloPorSlug, SLUGS_ESSENCIAIS, SLUGS_FORA_DO_CATALOGO } from '../lib/modulos'
import ModuloBloqueado from '../components/ui/ModuloBloqueado'

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
  // null = ainda não sei o que a empresa contratou (sessão carregando, ou a
  // migration de tenant_modulos ainda não rodou). Lista vazia trancaria todo
  // mundo fora; null faz o sistema seguir pelas páginas, como era antes.
  const [modulos,    setModulos]    = useState(null)
  const [isRecovery, setIsRecovery] = useState(_recoveryOnLoad)
  const [authError,  setAuthError]  = useState('')
  const [menuLoaded, setMenuLoaded] = useState(false)
  const initializedRef              = useRef(false)

  const loadProfile = useCallback(async (user) => {
    if (!user) {
      setProfile(null)
      setMenuItems([])
      setModulos(null)
      setMenuLoaded(false)
      return null
    }
    const { data, error } = await getUserProfile(user.id)
    if (error || !data) {
      // Sem perfil = sem acesso ao sistema. NÃO criamos perfil automaticamente:
      // era isso que transformava clientes com conta Google em usuários master.
      console.error('Perfil não encontrado', error)
      setAuthError('Este e-mail não tem acesso ao sistema. Peça ao administrador para criar seu usuário em Configurações → Usuários e Permissões.')
      setProfile(null)
      setMenuItems([])
      setModulos(null)
      setMenuLoaded(false)
      await supabase.auth.signOut()
      return null
    }
    // Verifica se o usuário está ativo
    if (data.ativo === false) {
      console.warn('Usuário inativo - fazendo logout')
      await supabase.auth.signOut()
      setProfile(null)
      setMenuItems([])
      setModulos(null)
      setMenuLoaded(false)
      return null
    }

    setProfile(data)
    setAuthError('')

    // O que a empresa contratou e o que esta pessoa pode abrir são duas
    // perguntas diferentes, e as duas valem: o módulo é da empresa, a página é
    // do usuário. Vão juntas numa ida só para não atrasar o login.
    const [pagesRes, modulosAtivos] = await Promise.all([
      getPagesForUser(data.id, data.tenant_id, data.role),
      getMeusModulos(),
    ])

    setModulos(modulosAtivos)

    if (pagesRes.error) {
      console.error('Erro ao carregar menu', pagesRes.error)
      setMenuItems([])
      setMenuLoaded(false)
    } else {
      const fetched = pagesRes.data || []

      // O menu mostra só o que a empresa tem contratado. `pages` é mantida em
      // sincronia ao salvar os módulos, mas se sobrar uma linha antiga ela
      // apareceria no menu levando a uma tela bloqueada.
      const visiveis = modulosAtivos === null
        ? fetched
        : fetched.filter(p =>
            modulosAtivos.includes(p.slug) ||
            SLUGS_ESSENCIAIS.includes(p.slug) ||
            SLUGS_FORA_DO_CATALOGO.includes(p.slug)
          )

      setMenuItems(visiveis)
    }
    setMenuLoaded(true)
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
        setModulos(null)
        setMenuLoaded(false)
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
        setModulos(null)
        setMenuLoaded(false)
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
      throw new Error('Este e-mail não tem acesso ao sistema. Peça ao administrador para criar seu usuário.')
    }
    return result
  }, [loadProfile])

  const signInWithGoogle = useCallback(async () => {
    const base = siteUrl()
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
    setModulos(null)
    setMenuLoaded(false)
    setSession(null)
    setIsRecovery(false)
    setAuthError('')
    initializedRef.current = false
    return result
  }, [])

  /**
   * A empresa contratou este módulo?
   *
   * Sem resposta do banco (modulos === null) devolve true: é o estado entre o
   * deploy e a migration, e barrar aí tiraria o sistema do ar de todo mundo.
   * O master do sistema (quem vende) enxerga tudo.
   */
  const temModulo = useCallback((slug) => {
    if (!slug) return false
    if (profile?.role === 'master') return true
    if (modulos === null) return true
    // Dashboard e Configurações vão junto com a assinatura. Mesmo que a linha
    // falte no banco, ninguém fica trancado fora do próprio sistema.
    if (SLUGS_ESSENCIAIS.includes(slug)) return true
    if (SLUGS_FORA_DO_CATALOGO.includes(slug)) return true
    return modulos.includes(slug)
  }, [modulos, profile?.role])

  const value = useMemo(() => ({
    loading,
    session,
    profile,
    menuItems,
    menuLoaded,
    modulos,
    temModulo,
    isRecovery,
    authError,
    signIn,
    signInWithGoogle,
    signOut,
  }), [loading, session, profile, menuItems, menuLoaded, modulos, temModulo, isRecovery, authError, signIn, signInWithGoogle, signOut])

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

// Protege a rota em três perguntas, nesta ordem:
//
//   1. a EMPRESA contratou o módulo?        → senão, tela de não contratado
//   2. o CARGO dessa pessoa abre essa tela? → senão, volta para o início
//   3. a PÁGINA está liberada para ela?     → senão, primeira que ela pode ver
//
// Sem isso o menu só escondia o item — quem digitasse a URL entrava assim mesmo.
function PageGuard({ slug, children }) {
  const { profile, menuItems, menuLoaded, temModulo } = useAuth()

  // O master do sistema (quem vende) enxerga tudo, em qualquer empresa.
  if (profile?.role === 'master') return children

  // Espera o carregamento: decidir antes mostraria a tela por um instante
  // para depois trocar por "não contratado".
  if (!menuLoaded) return <div style={{ padding: 24, color: '#fff' }}>Carregando...</div>

  // 1. Contrato da empresa. Vale até para quem administra a empresa: o módulo
  //    é da assinatura, não do cargo.
  if (!temModulo(slug)) return <ModuloBloqueado slug={slug} />

  // 2. Cargo. Telas como Configurações, RH, Cupons e Avisos são de quem
  //    administra a empresa: nelas o cargo é a permissão, e não se depende da
  //    página estar marcada em Usuários e Permissões — era assim antes dos
  //    módulos, e quem administra a empresa não pode perder as Configurações
  //    por causa de uma caixinha desmarcada.
  const rolesPermitidos = moduloPorSlug(slug)?.roles
  if (rolesPermitidos) {
    if (profile && rolesPermitidos.includes(profile.role)) return children
    return <Navigate to="/dashboard" replace />
  }

  // 3. Permissão de página, por usuário.
  if (menuItems.some((p) => p.slug === slug)) return children

  // Sem acesso: manda para a primeira página que a pessoa pode abrir
  const primeira = menuItems[0]
  if (primeira) return <Navigate to={`/${primeira.slug}`} replace />

  return (
    <div style={{ padding: 24, color: '#fff', lineHeight: 1.6 }}>
      Você não tem acesso a nenhuma página.<br />
      Peça ao administrador para liberar em <strong>Configurações → Usuários e Permissões</strong>.
    </div>
  )
}

export function RequirePage({ slug, children }) {
  return (
    <RequireAuth>
      <PageGuard slug={slug}>{children}</PageGuard>
    </RequireAuth>
  )
}

/**
 * Só o contrato da empresa, sem olhar permissão de página.
 *
 * Para tela que é de todo mundo da empresa quando o módulo existe — o
 * quiosque de ponto é o caso: a funcionária bate o ponto sem ter página
 * liberada em Usuários e Permissões.
 */
export function RequireModulo({ slug, children }) {
  const { temModulo } = useAuth()
  return (
    <RequireAuth>
      {temModulo(slug) ? children : <ModuloBloqueado slug={slug} />}
    </RequireAuth>
  )
}

export function RequireRole({ allowed, children }) {
  const { profile } = useAuth()
  if (!profile) return null
  if (!allowed.includes(profile.role)) return <Navigate to="/dashboard" replace />
  return children
}
