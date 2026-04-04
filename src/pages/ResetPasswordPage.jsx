import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'

export default function ResetPasswordPage() {
  const navigate = useNavigate()
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [tokenValid, setTokenValid] = useState(null)

  // Verifica se o token do URL é válido
  useEffect(() => {
    const checkToken = async () => {
      const hash = window.location.hash
      if (!hash.includes('access_token')) {
        setTokenValid(false)
        setError('Link inválido ou expirado. Peça um novo link de reset.')
        return
      }
      setTokenValid(true)
    }
    checkToken()
  }, [])

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')

    if (password.length < 6) {
      setError('Senha deve ter mínimo 6 caracteres')
      return
    }

    if (password !== confirmPassword) {
      setError('Senhas não conferem')
      return
    }

    setLoading(true)
    try {
      const { error: updateError } = await supabase.auth.updateUser({ password })
      if (updateError) throw updateError

      // Faz logout pós-reset
      await supabase.auth.signOut()

      // Redireciona para login
      setTimeout(() => {
        navigate('/?reset=success')
      }, 1500)

      setError('✅ Senha resetada! Redirecionando para login...')
    } catch (err) {
      console.error(err)
      setError(err.message || 'Erro ao resetar senha')
    } finally {
      setLoading(false)
    }
  }

  if (tokenValid === false) {
    return (
      <div className="login-screen">
        <div className="login-card">
          <div className="login-header">
            <h2>Link expirado</h2>
          </div>
          <div style={{ color: 'var(--red)', padding: '10px 12px', borderRadius: '10px', background: 'rgba(242, 139, 130, 0.12)', fontWeight: 600, marginBottom: '16px' }}>
            Este link de reset é inválido ou expirou (válido por 24h).
          </div>
          <button className="btn-acao btn-blue" onClick={() => navigate('/')}>
            Voltar para login
          </button>
        </div>
      </div>
    )
  }

  if (tokenValid === null) {
    return <div style={{ padding: '24px', color: '#fff', textAlign: 'center' }}>Carregando...</div>
  }

  return (
    <div className="login-screen">
      <div className="login-card">
        <div className="login-header">
          <h2>Nova Senha</h2>
          <p>Digite sua nova senha para recuperar o acesso.</p>
        </div>

        <form className="login-form" onSubmit={handleSubmit}>
          <label htmlFor="password">Nova Senha</label>
          <input
            id="password"
            type="password"
            placeholder="Mínimo 6 caracteres"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="new-password"
          />

          <label htmlFor="confirmPassword">Confirmar Senha</label>
          <input
            id="confirmPassword"
            type="password"
            placeholder="Repetir senha"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            autoComplete="new-password"
          />

          {error && (
            <div style={{
              color: error.includes('✅') ? 'var(--green)' : 'var(--red)',
              padding: '10px 12px',
              borderRadius: '10px',
              background: error.includes('✅') ? 'rgba(74, 222, 128, 0.12)' : 'rgba(242, 139, 130, 0.12)',
              fontWeight: 600
            }}>
              {error}
            </div>
          )}

          <button type="submit" className="btn-acao btn-blue" disabled={loading}>
            {loading ? 'Atualizando...' : 'Resetar Senha'}
          </button>
        </form>
      </div>
    </div>
  )
}
