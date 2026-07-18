import { useState, useEffect } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { getConfig } from '../../services/configService'

const CATEGORY_ORDER = ['Principal', 'Vendas', 'Financeiro', 'Produção', 'Impressão', 'Cadastro', 'Admin', 'Outros']

const SLUG_TO_CATEGORY = {
  'dashboard':                   'Principal',
  'notificacoes':                'Principal',
  'vendas':                      'Vendas',
  'cobrancas':                   'Financeiro',
  'relatorio':                   'Financeiro',
  'contatos':                    'Vendas',
  'dashboard-financeiro':        'Financeiro',
  'contas-pagar':                'Financeiro',
  'creditos-clientes':           'Financeiro',
  'producao':                    'Produção',
  'expedicao':                   'Produção',
  'impressao-pedidos':           'Impressão',
  'impressao-sacolinha':         'Impressão',
  'impressao-sacolinha-cliente': 'Impressão',
  'etiquetas':                   'Impressão',
  'clientes':                    'Cadastro',
  'configuracoes':               'Admin',
  'master/empresas':             'Admin',
}

export default function AppShell({ title, children, hideTitle = false, flush = false }) {
  const { profile, menuItems, signOut } = useAuth()
  const location = useLocation()
  const navigate = useNavigate()
  const [menuOpen, setMenuOpen] = useState(false)
  const [config, setConfig] = useState(null)
  // Categorias fechadas por padrão — expanded só quando o usuário clicar
  const [expanded, setExpanded] = useState({})

  // Carrega configurações para pegar nome da empresa
  useEffect(() => {
    if (profile?.tenant_id) {
      getConfig(profile.tenant_id).then(setConfig).catch(() => {})
    }
  }, [profile?.tenant_id])

  const nomeEmpresa = config?.nome_empresa || 'SellControl'

  const handleLogout = async () => {
    setMenuOpen(false)
    try { await signOut() } catch (_) {}
    navigate('/login')
  }

  const close = () => setMenuOpen(false)
  const toggleCat = (cat) => setExpanded(prev =>
    prev[cat] ? { ...prev, [cat]: false } : { [cat]: true }
  )

  // Monta links com categoria
  const allLinks = [
    ...menuItems.map(item => ({
      to: `/${item.slug}`,
      label: item.label,
      category: SLUG_TO_CATEGORY[item.slug] || 'Outros',
    })),
    { to: '/clientes', label: 'Clientes', category: 'Cadastro' },
    ...(['admin', 'master'].includes(profile?.role)
      ? [{ to: '/configuracoes', label: 'Configurações', category: 'Admin' }]
      : []),
    ...(profile?.role === 'master'
      ? [{ to: '/master/empresas', label: 'Empresas', category: 'Admin' }]
      : []),
  ]

  const seen = new Set()
  const navLinks = allLinks.filter(l => {
    if (seen.has(l.to)) return false
    seen.add(l.to)
    return true
  })

  const grouped = {}
  navLinks.forEach(link => {
    const cat = link.category
    if (!grouped[cat]) grouped[cat] = []
    grouped[cat].push(link)
  })

  const categories = CATEGORY_ORDER.filter(c => grouped[c])

  return (
    <div className="app-shell">
      <header className="app-header">
        <div className="app-brand">
          <img src="/logo.svg" alt="" className="app-logo-img" />
          <span className="app-logo-text">{nomeEmpresa}</span>
        </div>

        <button
          className="app-hamburger"
          onClick={() => setMenuOpen(o => !o)}
          aria-label="Menu"
        >
          <span /><span /><span />
        </button>
      </header>

      {menuOpen && <div className="app-drawer-overlay" onClick={close} />}

      <div className={`app-drawer${menuOpen ? ' app-drawer-open' : ''}`}>
        {/* Cabeçalho do drawer */}
        <div className="app-drawer-top">
          <div className="app-drawer-brand">
            <img src="/logo.svg" alt="" className="app-logo-img" />
            <span className="app-logo-text">{nomeEmpresa}</span>
          </div>
          <button className="app-drawer-close" onClick={close}>✕</button>
        </div>

        {/* Info do usuário */}
        <div className="app-drawer-user">
          <span className="app-drawer-name">{profile?.nome || 'Usuário'}</span>
          <span className="app-drawer-role">{profile?.role?.toUpperCase()}</span>
        </div>

        {/* Menu por categorias */}
        <nav className="app-drawer-nav">
          {categories.map(cat => (
            <div key={cat} className="app-drawer-section">
              <button
                className="app-drawer-cat-btn"
                onClick={() => toggleCat(cat)}
              >
                <span className="app-drawer-cat-label">{cat}</span>
                <span className={`app-drawer-arrow${expanded[cat] ? ' open' : ''}`}>▸</span>
              </button>

              {expanded[cat] && (
                <div className="app-drawer-items">
                  {grouped[cat].map(item => (
                    <Link
                      key={item.to}
                      to={item.to}
                      className={`app-drawer-link${location.pathname === item.to ? ' active' : ''}`}
                      onClick={close}
                    >
                      <span className="app-drawer-link-dot" />
                      {item.label}
                    </Link>
                  ))}
                </div>
              )}
            </div>
          ))}
        </nav>

        <div className="app-drawer-footer">
          <button className="app-drawer-logout" onClick={handleLogout}>
            Sair
          </button>
        </div>
      </div>

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
