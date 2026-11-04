import { useState, useEffect, useCallback } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { getConfig } from '../../services/configService'
import {
  contarNotificacoesNaoLidas,
  contarContatosNaoLidos,
  BADGES_EVENT,
} from '../../services/badgesService'

// Categoria e ordem do menu vêm da tabela pages (editável em
// Configurações → Menu). menuItems já chega ordenado por order_index.
const CATEGORIA_PADRAO = 'Outros'

export default function AppShell({ title, children, hideTitle = false, flush = false }) {
  const { profile, menuItems, signOut } = useAuth()
  const location = useLocation()
  const navigate = useNavigate()
  const [menuOpen, setMenuOpen] = useState(false)
  const [config, setConfig] = useState(null)
  // Categorias fechadas por padrão — expanded só quando o usuário clicar
  const [expanded, setExpanded] = useState({})
  // Mensagens não lidas exibidas no topo e no menu lateral
  const [naoLidas, setNaoLidas] = useState({ notificacoes: 0, contatos: 0 })

  // Carrega configurações para pegar nome da empresa
  useEffect(() => {
    if (profile?.tenant_id) {
      getConfig(profile.tenant_id).then(setConfig).catch(() => {})
    }
  }, [profile?.tenant_id])

  const nomeEmpresa = config?.nome_loja || 'SellControl'

  // Só conta o que o usuário tem permissão de abrir
  const temNotificacoes = menuItems.some(i => i.slug === 'notificacoes')
  const temContatos     = menuItems.some(i => i.slug === 'contatos')

  const carregarNaoLidas = useCallback(async () => {
    if (!profile?.tenant_id) return
    const [notifs, contatos] = await Promise.all([
      temNotificacoes ? contarNotificacoesNaoLidas(profile.tenant_id).catch(() => 0) : 0,
      temContatos ? contarContatosNaoLidos(profile.tenant_id, profile.id).catch(() => 0) : 0,
    ])
    setNaoLidas({ notificacoes: notifs, contatos })
  }, [profile?.tenant_id, profile?.id, temNotificacoes, temContatos])

  // Atualiza ao entrar, a cada 30s, ao voltar para a aba e quando alguma
  // página avisa que marcou uma conversa como lida
  useEffect(() => {
    carregarNaoLidas()
    const interval = setInterval(carregarNaoLidas, 30000)
    const aoVoltar = () => { if (!document.hidden) carregarNaoLidas() }
    document.addEventListener('visibilitychange', aoVoltar)
    window.addEventListener(BADGES_EVENT, carregarNaoLidas)
    return () => {
      clearInterval(interval)
      document.removeEventListener('visibilitychange', aoVoltar)
      window.removeEventListener(BADGES_EVENT, carregarNaoLidas)
    }
  }, [carregarNaoLidas])

  const handleLogout = async () => {
    setMenuOpen(false)
    try { await signOut() } catch (_) {}
    navigate('/login')
  }

  const close = () => setMenuOpen(false)
  const toggleCat = (cat) => setExpanded(prev =>
    prev[cat] ? { ...prev, [cat]: false } : { [cat]: true }
  )

  // Empresas não é uma página da tabela pages: acompanha a categoria de
  // Configurações, para não criar uma categoria solta quando ela é renomeada.
  const categoriaAdmin =
    menuItems.find(i => i.slug === 'configuracoes')?.category?.trim() || 'Admin'

  // Monta links com categoria - TODAS as páginas vêm de menuItems (pages_access)
  const allLinks = [
    ...menuItems.map(item => ({
      to: `/${item.slug}`,
      label: item.label,
      category: (item.category || '').trim() || CATEGORIA_PADRAO,
    })),
    // Master → Empresas é uma página administrativa especial (apenas para master)
    ...(profile?.role === 'master'
      ? [{ to: '/master/empresas', label: 'Empresas', category: categoriaAdmin }]
      : []),
  ]

  const seen = new Set()
  const navLinks = allLinks.filter(l => {
    if (seen.has(l.to)) return false
    seen.add(l.to)
    return true
  })

  // A ordem das categorias é a ordem em que elas aparecem nas páginas, que já
  // vêm ordenadas por order_index — é assim que a tela de Menu as organiza.
  const grouped = {}
  const categories = []
  navLinks.forEach(link => {
    const cat = link.category
    if (!grouped[cat]) {
      grouped[cat] = []
      categories.push(cat)
    }
    grouped[cat].push(link)
  })

  return (
    <div className="app-shell">
      <header className="app-header">
        <div className="app-brand">
          <img src="/logo.svg" alt="" className="app-logo-img" />
          <span className="app-logo-text">{nomeEmpresa}</span>
        </div>

        <div className="app-badges">
          {naoLidas.notificacoes > 0 && (
            <button
              className="app-badge app-badge-notificacoes"
              onClick={() => navigate('/notificacoes')}
              title={`${naoLidas.notificacoes} nova${naoLidas.notificacoes > 1 ? 's' : ''} em Notificações`}
            >
              {naoLidas.notificacoes}
            </button>
          )}
          {naoLidas.contatos > 0 && (
            <button
              className="app-badge app-badge-contatos"
              onClick={() => navigate('/contatos')}
              title={`${naoLidas.contatos} mensage${naoLidas.contatos > 1 ? 'ns' : 'm'} de cliente em Contatos`}
            >
              {naoLidas.contatos}
            </button>
          )}
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
                  {grouped[cat].map(item => {
                    const badge = item.to === '/notificacoes' ? naoLidas.notificacoes
                                : item.to === '/contatos'     ? naoLidas.contatos
                                : 0
                    const badgeCor = item.to === '/contatos' ? ' app-badge-contatos' : ' app-badge-notificacoes'
                    return (
                      <Link
                        key={item.to}
                        to={item.to}
                        className={`app-drawer-link${location.pathname === item.to ? ' active' : ''}`}
                        onClick={close}
                      >
                        <span className="app-drawer-link-dot" />
                        {item.label}
                        {badge > 0 && (
                          <span className={`app-badge app-badge-mini${badgeCor}`}>{badge}</span>
                        )}
                      </Link>
                    )
                  })}
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
