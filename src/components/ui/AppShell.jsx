import { useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'

export default function AppShell({ title, children, hideTitle = false, flush = false }) {
  const { profile, menuItems, signOut } = useAuth()
  const location = useLocation()
  const navigate = useNavigate()
  const [menuOpen, setMenuOpen] = useState(false)

  const handleLogout = async () => {
    await signOut()
    navigate('/login')
  }

  const navLinks = [
    ...menuItems.map(item => ({ to: `/${item.slug}`, label: item.label })),
    { to: '/clientes', label: 'Clientes' },
    ...(['admin', 'master'].includes(profile?.role) ? [{ to: '/configuracoes', label: 'Configurações' }] : []),
    ...(profile?.role === 'master' ? [{ to: '/master/empresas', label: 'Empresas' }] : []),
  ]

  return (
    <div className="app-shell">
      <header className="app-header">
        <div className="app-brand">
          <span className="app-logo-dot" />
          <span className="app-logo-text">sellControl</span>
        </div>

        {/* Nav desktop */}
        <nav className="app-nav">
          {navLinks.map(item => (
            <Link key={item.to} to={item.to}
              className={location.pathname === item.to ? 'app-nav-link active' : 'app-nav-link'}>
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="app-userbar">
          <div className="app-user-info">
            <span className="app-user-name">{profile?.nome || 'Usuário'}</span>
            <span className="app-user-role">{profile?.role?.toUpperCase()}</span>
          </div>
          <button className="app-logout-btn" onClick={handleLogout}>Sair</button>
        </div>

        {/* Botão sanduíche — só mobile */}
        <button className="app-hamburger" onClick={() => setMenuOpen(o => !o)} aria-label="Menu">
          <span /><span /><span />
        </button>
      </header>

      {/* Menu mobile dropdown */}
      {menuOpen && (
        <div className="app-mobile-menu">
          {navLinks.map(item => (
            <Link key={item.to} to={item.to}
              className={location.pathname === item.to ? 'app-mobile-link active' : 'app-mobile-link'}
              onClick={() => setMenuOpen(false)}>
              {item.label}
            </Link>
          ))}
          <button className="app-mobile-logout" onClick={handleLogout}>Sair</button>
        </div>
      )}

      <main className={`app-main${flush ? ' app-main-flush' : ''}`}>
        {!hideTitle && (
          <div className="app-page-header">
            <h1>{title}</h1>
          </div>
        )}
        {children}
      </main>
    </div>
  )
}
