import { useState, useEffect } from 'react'
import { usePortalAuth } from '../../context/PortalAuthContext'
import { supabase } from '../../lib/supabase'

export default function PortalLoginPage() {
  const { login }           = usePortalAuth()
  const [instagram, setInstagram] = useState('')
  const [senha, setSenha]         = useState('')
  const [erro, setErro]           = useState('')
  const [loading, setLoading]     = useState(false)
  const [nomeEmpresa, setNomeEmpresa] = useState('Carregando...')

  useEffect(() => {
    // Buscar nome da empresa
    const tenantId = import.meta.env.VITE_TENANT_ID
    if (tenantId) {
      supabase
        .from('configuracoes')
        .select('nome_loja')
        .eq('tenant_id', tenantId)
        .single()
        .then(({ data }) => {
          if (data?.nome_loja) {
            setNomeEmpresa(data.nome_loja)
          } else {
            setNomeEmpresa('Portal do Cliente')
          }
        })
        .catch(() => setNomeEmpresa('Portal do Cliente'))
    } else {
      setNomeEmpresa('Portal do Cliente')
    }
  }, [])

  async function handleSubmit(e) {
    e.preventDefault()
    if (!instagram.trim() || !senha) {
      setErro('Preencha o Instagram e a senha.')
      return
    }
    setErro('')
    setLoading(true)
    try {
      await login(instagram, senha)
    } catch {
      setErro('Instagram ou senha incorretos.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="portal-login-wrap">
      <div className="portal-login-card">
        <div className="portal-login-logo">{nomeEmpresa}</div>
        <div className="portal-login-subtitle">Painel do Cliente</div>

        <form onSubmit={handleSubmit} style={{ display:'flex', flexDirection:'column', gap:14 }}>
          <div className="portal-field">
            <label className="portal-label">Instagram</label>
            <input
              className="portal-input"
              type="text"
              placeholder="@seuinstagram"
              value={instagram}
              onChange={e => setInstagram(e.target.value)}
              autoComplete="username"
              autoCapitalize="none"
              spellCheck={false}
            />
          </div>

          <div className="portal-field">
            <label className="portal-label">Senha</label>
            <input
              className="portal-input"
              type="password"
              placeholder="••••••••"
              value={senha}
              onChange={e => setSenha(e.target.value)}
              autoComplete="current-password"
            />
          </div>

          {erro && (
            <div style={{
              background: 'rgba(242,139,130,.12)',
              border: '1px solid rgba(242,139,130,.3)',
              borderRadius: 8,
              padding: '10px 14px',
              color: 'var(--p-red)',
              fontSize: 13,
            }}>
              {erro}
            </div>
          )}

          <button
            type="submit"
            className="portal-btn portal-btn-blue"
            style={{ width:'100%', marginTop:4 }}
            disabled={loading}
          >
            {loading ? 'Entrando...' : 'Entrar'}
          </button>
        </form>

        <div style={{ marginTop:22, textAlign:'center', fontSize:12, color:'var(--p-muted)' }}>
          Não tem acesso? Fale com a loja.
        </div>
      </div>
    </div>
  )
}
