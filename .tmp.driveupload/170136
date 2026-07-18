import { useState, useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'

function fmtDate(d) {
  if (!d) return ''
  const [y, m, day] = String(d).slice(0, 10).split('-')
  return `${day}/${m}/${y}`
}

function fmtMoney(v) {
  const n = Number(v)
  if (!n && n !== 0) return ''
  return n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function trackUrl(cod) {
  const c = (cod || '').trim()
  if (!c) return null
  if (c.toUpperCase().startsWith('BLI')) return `https://www.loggi.com/rastreador/${c}`
  if (c.match(/^[A-Za-z]/)) return `https://rastreamento.correios.com.br/app/index.php?objetos=${c}`
  return null
}

const STATUS_COR = {
  'Separado': '#81c995', 'Enviado': '#8ab4f8', 'Comprar': '#fbbc04',
  'Devolução': '#f28b82', 'Gerar Crédito': '#c58af9',
  'Cancelado': '#9aa0a6', 'Pendente': '#fbbc04',
}

export default function RastreioPage() {
  const [params] = useSearchParams()
  const romaneio = params.get('r')
  const tenantId = params.get('t')
  const cod      = params.get('cod') || ''

  const [dados, setDados]   = useState(null)
  const [erro, setErro]     = useState(false)

  useEffect(() => {
    if (!romaneio || !tenantId) { setErro(true); return }
    fetch(`/api/rastreio?r=${romaneio}&t=${encodeURIComponent(tenantId)}`)
      .then(r => r.json())
      .then(json => {
        if (json.error) { setErro(true); return }
        setDados(json)
      })
      .catch(() => setErro(true))
  }, [romaneio, tenantId])

  const urlRastreio = trackUrl(cod)

  if (erro) return (
    <div style={S.pagina}>
      <div style={S.cardErro}>
        <div style={{ fontSize: 48, marginBottom: 10 }}>📦</div>
        <h2 style={{ color: '#e8eaed', margin: '0 0 8px' }}>Pedido não encontrado</h2>
        <p style={{ color: '#9aa0a6', margin: 0 }}>O link pode estar incorreto ou expirado.</p>
      </div>
    </div>
  )

  if (!dados) return (
    <div style={S.pagina}>
      <div style={{ color: '#9aa0a6', fontSize: 16 }}>Carregando…</div>
    </div>
  )

  const { itens, nomeLoja } = dados
  const primeiroItem = itens[0]
  const cliente = primeiroItem?.cliente_nome || ''
  const dataLive = primeiroItem?.data_live || ''
  const total = itens.reduce((s, i) => s + (Number(i.preco) || 0), 0)
  const enviados = itens.filter(i => i.status === 'Enviado' || i.status === 'Separado')

  return (
    <div style={S.pagina}>
      <div style={S.card}>

        {/* ── Cabeçalho ── */}
        <div style={S.header}>
          <div style={{ fontSize: 24, fontWeight: 800, color: '#e8eaed' }}>{nomeLoja}</div>
          <div style={{ fontSize: 13, color: '#9aa0a6', marginTop: 2 }}>Romaneio Nº {romaneio}</div>
        </div>

        {/* ── Botão rastrear (destaque) ── */}
        {urlRastreio && (
          <a href={urlRastreio} target="_blank" rel="noopener noreferrer" style={S.btnRastrear}>
            📦 Rastrear Envio — {cod}
          </a>
        )}

        {/* ── Cliente / Data ── */}
        {cliente && (
          <div style={S.section}>
            <div style={{ fontWeight: 700, fontSize: 17, color: '#e8eaed' }}>{cliente}</div>
            {dataLive && (
              <div style={{ color: '#9aa0a6', fontSize: 13, marginTop: 2 }}>
                Live de {fmtDate(dataLive)}
              </div>
            )}
          </div>
        )}

        {/* ── Itens ── */}
        <div style={{ marginBottom: 8, fontSize: 11, color: '#9aa0a6', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
          {itens.length} {itens.length === 1 ? 'item' : 'itens'}
        </div>

        {itens.map((item, i) => (
          <div key={i} style={S.itemRow}>
            <div style={{ flex: 1 }}>
              <div style={{ color: '#e8eaed', fontWeight: 600, fontSize: 13 }}>
                {item.produto}{item.modelo ? ` - ${item.modelo}` : ''}
              </div>
              <div style={{ color: '#9aa0a6', fontSize: 11, marginTop: 2 }}>
                {[
                  item.codigo && `Cód: ${item.codigo}`,
                  item.tamanho && `Tam: ${item.tamanho}`,
                  item.cor && `Cor: ${item.cor}`,
                  item.marca && `Marca: ${item.marca}`,
                ].filter(Boolean).join(' · ')}
              </div>
            </div>
            {item.status && (
              <div style={{ fontSize: 10, color: STATUS_COR[item.status] || '#9aa0a6', flexShrink: 0, alignSelf: 'center' }}>
                {item.status.toUpperCase()}
              </div>
            )}
          </div>
        ))}

        <div style={{ textAlign: 'center', marginTop: 18, fontSize: 11, color: '#5f6368' }}>
          Em caso de dúvidas, entre em contato via WhatsApp
        </div>
      </div>
    </div>
  )
}

const S = {
  pagina: {
    height: '100vh',
    overflowY: 'auto',
    WebkitOverflowScrolling: 'touch',
    background: 'linear-gradient(180deg, #141517 0%, #202124 100%)',
    display: 'flex', alignItems: 'flex-start', justifyContent: 'center',
    padding: '30px 16px 60px',
    fontFamily: 'system-ui, -apple-system, sans-serif',
  },
  card: {
    width: '100%', maxWidth: 480,
    background: '#292a2d', border: '1px solid #3c4043',
    borderRadius: 16, padding: '24px 20px',
    boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
  },
  cardErro: {
    background: '#292a2d', border: '1px solid #3c4043',
    borderRadius: 16, padding: '40px 30px',
    textAlign: 'center', maxWidth: 340,
  },
  header: {
    borderBottom: '1px solid #3c4043',
    paddingBottom: 14, marginBottom: 16,
  },
  btnRastrear: {
    display: 'block', width: '100%', padding: '14px',
    background: 'linear-gradient(135deg, #1a6b8a, #0d9488)',
    color: '#fff', fontWeight: 800, fontSize: 15,
    textAlign: 'center', borderRadius: 10,
    textDecoration: 'none', marginBottom: 16,
    boxShadow: '0 4px 12px rgba(13,148,136,0.4)',
  },
  section: {
    marginBottom: 14, paddingBottom: 14,
    borderBottom: '1px solid #3c4043',
  },
  itemRow: {
    display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start',
    gap: 12, padding: '10px 0', borderBottom: '1px solid #3c4043',
  },
  totalBox: {
    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
    padding: '12px 0', marginTop: 4,
    borderTop: '2px solid #3c4043',
  },
}
