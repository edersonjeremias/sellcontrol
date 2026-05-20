import { PortalAuthProvider, usePortalAuth } from '../../context/PortalAuthContext'
import PortalToastProvider from '../../components/portal/PortalToast'
import PortalLoginPage  from './PortalLoginPage'
import PortalDashboard  from './PortalDashboard'
import '../../styles/portal.css'

function PortalGate() {
  const { cliente, loading } = usePortalAuth()

  if (loading) {
    return (
      <div className="portal-loading" style={{ minHeight:'100vh' }}>
        Carregando...
      </div>
    )
  }

  return cliente ? <PortalDashboard /> : <PortalLoginPage />
}

export default function PortalApp() {
  return (
    <PortalAuthProvider>
      <PortalToastProvider>
        <div className="portal-root">
          <PortalGate />
        </div>
      </PortalToastProvider>
    </PortalAuthProvider>
  )
}
