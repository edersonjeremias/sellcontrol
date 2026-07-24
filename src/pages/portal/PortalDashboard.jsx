import { useState, useEffect } from 'react'
import { usePortalAuth } from '../../context/PortalAuthContext'
import { portalGetConversas } from '../../services/conversasService'
import { supabase } from '../../lib/supabase'
import MinhaSacolinha from './MinhaSacolinha'
import MeuCadastro    from './MeuCadastro'
import MeuContato     from './MeuContato'

const TABS = [
  { id: 'sacola',   label: '🛍 Sacolinha' },
  { id: 'contato',  label: '✉ Contato'    },
  { id: 'cadastro', label: '👤 Cadastro'  },
]

export default function PortalDashboard() {
  const { cliente, logout } = usePortalAuth()
  const [aba, setAba]       = useState('sacola')
  const [totalNovas, setTotalNovas] = useState(0)
  const [nomeEmpresa, setNomeEmpresa] = useState('Portal')

  // Buscar nome da empresa
  useEffect(() => {
    const tenantId = import.meta.env.VITE_TENANT_ID
    if (tenantId) {
      supabase
        .from('configuracoes')
        .select('nome_loja')
        .eq('tenant_id', tenantId)
        .single()
        .then(({ data }) => {
          if (data?.nome_loja) setNomeEmpresa(data.nome_loja)
        })
    }
  }, [])

  // Busca total de mensagens não lidas
  useEffect(() => {
    async function buscarNovas() {
      try {
        const convs = await portalGetConversas()
        const total = convs.reduce((s, c) => s + (c.nao_lidas_cliente || 0), 0)
        setTotalNovas(total)
      } catch {}
    }
    buscarNovas()
    const interval = setInterval(buscarNovas, 30000) // atualiza a cada 30s
    return () => clearInterval(interval)
  }, [])

  return (
    <div>
      {/* Header */}
      <header className="portal-header">
        <div className="portal-header-logo">{nomeEmpresa}</div>
        <div className="portal-header-right">
          <span className="portal-header-insta">
            @{(cliente?.instagram || '').replace('@', '')}
          </span>
          <button className="portal-btn-logout" onClick={logout} title="Sair">
            Sair
          </button>
        </div>
      </header>

      {/* Nav */}
      <nav className="portal-nav">
        {TABS.map(t => (
          <button
            key={t.id}
            className={`portal-nav-btn${aba === t.id ? ' active' : ''}`}
            onClick={() => setAba(t.id)}
            style={{ position:'relative' }}
          >
            {t.label}
            {t.id === 'contato' && totalNovas > 0 && (
              <span style={{
                position:'absolute', top:4, right:4,
                background:'var(--p-red)', color:'#fff',
                borderRadius:10, fontSize:10, fontWeight:700,
                padding:'1px 6px', minWidth:18, textAlign:'center',
              }}>
                {totalNovas}
              </span>
            )}
          </button>
        ))}
      </nav>

      {/* Conteúdo - SEM padding extra */}
      <div style={{ marginTop: '104px' }}>
        {aba === 'sacola'   && <MinhaSacolinha />}
        {aba === 'contato'  && <MeuContato onAtualizar={() => setTotalNovas(0)} />}
        {aba === 'cadastro' && <MeuCadastro />}
      </div>
    </div>
  )
}
