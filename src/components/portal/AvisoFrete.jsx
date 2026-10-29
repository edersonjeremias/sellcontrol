const ESTILOS = {
  cotar: {
    cor: 'var(--p-blue)',
    fundo: 'rgba(138,180,248,.10)',
    borda: 'rgba(138,180,248,.35)',
    icone: '📦',
  },
  pagar: {
    cor: 'var(--p-yellow)',
    fundo: 'rgba(251,188,4,.10)',
    borda: 'rgba(251,188,4,.35)',
    icone: '💳',
  },
}

function textos(aviso) {
  if (aviso.tipo === 'pagar') {
    const valor = aviso.valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
    return {
      titulo: `Frete de ${valor} aguardando pagamento`,
      sub: 'Toque para pagar e liberar o envio',
    }
  }
  const varios = aviso.quantidade > 1
  return {
    titulo: varios ? `${aviso.quantidade} pacotes prontos para envio` : 'Pacote pronto para envio',
    sub: 'Toque para calcular o frete',
  }
}

export default function AvisoFrete({ aviso, onIr }) {
  if (!aviso) return null

  const estilo = ESTILOS[aviso.tipo]
  const { titulo, sub } = textos(aviso)

  return (
    <button
      onClick={onIr}
      style={{
        width: '100%',
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        background: estilo.fundo,
        border: `1px solid ${estilo.borda}`,
        borderRadius: 10,
        padding: '14px 16px',
        marginBottom: 12,
        cursor: 'pointer',
        textAlign: 'left',
      }}
    >
      <span style={{ fontSize: 22, lineHeight: 1 }}>{estilo.icone}</span>

      <span style={{ flex: 1 }}>
        <span style={{ display: 'block', color: estilo.cor, fontWeight: 700, fontSize: 14 }}>
          {titulo}
        </span>
        <span style={{ display: 'block', color: 'var(--p-muted)', fontSize: 12, marginTop: 2 }}>
          {sub}
        </span>
      </span>

      <span style={{ color: estilo.cor, fontSize: 20, fontWeight: 700 }}>›</span>
    </button>
  )
}
