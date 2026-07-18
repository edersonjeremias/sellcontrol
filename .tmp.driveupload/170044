export default function AlertaDebito({ cobrancas }) {
  const pendentes = cobrancas.filter(c => c.status_pagamento !== 'PAGO')
  if (!pendentes.length) return null

  const total = pendentes.reduce((s, c) => s + Number(c.valor_total || 0), 0)

  return (
    <div className="portal-alerta-divida">
      <div className="portal-alerta-divida-titulo">⚠ Pagamento Pendente</div>
      <div className="portal-alerta-divida-valor">
        R$ {total.toFixed(2).replace('.', ',')}
      </div>
      {pendentes.map(c => (
        <div key={c.id} style={{ display:'flex', alignItems:'center', justifyContent:'space-between', gap:8, flexWrap:'wrap' }}>
          <span style={{ fontSize:12, color:'var(--p-muted)' }}>
            Compra:{' '}
            {c.data_compra
              ? new Date(c.data_compra + 'T00:00').toLocaleDateString('pt-BR')
              : '—'}
            {' · '}
            R$ {Number(c.valor_total).toFixed(2).replace('.', ',')}
          </span>
          {c.link_pagamento && (
            <a href={c.link_pagamento} target="_blank" rel="noopener noreferrer"
              className="portal-btn portal-btn-red portal-btn-sm">
              Pagar agora →
            </a>
          )}
        </div>
      ))}
    </div>
  )
}
