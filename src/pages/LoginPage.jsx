import { useEffect, useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

export default function LoginPage() {
  const { profile, loading, signIn } = useAuth()
  const navigate = useNavigate()

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (!loading && profile) {
      navigate('/dashboard', { replace: true })
    }
  }, [loading, profile, navigate])

  const handleSubmit = async (event) => {
    event.preventDefault()
    setError('')
    if (!email || !password) {
      setError('Preencha email e senha')
      return
    }
    setSubmitting(true)
    try {
      await signIn(email.trim(), password)
      navigate('/dashboard', { replace: true })
    } catch (err) {
      setError(err.message || 'Erro ao efetuar login')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="login-screen">
      <div className="login-card">
        <div className="login-header">
          <h2>Login SaaS</h2>
          <p>Entre com seu email e senha para acessar o sistema.</p>
        </div>

        <form className="login-form" onSubmit={handleSubmit}>
          <label htmlFor="email">Email</label>
          <input
            id="email"
            type="email"
            placeholder="email@exemplo.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="username"
          />

          <label htmlFor="password">Senha</label>
          <input
            id="password"
            type="password"
            placeholder="Sua senha"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
          />

          {error && <div className="login-error">{error}</div>}

          <button type="submit" className="btn-acao btn-blue" disabled={submitting}>
            {submitting ? 'Entrando...' : 'Acessar'}
          </button>
        </form>

        <div style={{ marginTop: '16px', textAlign: 'center', fontSize: '14px', color: 'var(--muted)' }}>
          Não tem conta? <Link to="/signup" style={{ color: 'var(--blue)', textDecoration: 'none', fontWeight: 600 }}>Cadastre-se aqui</Link>
        </div>
      </div>
    </div>
  )
}
