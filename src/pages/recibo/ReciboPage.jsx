import { useState, useEffect } from 'react'
import { useParams } from 'react-router-dom'
import { getCobrancaById, formatMoeda } from '../../services/cobrancasService'

function fmtData(iso) {
  if (!iso) return ''
  const [y, m, d] = String(iso).slice(0, 10).split('-')
  return `${d}/${m}/${y}`
}

const STATUS_LABEL = { PAGO: 'Pago ✅', BAIXADO: 'Pago ✅', CANCELADO: 'Cancelado ❌', PENDENTE: 'Aguardando Pagamento' }
const STATUS_COR   = { PAGO: '#81c995', BAIXADO: '#81c995', CANCELADO: '#f28b82', PENDENTE: '#fbbc04' }

export default function ReciboPage() {
  const { id }       = useParams()
  const [cob, setCob] = useState(null)
  const [erro, setErro] = useState(false)

  useEffect(() => {
    if (!id) { setErro(true); return }
    setErro(false);
    getCobrancaById(id)
      .then(res => {
        if (!res) setErro(true);
        else setCob(res);
      })
      .catch(err => {
        console.error('Falha no recibo:', err);
        setErro(true);
      })
  }, [id])

  if (erro) return (
    <div style={estilos.paginaErro}>
      <div style={estilos.cardErro}>
        <div style={{ fontSize: 48, marginBottom: 10 }}>🔍</div>
        <h2 style={{ color: '#e8eaed', margin: '0 0 8px' }}>Pedido não encontrado</h2>
        <p style={{ color: '#9aa0a6', margin: 0 }}>O link pode ter expirado ou ser inválido.</p>
      </div>
    </div>
  )

  if (!cob) return (
    <div style={estilos.paginaErro}>
      <div style={{ color: '#9aa0a6', fontSize: 16 }}>Carregando pedido…</div>
    </div>
  )

  const itens  = Array.isArray(cob.itens) ? cob.itens : []
  const statusCor   = STATUS_COR[cob.status]   || '#9aa0a6'
  const statusLabel = STATUS_LABEL[cob.status] || cob.status
  const pago        = cob.status === 'PAGO' || cob.status === 'BAIXADO'

  return (
    <div style={estilos.pagina}>
      <div style={estilos.card}>

        {/* Cabeçalho */}
        <div style={estilos.header}>
          <div style={{ fontSize: 22, fontWeight: 800, color: '#e8eaed' }}>VM Kids 🌸</div>
          <div style={{ fontSize: 13, color: '#9aa0a6', marginTop: 2 }}>Pedido #{id?.slice(0, 8).toUpperCase()}</div>
        </div>

        {/* Cliente e data */}
        <div style={estilos.section}>
          <div style={{ fontWeight: 700, fontSize: 18, color: '#e8eaed' }}>{cob.cliente}</div>
          <div style={{ color: '#9aa0a6', fontSize: 14, marginTop: 2 }}>
            {fmtData(cob.data)}{cob.live && ` · ${cob.live}`}
          </div>
        </div>

        {/* Status */}
        <div style={{ ...estilos.badge, color: statusCor, borderColor: statusCor }}>
          {statusLabel}
        </div>

        {/* Itens */}
        {itens.length > 0 && (
          <div style={estilos.section}>
            <div style={{ fontSize: 12, color: '#9aa0a6', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 8 }}>Itens do Pedido</div>
            {itens.map((item, i) => (
              <div key={i} style={{ ...estilos.itemRow, textDecoration: item.cancelado ? 'line-through' : 'none', opacity: item.cancelado ? 0.5 : 1 }}>
                <span style={{ flex: 1, color: '#e8eaed' }}>{item.descricao}</span>
                <span style={{ fontWeight: 700, whiteSpace: 'nowrap', color: item.valor < 0 ? '#81c995' : '#e8eaed' }}>
                  {item.valor < 0 ? '-' : ''}R$ {Math.abs(item.valor).toFixed(2).replace('.', ',')}
                </span>
              </div>
            ))}
          </div>
        )}

        {/* Total */}
        <div style={estilos.totalBox}>
          <span style={{ color: '#9aa0a6', fontSize: 14 }}>Total</span>
          <span style={{ fontSize: 28, fontWeight: 800, color: '#81c995' }}>{formatMoeda(cob.total)}</span>
        </div>

        {/* Botão de pagamento */}
        {!pago && cob.link_mp && cob.link_mp !== 'Pago com Crédito' && (
          <a
            href={cob.link_mp}
            target="_blank"
            rel="noopener noreferrer"
            style={estilos.btnPagar}
          >
            💳 Pagar Agora
          </a>
        )}

        {pago && (
          <div style={{ textAlign: 'center', padding: '14px', background: 'rgba(129,201,149,0.12)', borderRadius: 8, border: '1px solid rgba(129,201,149,0.3)', color: '#81c995', fontWeight: 700, fontSize: 15 }}>
            Pagamento confirmado! ✅
          </div>
        )}

        {!pago && (!cob.link_mp || cob.link_mp === 'Pago com Crédito') && (
          <div style={{ textAlign: 'center', padding: '14px', background: 'rgba(251,188,4,0.1)', borderRadius: 8, border: '1px solid rgba(251,188,4,0.3)', color: '#fbbc04', fontWeight: 600, fontSize: 14 }}>
            Aguardando processamento do link de pagamento
          </div>
        )}

        <div style={{ textAlign: 'center', marginTop: 20, fontSize: 12, color: '#5f6368' }}>
          Em caso de dúvidas, entre em contato via WhatsApp
        </div>
      </div>
    </div>
  )
}

const estilos = {
  pagina: {
    minHeight: '100vh',
    background: 'linear-gradient(180deg, #141517 0%, #202124 100%)',
    display: 'flex',
    alignItems: 'flex-start',
    justifyContent: 'center',
    padding: '30px 16px 60px',
    fontFamily: 'system-ui, -apple-system, sans-serif',
  },
  paginaErro: {
    minHeight: '100vh',
    background: '#202124',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontFamily: 'system-ui, -apple-system, sans-serif',
  },
  card: {
    width: '100%',
    maxWidth: 480,
    background: '#292a2d',
    border: '1px solid #3c4043',
    borderRadius: 16,
    padding: '24px 20px',
    boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
  },
  cardErro: {
    background: '#292a2d',
    border: '1px solid #3c4043',
    borderRadius: 16,
    padding: '40px 30px',
    textAlign: 'center',
    maxWidth: 340,
  },
  header: {
    borderBottom: '1px solid #3c4043',
    paddingBottom: 14,
    marginBottom: 16,
  },
  section: {
    marginBottom: 14,
    paddingBottom: 14,
    borderBottom: '1px solid #3c4043',
  },
  badge: {
    display: 'inline-block',
    padding: '4px 14px',
    borderRadius: 999,
    border: '1px solid',
    fontSize: 13,
    fontWeight: 700,
    marginBottom: 16,
  },
  itemRow: {
    display: 'flex',
    justifyContent: 'space-between',
    gap: 8,
    fontSize: 13,
    padding: '5px 0',
    borderBottom: '1px solid #3c4043',
  },
  totalBox: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '12px 0',
    marginBottom: 16,
    borderTop: '1px solid #3c4043',
    borderBottom: '1px solid #3c4043',
  },
  btnPagar: {
    display: 'block',
    width: '100%',
    padding: '16px',
    background: '#009ee3',
    color: '#fff',
    fontWeight: 800,
    fontSize: 17,
    textAlign: 'center',
    borderRadius: 10,
    textDecoration: 'none',
    marginBottom: 12,
    transition: 'filter 0.2s',
  },
}
