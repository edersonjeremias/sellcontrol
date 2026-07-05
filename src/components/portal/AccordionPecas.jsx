import { useState } from 'react'

const SITE_URL = 'https://sellcontrol.vercel.app'

const STATUS_LABEL = {
  PENDENTE:  'Pendente',
  ENVIADO:   'Enviado',
  REENVIADO: 'Reenviado',
  LEMBRETE:  'Lembrete',
}

function fmtValor(v) {
  return Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

function fmtData(iso) {
  if (!iso) return ''
  const [y, m, d] = String(iso).slice(0, 10).split('-')
  return `${d}/${m}/${y}`
}

function statusCss(status) {
  const s = (status || '').toLowerCase()
  if (s.includes('entregue')) return 'entregue'
  if (s.includes('enviado') || s.includes('retirou') || s.includes('retirada')) return 'enviado'
  if (s.includes('produ')) return 'producao'
  return 'separado'
}

function PecaCard({ peca, getStatusOverride }) {
  const statusReal  = peca.status_peca || 'Separado'
  const statusExibir = getStatusOverride ? (getStatusOverride(peca) ?? statusReal) : statusReal

  return (
    <div className="portal-peca-card">
      {peca.codigo_peca && (
        <div className="portal-peca-codigo">#{peca.codigo_peca}</div>
      )}
      <div className="portal-peca-desc">
        {peca.descricao_completa || '(sem descrição)'}
      </div>
      {peca.observacao && (
        <div style={{ fontSize:12, color:'var(--p-muted)', fontStyle:'italic' }}>
          {peca.observacao}
        </div>
      )}
      <div className="portal-peca-footer">
        <div className="portal-peca-valor">
          R$ {Number(peca.valor || 0).toFixed(2).replace('.', ',')}
        </div>
        <span className={`portal-peca-status ${statusCss(statusExibir)}`}>
          {statusExibir}
        </span>
      </div>
      {peca.rastreio && (
        <div style={{ fontSize:11, color:'var(--p-blue)', marginTop:2 }}>
          Rastreio: {peca.rastreio}
        </div>
      )}
    </div>
  )
}

function AccordionGroup({ data, pecas, getStatusOverride, debito }) {
  const [open, setOpen] = useState(false)
  const total = pecas.reduce((s, p) => s + Number(p.valor || 0), 0)

  const dataFmt = (() => {
    try {
      return new Date(data + 'T00:00').toLocaleDateString('pt-BR', {
        day: '2-digit', month: 'short', year: 'numeric',
      })
    } catch { return data }
  })()

  const pago = debito?.status_pagamento === 'PAGO'
  const reciboUrl = debito ? `${SITE_URL}/recibo/${debito.id}` : null

  return (
    <div className="portal-accordion-group">
      <div className="portal-accordion-header" onClick={() => setOpen(o => !o)}>
        <div>
          <div className="portal-accordion-data">{dataFmt}</div>
          <div className="portal-accordion-resumo">
            {pecas.length} {pecas.length === 1 ? 'peça' : 'peças'}
          </div>
        </div>
        <div className="portal-accordion-right">
          {debito && !pago && (
            <span style={{
              fontSize: 11,
              fontWeight: 700,
              padding: '4px 12px',
              borderRadius: 20,
              color: 'var(--p-yellow)',
              background: 'rgba(251,188,4,0.12)',
              marginRight: 12,
            }}>
              Aguardando Pagamento
            </span>
          )}
          {debito && pago && (
            <span style={{
              fontSize: 11,
              fontWeight: 700,
              padding: '4px 12px',
              borderRadius: 20,
              color: 'var(--p-green)',
              background: 'rgba(129,201,149,0.12)',
              marginRight: 12,
            }}>
              PAGO
            </span>
          )}
          <span className={`portal-accordion-arrow${open ? ' open' : ''}`}>▼</span>
        </div>
      </div>
      {open && (
        <div className="portal-accordion-body">
          {pecas.map(p => (
            <PecaCard key={p.id} peca={p} getStatusOverride={getStatusOverride} />
          ))}

          {/* Seção de pagamento */}
          {debito && (
            <div style={{
              background: pago ? 'rgba(129,201,149,0.08)' : 'rgba(251,188,4,0.08)',
              border: `1px solid ${pago ? 'rgba(129,201,149,0.3)' : 'rgba(251,188,4,0.3)'}`,
              borderRadius: 10,
              padding: '14px 16px',
              marginTop: 12,
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--p-muted)' }}>
                  TOTAL
                </span>
                <span style={{ fontSize: 20, fontWeight: 900, color: pago ? 'var(--p-green)' : 'var(--p-yellow)' }}>
                  {fmtValor(debito.total)}
                </span>
              </div>

              {debito.observacao && (
                <div style={{ fontSize: 12, color: 'var(--p-muted)', fontStyle: 'italic', marginBottom: 12 }}>
                  {debito.observacao}
                </div>
              )}

              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {!pago && debito.link_mp && (
                  <a
                    href={debito.link_mp}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="portal-btn portal-btn-green"
                    style={{ textDecoration: 'none', fontSize: 13, padding: '8px 16px', flex: 1 }}
                  >
                    💳 Pagar
                  </a>
                )}
                {reciboUrl && (
                  <a
                    href={reciboUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="portal-btn portal-btn-blue"
                    style={{ textDecoration: 'none', fontSize: 13, padding: '8px 16px', flex: 1 }}
                  >
                    🧾 Recibo
                  </a>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// getStatusOverride: função (peca) => string | null
// Se retornar string, substitui o status_peca para exibição.
// Se null, usa o status real da peça.
export default function AccordionPecas({ pecas, getStatusOverride, debitos = [] }) {
  if (!pecas.length) {
    return <div className="portal-empty">Nenhuma peça encontrada.</div>
  }

  // Agrupar por data_envio (se tiver) ou data_insercao (para peças na sacolinha)
  const grupos = {}
  pecas.forEach(p => {
    const d = (p.data_envio || p.data_insercao || '').slice(0, 10) || '0000-00-00'
    if (!grupos[d]) grupos[d] = []
    grupos[d].push(p)
  })

  const datas = Object.keys(grupos).sort((a, b) => b.localeCompare(a))

  // Encontrar débito correspondente para cada data
  function encontrarDebito(data) {
    return debitos.find(d => d.data?.slice(0, 10) === data)
  }

  return (
    <div>
      {datas.map(d => (
        <AccordionGroup
          key={d}
          data={d}
          pecas={grupos[d]}
          getStatusOverride={getStatusOverride}
          debito={encontrarDebito(d)}
        />
      ))}
    </div>
  )
}
