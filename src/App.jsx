import { BrowserRouter, Routes, Route, Navigate, useNavigate, useLocation } from 'react-router-dom'
import { useEffect } from 'react'
import { supabase } from './lib/supabase'

// Captura o hash ANTES de o Supabase limpá-lo da URL (ocorre de forma assíncrona).
// Usado para preservar access_token/refresh_token ao redirecionar para /reset-password.
const _RECOVERY_HASH =
  typeof window !== 'undefined' && window.location.hash.includes('type=recovery')
    ? window.location.hash
    : ''

// Força scroll to top quando a rota muda
function ScrollToTop() {
  const location = useLocation()
  useEffect(() => {
    window.scrollTo(0, 0)
  }, [location.pathname])
  return null
}

// Redireciona para /reset-password quando o Supabase confirma fluxo de recovery,
// preservando o hash com os tokens para que ResetPasswordPage possa processá-los.
function RecoveryGuard() {
  const navigate = useNavigate()
  useEffect(() => {
    // Usa o hash atual se ainda estiver presente, ou o capturado no carregamento
    const hash = window.location.hash.includes('type=recovery')
      ? window.location.hash
      : _RECOVERY_HASH

    if (hash.includes('type=recovery')) {
      navigate('/reset-password' + hash, { replace: true })
      return
    }
    // Fallback: escuta PASSWORD_RECOVERY (quando Supabase já limpou o hash antes do efeito rodar)
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY') {
        navigate('/reset-password', { replace: true })
      }
    })
    return () => subscription.unsubscribe()
  }, [navigate])
  return null
}
import { AppProvider } from './context/AppContext'
import { AuthProvider, RequireAuth, RequireRole, RequirePage } from './context/AuthContext'
import LoginPage from './pages/LoginPage'
import ForgotPasswordPage from './pages/ForgotPasswordPage'
import ResetPasswordPage from './pages/ResetPasswordPage'
import DashboardPage from './pages/DashboardPage'
import VendasPage from './pages/vendas/VendasPage'
import EditarVendasPage from './pages/vendas/EditarVendasPage'
import ProdutosPage from './pages/produtos/ProdutosPage'
import ProducaoPage from './pages/producao/ProducaoPage'
import AdminPage from './pages/AdminPage'
import MasterEmpresasPage from './pages/MasterEmpresasPage'
import CobrancasPage from './pages/cobrancas/CobrancasPage'
import ReciboPage from './pages/recibo/ReciboPage'
import ConfiguracoesPage from './pages/configuracoes/ConfiguracoesPage'
import ClientesPage from './pages/clientes/ClientesPage'
import PedidosPage from './pages/pedidos/PedidosPage'
import RastreioPage from './pages/rastreio/RastreioPage'
import ImpressaoSacolinhaPage from './pages/impressao/ImpressaoSacolinhaPage'
import ImpressaoPedidosPage          from './pages/impressao/ImpressaoPedidosPage'
import ImpressaoSacolinhaClientePage from './pages/impressao/ImpressaoSacolinhaClientePage'
import EtiquetasProdutosPage         from './pages/impressao/EtiquetasPage'
import EtiquetasEnvioPage            from './pages/etiquetas/EtiquetasPage'
import PortalApp                     from './pages/portal/PortalApp'
import FretePublicoPage              from './pages/frete/FretePublicoPage'
import FreteFinanceiroPage           from './pages/frete/FreteFinanceiroPage'
import RelatorioPage                  from './pages/relatorio/RelatorioPage'
import ContatosPage                   from './pages/contatos/ContatosPage'
import DashboardFinanceiroPage        from './pages/relatorio/DashboardFinanceiroPage'
import ContasPagarPage                from './pages/relatorio/ContasPagarPage'
import CreditosPage                   from './pages/relatorio/CreditosPage'
import ComissoesPage                  from './pages/relatorio/ComissoesPage'
import NotificacoesPage               from './pages/notificacoes/NotificacoesPageKanban'
import CuponsPage                     from './pages/cupons/CuponsPage'
import DebugPage                      from './pages/DebugPage'
import LimparUsuariosPage             from './pages/admin/LimparUsuariosPage'
import ComprasPage                    from './pages/compras/ComprasPage'
import RhPage                         from './pages/rh/RhPage'
import PontoQuiosquePage               from './pages/ponto/PontoQuiosquePage'

