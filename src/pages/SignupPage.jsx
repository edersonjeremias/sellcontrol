import { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'

export default function SignupPage() {
  const navigate = useNavigate()
  const [formData, setFormData] = useState({ nome: '', email: '', password: '', confirmPassword: '' })
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [success, setSuccess] = useState('')

  const handleChange = (e) => {
    const { name, value } = e.target
    setFormData(prev => ({ ...prev, [name]: value }))
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setSuccess('')

    // Validações
    if (!formData.nome.trim()) {
      setError('Digite seu nome')
      return
    }
    if (!formData.email.includes('@')) {
      setError('Email inválido')
      return
    }
    if (formData.password.length < 6) {
      setError('Senha deve ter no mínimo 6 caracteres')
      return
    }
    if (formData.password !== formData.confirmPassword) {
      setError('Senhas não conferem')
      return
    }

    setLoading(true)
    try {
      // 1. Criar usuário no Auth
      const { data: authData, error: signupError } = await supabase.auth.signUp({
        email: formData.email.trim(),
        password: formData.password
      })

      if (signupError) throw signupError
      if (!authData.user) throw new Error('Usuário não criado')

      // 2. Criar perfil como master
      // ⚠️ IMPORTANTE: você precisa de um TENANT_ID
      // Substitua 'seu-tenant-uuid' pelo UUID real do seu tenant
      const TENANT_ID = import.meta.env.VITE_TENANT_ID
      if (!TENANT_ID) {
        throw new Error('VITE_TENANT_ID não configurado. Adicione em .env')
      }

      const { error: profileError } = await supabase
        .from('users_perfil')
        .insert([{
          id: authData.user.id,
          tenant_id: TENANT_ID,
          nome: formData.nome.trim(),
          role: 'master' // Novo usuário começa como master
        }])

      if (profileError) throw profileError

      setSuccess('✅ Cadastro realizado! Redirecionando para login...')
      setTimeout(() => {
        navigate('/')
      }, 2000)

    } catch (err) {
      console.error(err)
      if (err.message.includes('already registered')) {
        setError('Este email já está cadastrado. Tente fazer login ou use recuperação de senha.')
      } else if (err.message.includes('already')) {
        setError('Usuário já existe. Tente fazer login ou use recuperação de senha.')
      } else {
        setError(err.message || 'Erro ao cadastrar')
      }
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="login-screen">
      <div className="login-card">
        <div className="login-header">
          <h2>Criar Conta</h2>
          <p>Cadastre-se para acessar o sistema SaaS.</p>
        </div>

        <form className="login-form" onSubmit={handleSubmit}>
          <label htmlFor="nome">Nome Completo</label>
          <input
            id="nome"
            type="text"
            placeholder="Seu nome"
            name="nome"
            value={formData.nome}
            onChange={handleChange}
          />

          <label htmlFor="email">Email</label>
          <input
            id="email"
            type="email"
            placeholder="email@exemplo.com"
            name="email"
            value={formData.email}
            onChange={handleChange}
            autoComplete="username"
          />

          <label htmlFor="password">Senha</label>
          <input
            id="password"
            type="password"
            placeholder="Mínimo 6 caracteres"
            name="password"
            value={formData.password}
            onChange={handleChange}
            autoComplete="new-password"
          />

          <label htmlFor="confirmPassword">Confirmar Senha</label>
          <input
            id="confirmPassword"
            type="password"
            placeholder="Repetir senha"
            name="confirmPassword"
            value={formData.confirmPassword}
            onChange={handleChange}
            autoComplete="new-password"
          />

          {error && <div className="login-error">{error}</div>}
          {success && <div style={{ color: 'var(--green)', padding: '10px 12px', borderRadius: '10px', background: 'rgba(74, 222, 128, 0.12)', fontWeight: 600 }}>{success}</div>}

          <button type="submit" className="btn-acao btn-blue" disabled={loading}>
            {loading ? 'Criando conta...' : 'Cadastrar'}
          </button>
        </form>

        <div style={{ marginTop: '16px', textAlign: 'center', fontSize: '14px', color: 'var(--muted)' }}>
          Já tem conta? <Link to="/" style={{ color: 'var(--blue)', textDecoration: 'none' }}>Faça login</Link>
        </div>
      </div>
    </div>
  )
}
