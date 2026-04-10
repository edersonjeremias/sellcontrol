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
          <div className="app-logo">VM Kids App</div>
          <div className="app-subtitle">Menu global | SaaS</div>
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
          <div>
            <div className="app-user-name">{profile?.nome || 'Usuário'}</div>
            <div className="app-user-role">{profile?.role?.toUpperCase()}</div>
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
