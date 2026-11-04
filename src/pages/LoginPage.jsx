import { useEffect, useState } from 'react'
import { useNavigate, Link, useSearchParams } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { emailsPossiveis } from '../lib/emailInterno'

export default function LoginPage() {
  const { profile, loading, signIn, signInWithGoogle, authError } = useAuth()
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
      setError('Preencha username/email e senha')
      return
    }
    setSubmitting(true)
    try {
      const loginValue = email.trim()

      if (loginValue.includes('@')) {
        await signIn(loginValue, password)
      } else {
        // Username: tenta o domínio atual e depois os antigos, porque quem foi
        // criado antes da troca de domínio tem outro e-mail no Auth.
        const tentativas = emailsPossiveis(loginValue)
        let ultimoErro = null
        let entrou = false
        for (const tentativa of tentativas) {
          try {
            await signIn(tentativa, password)
            entrou = true
            break
          } catch (err) {
            ultimoErro = err
            // Só vale tentar o próximo domínio quando o e-mail não existe lá.
            const msg = (err.message || '').toLowerCase()
            if (!msg.includes('invalid login credentials') && !msg.includes('invalid credentials')) break
          }
        }
        if (!entrou) throw ultimoErro
      }

      navigate('/dashboard', { replace: true })
    } catch (err) {
      const message = (err.message || 'Erro ao efetuar login').toLowerCase()
      if (message.includes('email not confirmed') || message.includes('not confirmed')) {
        setError('Email não confirmado. Verifique sua caixa de entrada e clique no link enviado pelo sistema.')
      } else if (message.includes('invalid login credentials') || message.includes('invalid credentials')) {
        setError('Username/email ou senha incorretos. Se você entrou pelo Google antes, use o botão "Entrar com Google" abaixo.')
      } else {
        setError(err.message || 'Erro ao efetuar login')
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
          <h2>SellControl</h2>
          <p>Entre com sua conta para acessar o sistema.</p>
        </div>

        <form className="login-form" onSubmit={handleSubmit}>
          <label htmlFor="email">Username ou Email</label>
          <input
            id="email"
            type="text"
            placeholder="vendedor1 ou email@exemplo.com"
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

          {(error || authError) && <div className="login-error">{error || authError}</div>}
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
