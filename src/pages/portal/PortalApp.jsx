import { useState, useEffect } from 'react'
import { useParams } from 'react-router-dom'
import { PortalAuthProvider, usePortalAuth } from '../../context/PortalAuthContext'
import PortalToastProvider from '../../components/portal/PortalToast'
import PortalLoginPage  from './PortalLoginPage'
import PortalDashboard  from './PortalDashboard'
import { supabase } from '../../lib/supabase'
import '../../styles/portal.css'

function PortalGate({ tenantId, nomeEmpresa }) {
  const { cliente, loading } = usePortalAuth()

  if (loading) {
    return (
      <div className="portal-loading" style={{ minHeight:'100vh', display:'flex', alignItems:'center', justifyContent:'center', color:'#9aa0a6' }}>
        Carregando...
      </div>
    )
  }

  return cliente ? <PortalDashboard tenantId={tenantId} nomeEmpresa={nomeEmpresa} /> : <PortalLoginPage tenantId={tenantId} nomeEmpresa={nomeEmpresa} />
}

export default function PortalApp() {
  const { slug } = useParams()
  const [tenantId, setTenantId] = useState(null)
  const [nomeEmpresa, setNomeEmpresa] = useState('')
  const [loading, setLoading] = useState(true)
  const [erro, setErro] = useState(false)

  useEffect(() => {
    async function buscarTenant() {
      setLoading(true)
      setErro(false)

      try {
        // Slug é OBRIGATÓRIO
        if (!slug) {
          setErro(true)
          setLoading(false)
          return
        }

        // Buscar por slug
        const { data, error } = await supabase
          .from('configuracoes')
          .select('tenant_id, nome_loja')
          .eq('slug', slug)
          .single()

        if (error || !data) {
          setErro(true)
          setLoading(false)
          return
        }

        setTenantId(data.tenant_id)
        setNomeEmpresa(data.nome_loja || 'Portal')
      } catch {
        setErro(true)
      } finally {
        setLoading(false)
      }
    }

    buscarTenant()
  }, [slug])

  if (loading) {
    return (
      <div className="portal-root">
        <div style={{ minHeight:'100vh', display:'flex', alignItems:'center', justifyContent:'center', color:'#9aa0a6' }}>
          Carregando portal...
        </div>
      </div>
    )
  }

  if (erro || !tenantId) {
    return (
      <div className="portal-root">
        <div style={{
          minHeight:'100vh',
          display:'flex',
          flexDirection:'column',
          alignItems:'center',
          justifyContent:'center',
          gap:16,
          padding:20,
          textAlign:'center'
        }}>
          <div style={{ fontSize:48 }}>🔍</div>
          <h2 style={{ color:'#e8eaed', margin:0 }}>Portal não encontrado</h2>
          <p style={{ color:'#9aa0a6', margin:0 }}>
            O link que você acessou não é válido.<br/>
            Verifique com a loja se o endereço está correto.
          </p>
        </div>
      </div>
    )
  }

  return (
    <PortalAuthProvider tenantId={tenantId}>
      <PortalToastProvider>
        <div className="portal-root">
          <PortalGate tenantId={tenantId} nomeEmpresa={nomeEmpresa} />
        </div>
      </PortalToastProvider>
    </PortalAuthProvider>
  )
}
