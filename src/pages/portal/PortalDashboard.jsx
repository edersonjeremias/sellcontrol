import { useState } from 'react'
import { usePortalAuth } from '../../context/PortalAuthContext'
import MinhaSacolinha from './MinhaSacolinha'
import MeuCadastro    from './MeuCadastro'

const TABS = [
  { id: 'sacola',   label: '🛍 Minha Sacolinha' },
  { id: 'cadastro', label: '👤 Meu Cadastro'     },
]

export default function PortalDashboard() {
  const { cliente, logout } = usePortalAuth()
  const [aba, setAba]       = useState('sacola')

  return (
    <div>
      {/* Header */}
      <header className="portal-header">
        <div className="portal-header-logo">VM KIDS</div>
        <div className="portal-header-right">
          <span className="portal-header-insta">
            @{(cliente?.instagram || '').replace('@', '')}
          </span>
          <button className="portal-btn-logout" onClick={logout} title="Sair">
            Sair
          </button>
        </div>
      </header>

      {/* Nav */}
      <nav className="portal-nav">
        {TABS.map(t => (
          <button
            key={t.id}
            className={`portal-nav-btn${aba === t.id ? ' active' : ''}`}
            onClick={() => setAba(t.id)}
          >
            {t.label}
          </button>
        ))}
      </nav>

      {/* Conteúdo */}
      {aba === 'sacola'   && <MinhaSacolinha />}
      {aba === 'cadastro' && <MeuCadastro />}
    </div>
  )
}
