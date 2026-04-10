import { useEffect, useState } from 'react'
import { useNavigate, Link, useSearchParams } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

export default function LoginPage() {
  const { profile, loading, signIn, signInWithGoogle } = useAuth()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [googleLoading, setGoogleLoading] = useState(false)
  const [success, setSuccess] = useState('')

  useEffect(() => {
    if (!loading && profile) {
      navigate('/dashboard', { replace: true })
    }
  }, [loading, profile, navigate])

  useEffect(() => {
    if (searchParams.get('reset') === 'success') {
      setSuccess('✅ Senha resetada com sucesso! Você pode fazer login agora.')
      setError('')
    }
  }, [searchParams])

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
      const message = err.message || 'Erro ao efetuar login'
      if (message.toLowerCase().includes('email not confirmed') || message.toLowerCase().includes('not confirmed')) {
        setError('Email não confirmado. Verifique sua caixa de entrada ou desative confirmação de email no Supabase Auth.')
      } else {
        setError(message)
      }
    } finally {
      setSubmitting(false)
    }
  }

  const handleGoogleLogin = async () => {
    setError('')
    setGoogleLoading(true)
    try {
      await signInWithGoogle()
    } catch (err) {
      setError(err.message || 'Erro ao entrar com Google')
      setGoogleLoading(false)
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
          {success && <div style={{ color: 'var(--green)', padding: '10px 12px', borderRadius: '10px', background: 'rgba(74, 222, 128, 0.12)', fontWeight: 600 }}>{success}</div>}

          <button type="submit" className="btn-acao btn-blue" disabled={submitting}>
            {submitting ? 'Entrando...' : 'Acessar'}
          </button>

          <button type="button" className="btn-acao btn-ghost" disabled={googleLoading} onClick={handleGoogleLogin}>
            {googleLoading ? 'Redirecionando...' : 'Entrar com Google'}
          </button>
        </form>

        <div style={{ marginTop: '16px', display: 'flex', flexDirection: 'column', gap: '10px', fontSize: '14px', color: 'var(--muted)', textAlign: 'center' }}>
          <div>
            <Link to="/forgot-password" style={{ color: 'var(--blue)', textDecoration: 'none' }}>Esqueceu a senha?</Link>
          </div>
          <div>
            Cadastro de novos acessos somente pelo usuário master.
          </div>
        </div>
      </div>
    </div>
  )
}
