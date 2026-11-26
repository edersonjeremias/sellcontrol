import { useState, useEffect } from 'react'
import { useParams } from 'react-router-dom'
import { PortalAuthProvider, usePortalAuth } from '../../context/PortalAuthContext'
import PortalToastProvider from '../../components/portal/PortalToast'
import PortalLoginPage  from './PortalLoginPage'
import PortalDashboard  from './PortalDashboard'
import { supabase } from '../../lib/supabase'
import '../../styles/portal.css'

function PortalGate({ tenantId, nomeEmpresa }) {
  const { cliente, loading, bloqueado } = usePortalAuth()

  if (bloqueado) {
    return (
      <div style={{
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 16,
        padding: 20,
        textAlign: 'center',
      }}>
        <div style={{ fontSize: 48 }}>🔒</div>
        <h2 style={{ color: '#e8eaed', margin: 0 }}>Acesso indisponível</h2>
        <p style={{ color: '#9aa0a6', margin: 0, lineHeight: 1.6 }}>
          Seu acesso ao portal está temporariamente suspenso.<br />
          Fale com a loja para liberar.
        </p>
        <button
          className="portal-btn portal-btn-gray"
          onClick={() => window.location.reload()}
        >
          Tentar de novo
        </button>
      </div>
    )
  }

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

        // Resolve o slug pelo contrato: canal_publico só responde se a empresa
        // tem o módulo Portal na assinatura. Sem ele, a cliente vê o mesmo que
        // endereço errado — a empresa não paga pelo portal, o portal não abre.
        const { data: canal, error: erroCanal } = await supabase
          .rpc('canal_publico', { p_slug: slug, p_canal: 'portal' })

        // A função é nova: enquanto a migration de módulos não roda, o portal
        // segue abrindo pelo caminho antigo em vez de ficar fora do ar.
        let dados = null
        if (erroCanal) {
          console.warn('canal_publico indisponível, lendo configuracoes_public:', erroCanal.message)
          const { data } = await supabase
            .from('configuracoes_public')
            .select('tenant_id, nome_loja')
            .eq('slug', slug)
            .single()
          dados = data || null
        } else if (canal?.encontrado) {
          dados = { tenant_id: canal.tenant_id, nome_loja: canal.nome_loja }
        }

        if (!dados) {
          setErro(true)
          setLoading(false)
          return
        }

        setTenantId(dados.tenant_id)
        setNomeEmpresa(dados.nome_loja || 'Portal')
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
