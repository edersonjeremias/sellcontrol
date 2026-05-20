import { useState, useEffect, useCallback } from 'react'
import { usePortalAuth } from '../../context/PortalAuthContext'
import { usePortalToast } from '../../components/portal/PortalToast'
import {
  getProdutos, getCobrancas, getUltimaProducao,
  isProducaoAtiva, STATUS_ENVIADO_PECA,
} from '../../services/portalService'
import AlertaDebito      from '../../components/portal/AlertaDebito'
import AlertaFrete       from '../../components/portal/AlertaFrete'
import AccordionPecas    from '../../components/portal/AccordionPecas'
import ModalEncerramento from '../../components/portal/ModalEncerramento'

export default function MinhaSacolinha() {
  const { cliente }                   = usePortalAuth()
  const toast                         = usePortalToast()
  const [produtos,  setProdutos]      = useState([])
  const [cobrancas, setCobrancas]     = useState([])
  const [producao,  setProducao]      = useState(null)
  const [loading,   setLoading]       = useState(true)
  const [aba,       setAba]           = useState('sacola')
  const [modalOpen, setModalOpen]     = useState(false)

  const carregar = useCallback(async () => {
    if (!cliente) return
    setLoading(true)
    try {
      const [p, c, pr] = await Promise.all([
        getProdutos(cliente.instagram),
        getCobrancas(cliente.instagram),
        getUltimaProducao(cliente.instagram),
      ])
      setProdutos(p)
      setCobrancas(c)
      setProducao(pr)
    } catch {
      toast('Erro ao carregar dados.', 'error')
    } finally {
      setLoading(false)
    }
  }, [cliente, toast])

  useEffect(() => { carregar() }, [carregar])

  if (!cliente) return null
  if (loading) return <div className="portal-loading">Carregando...</div>

  const temDivida = cobrancas.some(c => c.status_pagamento !== 'PAGO')
  const ativa     = isProducaoAtiva(producao)

  // Peças na sacolinha: não enviadas/entregues
  const pecasSacola   = produtos.filter(p =>
    !STATUS_ENVIADO_PECA.some(v => (p.status_peca || '').toLowerCase().includes(v))
  )
  // Peças enviadas/entregues
  const pecasEnviadas = produtos.filter(p =>
    STATUS_ENVIADO_PECA.some(v => (p.status_peca || '').toLowerCase().includes(v))
  )

  // Quando produção está ativa, peças "Separado" exibem "Em produção"
  function getStatusOverride(peca) {
    if (!ativa) return null
    const sl = (peca.status_peca || '').toLowerCase()
    if (STATUS_ENVIADO_PECA.some(v => sl.includes(v))) return null
    return 'Em produção'
  }

  function handleEncerrarClick() {
    if (temDivida) {
      toast('Favor fazer o pagamento pendente antes de encerrar sua sacolinha.', 'error', 4000)
      return
    }
    setModalOpen(true)
  }

  return (
    <div className="portal-content">
      <AlertaDebito cobrancas={cobrancas} />

      {producao && (
        <AlertaFrete
          producao={producao}
          instagram={cliente.instagram}
          onAtualizar={carregar}
        />
      )}

      {/* Barra de status + botão encerrar */}
      <div className="portal-sacola-info">
        <div>
          <div style={{ fontSize:11, color:'var(--p-muted)', fontWeight:600, marginBottom:6 }}>
            STATUS DA SACOLINHA
          </div>
          <span className={`portal-status-badge ${ativa ? 'preparacao' : 'aberta'}`}>
            {ativa ? '⚙ Em preparação' : '✓ Aberta'}
          </span>
        </div>
        <button
          className={`portal-btn ${!ativa && !temDivida ? 'portal-btn-green' : 'portal-btn-gray'}`}
          onClick={handleEncerrarClick}
          disabled={ativa}
        >
          🛍 Encerrar Sacolinha
        </button>
      </div>

      {/* Abas */}
      <div className="portal-tabs">
        <button
          className={`portal-tab${aba === 'sacola' ? ' active' : ''}`}
          onClick={() => setAba('sacola')}
        >
          Na Sacolinha ({pecasSacola.length})
        </button>
        <button
          className={`portal-tab${aba === 'enviadas' ? ' active' : ''}`}
          onClick={() => setAba('enviadas')}
        >
          Enviadas ({pecasEnviadas.length})
        </button>
      </div>

      <AccordionPecas
        pecas={aba === 'sacola' ? pecasSacola : pecasEnviadas}
        getStatusOverride={aba === 'sacola' ? getStatusOverride : null}
      />

      {modalOpen && (
        <ModalEncerramento
          instagram={cliente.instagram}
          onClose={() => setModalOpen(false)}
          onConfirm={() => { setModalOpen(false); carregar() }}
        />
      )}
    </div>
  )
}
