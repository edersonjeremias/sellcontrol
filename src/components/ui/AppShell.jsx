import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'

export default function AppShell({ title, children, hideTitle = false, flush = false }) {
  const { profile, menuItems, signOut } = useAuth()
  const location = useLocation()
  const navigate = useNavigate()

  const handleLogout = async () => {
    await signOut()
    navigate('/login')
  }

  return (
    <div className="app-shell">
      <header className="app-header">
        <div className="app-brand">
          <span className="app-logo-dot" />
          <span className="app-logo-text">sellControl</span>
        </div>

        <nav className="app-nav">
          {menuItems.map((item) => (
            <Link
              key={item.slug}
              to={`/${item.slug}`}
              className={location.pathname === `/${item.slug}` ? 'app-nav-link active' : 'app-nav-link'}
            >
              {item.label}
            </Link>
          ))}
          <Link
            to="/clientes"
            className={location.pathname === '/clientes' ? 'app-nav-link active' : 'app-nav-link'}
          >
            Clientes
          </Link>
          {['admin', 'master'].includes(profile?.role) && (
            <Link
              to="/configuracoes"
              className={location.pathname === '/configuracoes' ? 'app-nav-link active' : 'app-nav-link'}
            >
              Configurações
            </Link>
          )}
          {profile?.role === 'master' && (
            <Link
              to="/master/empresas"
              className={location.pathname === '/master/empresas' ? 'app-nav-link active' : 'app-nav-link'}
            >
              Empresas
            </Link>
          )}
        </nav>

        <div className="app-userbar">
          <div className="app-user-info">
            <span className="app-user-name">{profile?.nome || 'Usuário'}</span>
            <span className="app-user-role">{profile?.role?.toUpperCase()}</span>
          </div>
          <button className="app-logout-btn" onClick={handleLogout}>Sair</button>
        </div>
      </header>

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
