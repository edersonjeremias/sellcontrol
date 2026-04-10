import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'

export default function ResetPasswordPage() {
  const navigate = useNavigate()
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [tokenValid, setTokenValid] = useState(null)
  const tokenHandledRef = useRef(false)

  const finishResetSuccess = async () => {
    await supabase.auth.signOut()
    setError('✅ Senha resetada! Redirecionando para login...')
    setTimeout(() => {
      navigate('/login?reset=success')
    }, 1500)
  }

  useEffect(() => {
    const handleRecoveryToken = async () => {
      try {
        // Em dev (React StrictMode), o efeito pode rodar duas vezes e consumir o token 2x.
        if (tokenHandledRef.current) return
        tokenHandledRef.current = true

        const url = new URL(window.location.href)
        const hash = url.hash || ''
        const hashParams = new URLSearchParams(hash.startsWith('#') ? hash.slice(1) : hash)
        const queryParams = url.searchParams

        const errorCode = hashParams.get('error_code') || queryParams.get('error_code')
        if (errorCode === 'otp_expired') {
          setTokenValid(false)
          setError('Este link de recuperação expirou. Solicite um novo email de redefinição.')
          return
        }

        const access_token = hashParams.get('access_token')
        const refresh_token = hashParams.get('refresh_token')
        const type = hashParams.get('type') || queryParams.get('type')

        // Fluxo 1: tokens já no hash (implicit flow).
        if (access_token && refresh_token) {
          const { error: sessionError } = await supabase.auth.setSession({
            access_token,
            refresh_token,
          })
          if (sessionError) {
            console.error('Erro ao aplicar sessão de reset:', sessionError)
            setTokenValid(false)
            setError('Não foi possível validar o link de reset. Solicite um novo email.')
            return
          }
          setTokenValid(true)
          window.history.replaceState(null, '', window.location.pathname)
          return
        }

        // Fluxo 2: PKCE com "code" em query string.
        const code = queryParams.get('code')
        if (code) {
          const { error: codeError } = await supabase.auth.exchangeCodeForSession(code)
          if (codeError) {
            console.error('Erro ao trocar code por sessão:', codeError)
            setTokenValid(false)
            setError('Não foi possível validar este link de recuperação. Solicite um novo email.')
            return
          }
          setTokenValid(true)
          window.history.replaceState(null, '', window.location.pathname)
          return
        }

        // Fluxo 3: token_hash + type=recovery em query string.
        const tokenHash = queryParams.get('token_hash')
        if (tokenHash && type === 'recovery') {
          const { error: otpError } = await supabase.auth.verifyOtp({
            type: 'recovery',
            token_hash: tokenHash,
          })
          if (otpError) {
            console.error('Erro ao verificar otp de recovery:', otpError)
            setTokenValid(false)
            setError('Não foi possível validar este link de recuperação. Solicite um novo email.')
            return
          }
          setTokenValid(true)
          window.history.replaceState(null, '', window.location.pathname)
          return
        }

        setTokenValid(false)
        setError('Link inválido ou incompleto. Solicite um novo email de redefinição.')
      } catch (err) {
        console.error('Erro ao validar token de reset:', err)
        setTokenValid(false)
        setError('Falha ao validar link de recuperação. Solicite um novo email.')
      }
    }

    handleRecoveryToken()
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
      const { data: sessionData } = await supabase.auth.getSession()
      if (!sessionData?.session) {
        throw new Error('Sessão de reset inválida. Abra o link de recuperação novamente.')
      }

      const { error: updateError } = await supabase.auth.updateUser({ password })
      if (updateError) {
        const lockMsg = updateError.message || ''
        const isLockRace = lockMsg.includes('another request stole it') || lockMsg.includes('lock:sb-')
        if (isLockRace) {
          const retry = await supabase.auth.updateUser({ password })
          if (retry.error) {
            throw new Error('Conflito de sessão detectado. Feche outras abas do SellControl e tente novamente com um novo link.')
          }
        } else {
          throw updateError
        }
      }

      await finishResetSuccess()
    } catch (err) {
      console.error(err)
      const msg = err?.message || 'Erro ao resetar senha'
      if (msg.includes('another request stole it') || msg.includes('lock:sb-')) {
        setError('Conflito de sessão detectado. Feche outras abas do SellControl e tente novamente com um novo link.')
      } else if (msg.toLowerCase().includes('new password should be different')) {
        setError('A nova senha deve ser diferente da senha anterior. Digite uma senha nova e tente novamente.')
      } else {
        setError(msg)
      }
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
          <button className="btn-acao btn-blue" onClick={() => navigate('/login')}>
            Voltar para login
          </button>
        </div>
      </div>
    )
  }

  if (tokenValid === null) {
    return <div style={{ padding: '24px', color: '#fff', textAlign: 'center' }}>Validando link de recuperação...</div>
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
