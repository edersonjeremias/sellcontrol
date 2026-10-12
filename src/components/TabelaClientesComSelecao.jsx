// Componente de Cabeçalho de Coluna com Ordenação
export function ColunaOrdenavel({ campo, label, ordenacao, onClick, width, align = 'left' }) {
  const isAtiva = ordenacao.campo === campo
  const seta = isAtiva ? (ordenacao.direcao === 'asc' ? '↑' : '↓') : '↕'

  return (
    <th
      onClick={() => onClick(campo)}
      style={{
        padding: '6px 8px',
        textAlign: align,
        color: isAtiva ? 'var(--blue)' : 'var(--muted)',
        fontWeight: 600,
        borderBottom: '1px solid var(--border-light)',
        fontSize: 10,
        width,
        cursor: 'pointer',
        userSelect: 'none',
        transition: 'color 0.2s'
      }}
      onMouseEnter={e => { if (!isAtiva) e.currentTarget.style.color = 'var(--text-body)' }}
      onMouseLeave={e => { if (!isAtiva) e.currentTarget.style.color = 'var(--muted)' }}
    >
      {label} {seta}
    </th>
  )
}
