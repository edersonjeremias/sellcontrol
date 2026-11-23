import { useState, useEffect, useCallback } from 'react'
import { portalSb } from '../../lib/portalSupabase'

// ============================================================================
// A conta da cliente dentro da loja
// ============================================================================
// É a mesma conta do portal. A sessão fica no navegador, então entrar uma vez
// no celular vale para as próximas compras naquele aparelho — não adianta
// estar logada no computador.
//
// Entrar nunca é obrigatório: quem chega do Instagram compra sem conta. A
// conta serve para ser reconhecida, não digitar endereço de novo e poder
// guardar na sacolinha.
// ============================================================================

export default function useContaLoja() {
  const [token, setToken] = useState(null)
  const [instagram, setInstagram] = useState('')
  const [carregando, setCarregando] = useState(true)

  const aplicarSessao = useCallback(async (sessao) => {
    const acesso = sessao?.access_token || null
    setToken(acesso)

    if (!acesso) {
      setInstagram('')
      setCarregando(false)
      return
    }

    const { data } = await portalSb
      .from('portal_clientes')
      .select('instagram')
      .eq('user_id', sessao.user.id)
      .maybeSingle()

    setInstagram(data?.instagram || '')
    setCarregando(false)
  }, [])

  useEffect(() => {
    let vivo = true

    portalSb.auth.getSession().then(({ data }) => {
      if (vivo) aplicarSessao(data?.session)
    })

    const { data: { subscription } } = portalSb.auth.onAuthStateChange((_, sessao) => {
      if (vivo) aplicarSessao(sessao)
    })

    return () => { vivo = false; subscription.unsubscribe() }
  }, [aplicarSessao])

  const sair = useCallback(async () => {
    await portalSb.auth.signOut()
    setToken(null)
    setInstagram('')
  }, [])

  /**
   * Entra com o que a própria cliente acabou de informar na compra.
   *
   * A senha do portal é o número do WhatsApp (é assim que a loja cria o
   * acesso), então dá para deixá-la conectada sem pedir que ela digite nada
   * logo depois de pagar — que é quando ela menos quer preencher formulário.
   */
  const entrarComWhatsapp = useCallback(async (identificador, whatsapp) => {
    const insta = String(identificador || '').replace(/^@/, '').toLowerCase()
    const senha = String(whatsapp || '').replace(/\D/g, '')
    if (!insta || senha.length < 6) return false

    const { data, error } = await portalSb.auth.signInWithPassword({
      email: `${insta}@portal.vmkids.com.br`,
      password: senha,
    })
    if (error || !data?.session) return false

    await aplicarSessao(data.session)
    return true
  }, [aplicarSessao])

  return { token, instagram, carregando, sair, entrarComWhatsapp, aplicarSessao }
}
