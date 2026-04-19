import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
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

export default function App() {
  return (
    <AuthProvider>
      <AppProvider>
        <BrowserRouter>
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
            <Route path="/clientes" element={<RequireAuth><ClientesPage /></RequireAuth>} />
            <Route path="/configuracoes" element={<RequireAuth><RequireRole allowed={['master','admin']}><ConfiguracoesPage /></RequireRole></RequireAuth>} />
            <Route path="*" element={<Navigate to="/login" replace />} />
          </Routes>
        </BrowserRouter>
      </AppProvider>
    </AuthProvider>
  )
}
