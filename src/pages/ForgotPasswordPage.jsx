import { useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('')
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setMessage('')

    if (!email.includes('@')) {
      setError('Digite um email válido')
      return
    }

    setLoading(true)
    try {
      const { error: resendError } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/reset-password`
      })

      if (resendError) throw resendError

      setMessage('✅ Email enviado! Verifique sua caixa de entrada (ou spam) para resetar a senha.')
      setEmail('')
    } catch (err) {
      console.error(err)
      setError(err.message || 'Erro ao enviar email de recuperação')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="login-screen">
      <div className="login-card">
        <div className="login-header">
          <h2>Recuperar Senha</h2>
          <p>Digite seu email para receber um link de reset.</p>
        </div>

        <form className="login-form" onSubmit={handleSubmit}>
          <label htmlFor="email">Email</label>
          <input
            id="email"
            type="email"
            placeholder="seu@email.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
          />

          {error && <div className="login-error">{error}</div>}
          {message && <div style={{ color: 'var(--green)', padding: '10px 12px', borderRadius: '10px', background: 'rgba(74, 222, 128, 0.12)', fontWeight: 600 }}>{message}</div>}

          <button type="submit" className="btn-acao btn-blue" disabled={loading}>
            {loading ? 'Enviando...' : 'Enviar link de reset'}
          </button>
        </form>

        <div style={{ marginTop: '16px', textAlign: 'center', fontSize: '14px', color: 'var(--muted)' }}>
          Lembrou? <Link to="/" style={{ color: 'var(--blue)', textDecoration: 'none', fontWeight: 600 }}>Voltar para login</Link>
        </div>
      </div>
    </div>
  )
}
