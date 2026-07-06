import { useState, useEffect, useCallback } from 'react'
import { usePortalAuth } from '../../context/PortalAuthContext'
import { usePortalToast } from '../../components/portal/PortalToast'
import {
  getProdutos, getCobrancas, getUltimaProducao,
  isProducaoAtiva, STATUS_ENVIADO_PECA,
  getMeusDebitos,
} from '../../services/portalService'
import AlertaDebito      from '../../components/portal/AlertaDebito'
import AlertaFrete       from '../../components/portal/AlertaFrete'
import AccordionPecas    from '../../components/portal/AccordionPecas'
import ModalEncerramento from '../../components/portal/ModalEncerramento'

const SITE_URL = 'https://sellcontrol.vercel.app'

function fmtData(iso) {
  if (!iso) return ''
  const [y, m, d] = String(iso).slice(0, 10).split('-')
  return `${d}/${m}/${y}`
}

function fmtValor(v) {
  return Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

const STATUS_LABEL = {
  PENDENTE:  'Pendente',
  ENVIADO:   'Enviado',
  REENVIADO: 'Reenviado',
  LEMBRETE:  'Lembrete',
}
const STATUS_COR = {
  PENDENTE:  { color: 'var(--p-muted)',   bg: 'rgba(154,160,166,0.15)' },
  ENVIADO:   { color: '#0dcaf0',          bg: 'rgba(13,202,240,0.12)'  },
  REENVIADO: { color: '#c58af9',          bg: 'rgba(197,138,249,0.12)' },
  LEMBRETE:  { color: 'var(--p-yellow)',  bg: 'rgba(251,188,4,0.12)'   },
}

export default function MinhaSacolinha() {
  const { cliente }                   = usePortalAuth()
  const toast                         = usePortalToast()
  const [produtos,  setProdutos]      = useState([])
  const [cobrancas, setCobrancas]     = useState([])
  const [producao,  setProducao]      = useState(null)
  const [debitos,   setDebitos]       = useState([])
  const [loading,   setLoading]       = useState(true)
  const [aba,       setAba]           = useState('sacola')
  const [modalOpen, setModalOpen]     = useState(false)

  const carregar = useCallback(async () => {
    if (!cliente) return
    setLoading(true)
    try {
      const [p, c, pr, d] = await Promise.all([
        getProdutos(cliente.instagram),
        getCobrancas(cliente.instagram),
        getUltimaProducao(cliente.instagram),
        getMeusDebitos(),
      ])
      setProdutos(p)
      setCobrancas(c)
      setProducao(pr)
      setDebitos(d)
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

  const pecasSacola   = produtos.filter(p =>
    !STATUS_ENVIADO_PECA.some(v => (p.status_peca || '').toLowerCase().includes(v))
  )
  const pecasEnviadas = produtos.filter(p =>
    STATUS_ENVIADO_PECA.some(v => (p.status_peca || '').toLowerCase().includes(v))
  )

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

  const totalDebitos = debitos.reduce((s, d) => s + Number(d.total || 0), 0)

  return (
    <div style={{ padding: '14px 16px 0' }}>
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

      {/* Conteúdo das abas - sem espaço extra */}
      <div style={{ maxHeight: 'calc(100vh - 280px)', overflowY: 'auto', overflowX: 'hidden', paddingBottom: 0 }}>
        <AccordionPecas
          pecas={aba === 'sacola' ? pecasSacola : pecasEnviadas}
          getStatusOverride={aba === 'sacola' ? getStatusOverride : null}
          debitos={debitos}
        />
      </div>

      {false && aba === 'debitos' && (
        <div>
          {debitos.length === 0 ? (
            <div className="portal-empty" style={{ color:'var(--p-green)' }}>
              ✓ Nenhum débito em aberto!
            </div>
          ) : (
            <>
              {/* Total em aberto */}
              <div style={{
                background:'rgba(242,139,130,0.08)', border:'1px solid rgba(242,139,130,0.3)',
                borderRadius:10, padding:'12px 16px', marginBottom:12,
                display:'flex', justifyContent:'space-between', alignItems:'center',
              }}>
                <span style={{ fontSize:12, color:'var(--p-red)', fontWeight:700 }}>
                  TOTAL EM ABERTO
                </span>
                <span style={{ fontSize:20, fontWeight:900, color:'var(--p-red)' }}>
                  {fmtValor(totalDebitos)}
                </span>
              </div>

              {/* Lista de débitos */}
              {debitos.map(d => {
                const cor = STATUS_COR[d.status] || STATUS_COR.PENDENTE
                const reciboUrl = `${SITE_URL}/recibo/${d.id}`
                return (
                  <div key={d.id} style={{
                    background:'var(--p-card)', border:'1px solid var(--p-border)',
                    borderRadius:10, padding:'14px 16px', marginBottom:8,
                    borderLeft:`3px solid ${cor.color}`,
                  }}>
                    {/* Linha 1: data + live + status */}
                    <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:8 }}>
                      <div>
                        <span style={{ fontSize:13, fontWeight:700, color:'var(--p-text)' }}>
                          {fmtData(d.data)}
                        </span>
                        {d.live && (
                          <span style={{ fontSize:11, color:'var(--p-muted)', marginLeft:8 }}>
                            · {d.live}
                          </span>
                        )}
                      </div>
                      <span style={{
                        fontSize:11, fontWeight:700, padding:'3px 10px', borderRadius:20,
                        color: cor.color, background: cor.bg,
                      }}>
                        {STATUS_LABEL[d.status] || d.status}
                      </span>
                    </div>

                    {/* Observação */}
                    {d.observacao && (
                      <div style={{ fontSize:12, color:'var(--p-muted)', fontStyle:'italic', marginBottom:8 }}>
                        {d.observacao}
                      </div>
                    )}

                    {/* Linha 2: valor + botões */}
                    <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', gap:8 }}>
                      <span style={{ fontSize:20, fontWeight:900, color:'var(--p-red)' }}>
                        {fmtValor(d.total)}
                      </span>
                      <div style={{ display:'flex', gap:8 }}>
                        {d.link_mp && (
                          <a
                            href={d.link_mp}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="portal-btn portal-btn-green"
                            style={{ textDecoration:'none', fontSize:13, padding:'8px 16px' }}
                          >
                            💳 Pagar
                          </a>
                        )}
                        <a
                          href={reciboUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="portal-btn portal-btn-blue"
                          style={{ textDecoration:'none', fontSize:13, padding:'8px 16px' }}
                        >
                          🧾 Ver Recibo
                        </a>
                      </div>
                    </div>
                  </div>
                )
              })}
            </>
          )}
        </div>
      )}

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
