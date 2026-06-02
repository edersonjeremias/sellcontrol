import { useState } from 'react'

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

function AccordionGroup({ data, pecas, getStatusOverride }) {
  const [open, setOpen] = useState(false)
  const total = pecas.reduce((s, p) => s + Number(p.valor || 0), 0)

  const dataFmt = (() => {
    try {
      return new Date(data + 'T00:00').toLocaleDateString('pt-BR', {
        day: '2-digit', month: 'short', year: 'numeric',
      })
    } catch { return data }
  })()

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
          <span className={`portal-accordion-arrow${open ? ' open' : ''}`}>▼</span>
        </div>
      </div>
      {open && (
        <div className="portal-accordion-body">
          {pecas.map(p => (
            <PecaCard key={p.id} peca={p} getStatusOverride={getStatusOverride} />
          ))}
        </div>
      )}
    </div>
  )
}

// getStatusOverride: função (peca) => string | null
// Se retornar string, substitui o status_peca para exibição.
// Se null, usa o status real da peça.
export default function AccordionPecas({ pecas, getStatusOverride }) {
  if (!pecas.length) {
    return <div className="portal-empty">Nenhuma peça encontrada.</div>
  }

  // Agrupar por data (parte date da data_insercao)
  const grupos = {}
  pecas.forEach(p => {
    const d = (p.data_insercao || '').slice(0, 10) || '0000-00-00'
    if (!grupos[d]) grupos[d] = []
    grupos[d].push(p)
  })

  const datas = Object.keys(grupos).sort((a, b) => b.localeCompare(a))

  return (
    <div>
      {datas.map(d => (
        <AccordionGroup
          key={d}
          data={d}
          pecas={grupos[d]}
          getStatusOverride={getStatusOverride}
        />
      ))}
    </div>
  )
}