export default function App() {
  return (
    <AuthProvider>
      <AppProvider>
        <BrowserRouter>
          <ScrollToTop />
          <RecoveryGuard />
          <Routes>
            <Route path="/" element={<Navigate to="/dashboard" replace />} />
            <Route path="/login" element={<LoginPage />} />
            <Route path="/forgot-password" element={<ForgotPasswordPage />} />
            <Route path="/reset-password" element={<ResetPasswordPage />} />
            <Route path="/dashboard" element={<RequirePage slug="dashboard"><DashboardPage /></RequirePage>} />
            <Route path="/vendas" element={<RequirePage slug="vendas"><VendasPage /></RequirePage>} />
            <Route path="/editar-vendas" element={<RequirePage slug="editar-vendas"><EditarVendasPage /></RequirePage>} />
            <Route path="/produtos" element={<RequirePage slug="produtos"><ProdutosPage /></RequirePage>} />
            <Route path="/producao" element={<RequirePage slug="producao"><ProducaoPage /></RequirePage>} />
            <Route path="/admin" element={<RequireAuth><RequireRole allowed={['master','admin']}><AdminPage /></RequireRole></RequireAuth>} />
            <Route path="/master/empresas" element={<RequireAuth><RequireRole allowed={['master']}><MasterEmpresasPage /></RequireRole></RequireAuth>} />
            <Route path="/admin/limpar-usuarios" element={<RequireAuth><RequireRole allowed={['master']}><LimparUsuariosPage /></RequireRole></RequireAuth>} />
            <Route path="/cobrancas" element={<RequirePage slug="cobrancas"><CobrancasPage /></RequirePage>} />
            <Route path="/recibo/:id" element={<ReciboPage />} />
            <Route path="/rastreio" element={<RastreioPage />} />
            <Route path="/clientes" element={<RequirePage slug="clientes"><ClientesPage /></RequirePage>} />
            <Route path="/pedidos" element={<Navigate to="/expedicao" replace />} />
            <Route path="/expedicao" element={<RequirePage slug="expedicao"><PedidosPage /></RequirePage>} />
            <Route path="/configuracoes" element={<RequireAuth><RequireRole allowed={['master','admin']}><ConfiguracoesPage /></RequireRole></RequireAuth>} />
            <Route path="/impressao-sacolinha" element={<RequirePage slug="impressao-sacolinha"><ImpressaoSacolinhaPage /></RequirePage>} />
            <Route path="/impressao-pedidos"          element={<RequirePage slug="impressao-pedidos"><ImpressaoPedidosPage /></RequirePage>} />
            <Route path="/impressao-sacolinha-cliente" element={<RequirePage slug="impressao-sacolinha-cliente"><ImpressaoSacolinhaClientePage /></RequirePage>} />
            <Route path="/etiquetas" element={<RequirePage slug="etiquetas"><EtiquetasProdutosPage /></RequirePage>} />
            <Route path="/etiquetas-envio" element={<RequirePage slug="etiquetas-envio"><EtiquetasEnvioPage /></RequirePage>} />
            <Route path="/frete-pagamentos" element={<RequirePage slug="frete-pagamentos"><FreteFinanceiroPage /></RequirePage>} />
            <Route path="/relatorio"              element={<RequirePage slug="relatorio"><RelatorioPage /></RequirePage>} />
            <Route path="/contatos"              element={<RequirePage slug="contatos"><ContatosPage /></RequirePage>} />
            <Route path="/notificacoes"          element={<RequirePage slug="notificacoes"><NotificacoesPage /></RequirePage>} />
            <Route path="/debug"                 element={<RequireAuth><DebugPage /></RequireAuth>} />
            <Route path="/dashboard-financeiro"  element={<RequirePage slug="dashboard-financeiro"><DashboardFinanceiroPage /></RequirePage>} />
            <Route path="/contas-pagar"          element={<RequirePage slug="contas-pagar"><ContasPagarPage /></RequirePage>} />
            <Route path="/creditos-clientes"     element={<RequirePage slug="creditos-clientes"><CreditosPage /></RequirePage>} />
            <Route path="/comissoes"             element={<RequirePage slug="comissoes"><ComissoesPage /></RequirePage>} />
            <Route path="/cupons"                element={<RequireAuth><RequireRole allowed={['master','admin']}><CuponsPage /></RequireRole></RequireAuth>} />
            <Route path="/compras"               element={<RequirePage slug="compras"><ComprasPage /></RequirePage>} />
            <Route path="/rh"                    element={<RequireAuth><RequireRole allowed={['master','admin']}><RhPage /></RequireRole></RequireAuth>} />
            <Route path="/ponto"                 element={<RequireAuth><PontoQuiosquePage /></RequireAuth>} />
            {/* /f e /r são as versões curtas: URL longa chega quebrada no WhatsApp */}
            <Route path="/f/:codigo" element={<FretePublicoPage />} />
            <Route path="/frete/:token" element={<FretePublicoPage />} />
            <Route path="/r/:codigo" element={<ReciboPage />} />
            <Route path="/portal/:slug" element={<PortalApp />} />
            <Route path="/portal" element={<PortalApp />} />
            <Route path="*" element={<Navigate to="/login" replace />} />
          </Routes>
        </BrowserRouter>
      </AppProvider>
    </AuthProvider>
  )
}
