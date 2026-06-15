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
import { AuthProvider, RequireAuth, RequireRole } from './context/AuthContext'
import LoginPage from './pages/LoginPage'
import ForgotPasswordPage from './pages/ForgotPasswordPage'
import ResetPasswordPage from './pages/ResetPasswordPage'
import DashboardPage from './pages/DashboardPage'
import VendasPage from './pages/vendas/VendasPage'
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
import EtiquetasPage                 from './pages/impressao/EtiquetasPage'
import PortalApp                     from './pages/portal/PortalApp'
import RelatorioPage                  from './pages/relatorio/RelatorioPage'
import ContatosPage                   from './pages/contatos/ContatosPage'
import DashboardFinanceiroPage        from './pages/relatorio/DashboardFinanceiroPage'
import ContasPagarPage                from './pages/relatorio/ContasPagarPage'
import CreditosPage                   from './pages/relatorio/CreditosPage'

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
            <Route path="/dashboard" element={<RequireAuth><DashboardPage /></RequireAuth>} />
            <Route path="/vendas" element={<RequireAuth><VendasPage /></RequireAuth>} />
            <Route path="/producao" element={<RequireAuth><ProducaoPage /></RequireAuth>} />
            <Route path="/admin" element={<RequireAuth><RequireRole allowed={['master','admin']}><AdminPage /></RequireRole></RequireAuth>} />
            <Route path="/master/empresas" element={<RequireAuth><RequireRole allowed={['master']}><MasterEmpresasPage /></RequireRole></RequireAuth>} />
            <Route path="/cobrancas" element={<RequireAuth><CobrancasPage /></RequireAuth>} />
            <Route path="/recibo/:id" element={<ReciboPage />} />
            <Route path="/rastreio" element={<RastreioPage />} />
            <Route path="/clientes" element={<RequireAuth><ClientesPage /></RequireAuth>} />
            <Route path="/pedidos" element={<Navigate to="/expedicao" replace />} />
            <Route path="/expedicao" element={<RequireAuth><PedidosPage /></RequireAuth>} />
            <Route path="/configuracoes" element={<RequireAuth><RequireRole allowed={['master','admin']}><ConfiguracoesPage /></RequireRole></RequireAuth>} />
            <Route path="/impressao-sacolinha" element={<RequireAuth><ImpressaoSacolinhaPage /></RequireAuth>} />
            <Route path="/impressao-pedidos"          element={<RequireAuth><ImpressaoPedidosPage /></RequireAuth>} />
            <Route path="/impressao-sacolinha-cliente" element={<RequireAuth><ImpressaoSacolinhaClientePage /></RequireAuth>} />
            <Route path="/etiquetas" element={<RequireAuth><EtiquetasPage /></RequireAuth>} />
            <Route path="/relatorio"              element={<RequireAuth><RelatorioPage /></RequireAuth>} />
            <Route path="/contatos"              element={<RequireAuth><ContatosPage /></RequireAuth>} />
            <Route path="/dashboard-financeiro"  element={<RequireAuth><DashboardFinanceiroPage /></RequireAuth>} />
            <Route path="/contas-pagar"          element={<RequireAuth><ContasPagarPage /></RequireAuth>} />
            <Route path="/creditos-clientes"     element={<RequireAuth><CreditosPage /></RequireAuth>} />
            <Route path="/portal" element={<PortalApp />} />
            <Route path="*" element={<Navigate to="/login" replace />} />
          </Routes>
        </BrowserRouter>
      </AppProvider>
    </AuthProvider>
  )
}
