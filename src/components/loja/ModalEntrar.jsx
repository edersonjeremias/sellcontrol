import { useState } from 'react'
import { portalSb } from '../../lib/portalSupabase'

// ============================================================================
// Entrar com a conta do portal, de dentro do checkout
// ============================================================================
// Mesma conta e mesma senha do portal do cliente: entra pelo @ do Instagram,
// e a senha padrão é o número do WhatsApp (é assim que a loja cria o acesso).
//
// Entrar aqui serve para a cliente não virar um cadastro novo a cada compra —
// e para ela não digitar endereço que o sistema já tem.
// ============================================================================

export default function ModalEntrar({ onFechar, onEntrou }) {
  const [instagram, setInstagram] = useState('')
  const [senha, setSenha] = useState('')
  const [erro, setErro] = useState('')
  const [entrando, setEntrando] = useState(false)

  async function entrar(e) {
    e.preventDefault()
    const insta = instagram.trim().replace(/^@/, '').toLowerCase()
    if (!insta || !senha) {
      setErro('Preencha o Instagram e a senha.')
      return
    }

    setErro('')
    setEntrando(true)
    try {
      const { data, error } = await portalSb.auth.signInWithPassword({
        email: `${insta}@portal.vmkids.com.br`,
        password: senha,
      })
      if (error || !data?.session?.access_token) throw error || new Error('sem sessão')
      onEntrou(data.session.access_token)
    } catch {
      setErro('Instagram ou senha incorretos.')
    } finally {
      setEntrando(false)
    }
  }

  return (
    <div className="loja-painel-fundo" onClick={onFechar}>
      <div className="loja-painel" onClick={e => e.stopPropagation()}>
        <div className="loja-painel-topo">
          <h2>Entrar</h2>
          <button type="button" className="loja-fechar" onClick={onFechar} aria-label="Fechar">×</button>
        </div>

        <form onSubmit={entrar} className="loja-form" style={{ gridTemplateColumns: '1fr' }}>
          <label className="loja-campo">
            <span>Seu Instagram</span>
            <input
              value={instagram}
              onChange={e => setInstagram(e.target.value)}
              placeholder="@seuinstagram"
              autoCapitalize="none"
              autoComplete="username"
              spellCheck={false}
            />
          </label>

          <label className="loja-campo">
            <span>Senha</span>
            <input
              type="password"
              value={senha}
              onChange={e => setSenha(e.target.value)}
              placeholder="••••••••"
              autoComplete="current-password"
            />
          </label>

          {erro && <p className="loja-nota" style={{ color: 'var(--p-red)' }}>{erro}</p>}

          <button type="submit" className="loja-btn largo" disabled={entrando}>
            {entrando ? 'Entrando…' : 'Entrar'}
          </button>
        </form>

        <p className="loja-painel-nota">
          É a mesma conta do portal do cliente. Se você nunca entrou, a senha é o número do
          seu WhatsApp, só os números. Primeira compra aqui? Pode fechar e preencher seus
          dados normalmente.
        </p>
      </div>
    </div>
  )
}
