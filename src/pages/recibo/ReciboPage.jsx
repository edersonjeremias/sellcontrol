import { useState, useEffect } from 'react'
import { useParams } from 'react-router-dom'
import { getCobrancaById, formatMoeda, dividirPagamento } from '../../services/cobrancasService'
import { supabase } from '../../lib/supabase'

function fmtData(iso) {
  if (!iso) return ''
  const [y, m, d] = String(iso).slice(0, 10).split('-')
  return `${d}/${m}/${y}`
}

const STATUS_LABEL = { PAGO: 'Pago ✅', BAIXADO: 'Pago ✅', CANCELADO: 'Cancelado ❌', PENDENTE: 'Aguardando Pagamento', ENVIADO: 'Aguardando Pagamento', REENVIADO: 'Aguardando Pagamento', LEMBRETE: 'Aguardando Pagamento' }
const STATUS_COR   = { PAGO: '#81c995', BAIXADO: '#81c995', CANCELADO: '#f28b82', PENDENTE: '#fbbc04' }

async function chamarConfirmacao(cobrancaId, paymentId, externalReference) {
  try {
    const resp = await fetch('/api/confirmar-pagamento', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ cobrancaId, paymentId, externalReference }),
    })
    return await resp.json()
  } catch {
    return { ok: false }
  }
}

export default function ReciboPage() {
  const { id }       = useParams()
  const [cob, setCob] = useState(null)
  const [erro, setErro] = useState(false)
  const [verificando, setVerificando] = useState(false)
  const [verificado,  setVerificado]  = useState(false)
  const [nomeEmpresa, setNomeEmpresa] = useState('Carregando...')

  // Estados para divisão de pagamento
  const [showDividir, setShowDividir] = useState(false)
  const [valorP1, setValorP1] = useState('')
  const [dividindo, setDividindo] = useState(false)
  const [erroDivisao, setErroDivisao] = useState('')

  const carregarCob = async () => {
    if (!id) { setErro(true); return }
    setErro(false)
    try {
      const res = await getCobrancaById(id)
      if (!res) { setErro(true); return }
      setCob(res)

      // Buscar nome da empresa
      if (res.tenant_id) {
        const { data: config } = await supabase
          .from('configuracoes')
          .select('nome_loja')
          .eq('tenant_id', res.tenant_id)
          .single()
        if (config?.nome_loja) {
          setNomeEmpresa(config.nome_loja)
        }
      }
    } catch {
      setErro(true)
    }
  }

  // Carregamento inicial
  useEffect(() => { carregarCob() }, [id])

  // Auto-confirmação: MP redireciona de volta com params após pagamento
  useEffect(() => {
    if (!id) return
    const params = new URLSearchParams(window.location.search)
    const collectionStatus = params.get('collection_status') || params.get('status')
    const paymentId        = params.get('collection_id') || params.get('payment_id')
    const extRef           = params.get('external_reference')

    if (collectionStatus === 'approved' && paymentId) {
      setVerificando(true)
      chamarConfirmacao(id, paymentId, extRef).then(() => {
        setVerificando(false)
        setVerificado(true)
        carregarCob()
      })
    }
  }, [id])

  const handleVerificar = async () => {
    setVerificando(true)
    await chamarConfirmacao(id)
    setVerificando(false)
    setVerificado(true)
    carregarCob()
  }

  const handleDividir = async () => {
    setErroDivisao('')

    const v1 = parseFloat(String(valorP1).replace(',', '.'))
    const total = Number(cob.total)

    // Validações
    if (!valorP1 || isNaN(v1)) {
      setErroDivisao('Informe um valor válido.')
      return
    }
    if (v1 < 10) {
      setErroDivisao('Valor mínimo por parte: R$ 10,00')
      return
    }
    if (v1 >= total - 10) {
      setErroDivisao('A segunda parte deve ser no mínimo R$ 10,00')
      return
    }

    setDividindo(true)
    try {
      const { dados_divisao } = await dividirPagamento(cob, v1, cob.tenant_id)
      setCob(prev => ({ ...prev, dados_divisao }))
      setShowDividir(false)
      setValorP1('')
    } catch (err) {
      setErroDivisao(err.message || 'Erro ao dividir pagamento')
    } finally {
      setDividindo(false)
    }
  }

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

  const itens       = Array.isArray(cob.itens) ? cob.itens : []
  const statusCor   = STATUS_COR[cob.status]   || '#9aa0a6'
  const statusLabel = STATUS_LABEL[cob.status] || cob.status
  const pago        = cob.status === 'PAGO' || cob.status === 'BAIXADO'
  const div         = cob.dados_divisao || null
  const div_p1_pago = div?.status_p1 === 'PAGO'
  const div_p2_pago = div?.status_p2 === 'PAGO'

  return (
    <div style={estilos.pagina}>
      <div style={estilos.card}>

        {/* Cabeçalho */}
        <div style={estilos.header}>
          <div style={{ fontSize: 22, fontWeight: 800, color: '#e8eaed' }}>{nomeEmpresa}</div>
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

        {/* Pagamento dividido */}
        {!pago && div && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 4 }}>
            <div style={{ fontSize: 12, color: '#9aa0a6', textAlign: 'center', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
              Pagamento dividido em 2 partes
            </div>

            {/* Parte 1 */}
            {div_p1_pago ? (
              <div style={{ textAlign: 'center', padding: '12px', background: 'rgba(129,201,149,0.12)', borderRadius: 8, border: '1px solid rgba(129,201,149,0.3)', color: '#81c995', fontWeight: 700, fontSize: 14 }}>
                ✅ Parte 1 — R$ {Number(div.valor_p1).toFixed(2).replace('.', ',')} — Pago
              </div>
            ) : (
              <a href={div.link_p1} target="_blank" rel="noopener noreferrer" style={{ ...estilos.btnPagar, background: '#009ee3', marginBottom: 0 }}>
                💳 Pagar Parte 1 — R$ {Number(div.valor_p1).toFixed(2).replace('.', ',')}
              </a>
            )}

            {/* Parte 2 */}
            {div_p2_pago ? (
              <div style={{ textAlign: 'center', padding: '12px', background: 'rgba(129,201,149,0.12)', borderRadius: 8, border: '1px solid rgba(129,201,149,0.3)', color: '#81c995', fontWeight: 700, fontSize: 14 }}>
                ✅ Parte 2 — R$ {Number(div.valor_p2).toFixed(2).replace('.', ',')} — Pago
              </div>
            ) : (
              <a href={div.link_p2} target="_blank" rel="noopener noreferrer" style={{ ...estilos.btnPagar, background: '#6e3fd9', marginBottom: 0 }}>
                💳 Pagar Parte 2 — R$ {Number(div.valor_p2).toFixed(2).replace('.', ',')}
              </a>
            )}

            {/* Botão verificar pagamento */}
            {!verificando && !verificado && (
              <button onClick={handleVerificar} style={estilos.btnVerificar}>
                🔄 Já paguei — Verificar Pagamento
              </button>
            )}
            {verificando && (
              <div style={{ textAlign: 'center', color: '#9aa0a6', fontSize: 13, padding: '8px 0' }}>
                Verificando pagamento…
              </div>
            )}
          </div>
        )}

        {/* Botão de pagamento simples (não dividido) */}
        {!pago && !div && cob.link_mp && cob.link_mp !== 'Pago com Crédito' && (
          <>
            <a
              href={cob.link_mp}
              target="_blank"
              rel="noopener noreferrer"
              style={estilos.btnPagar}
            >
              💳 Pagar Agora
            </a>

            {/* Botão dividir pagamento - só aparece se total >= 20 */}
            {Number(cob.total) >= 20 && (
              <button
                onClick={() => setShowDividir(true)}
                style={estilos.btnDividir}
              >
                ✂️ Dividir Pagamento
              </button>
            )}
          </>
        )}

        {pago && (
          <div style={{ textAlign: 'center', padding: '14px', background: 'rgba(129,201,149,0.12)', borderRadius: 8, border: '1px solid rgba(129,201,149,0.3)', color: '#81c995', fontWeight: 700, fontSize: 15 }}>
            Pagamento confirmado! ✅
          </div>
        )}

        {!pago && !div && (!cob.link_mp || cob.link_mp === 'Pago com Crédito') && (
          <div style={{ textAlign: 'center', padding: '14px', background: 'rgba(251,188,4,0.1)', borderRadius: 8, border: '1px solid rgba(251,188,4,0.3)', color: '#fbbc04', fontWeight: 600, fontSize: 14 }}>
            Aguardando processamento do link de pagamento
          </div>
        )}

        <div style={{ textAlign: 'center', marginTop: 20, fontSize: 12, color: '#5f6368' }}>
          Em caso de dúvidas, entre em contato via WhatsApp
        </div>
      </div>

      {/* Modal Dividir Pagamento */}
      {showDividir && (
        <div
          style={estilos.modalOverlay}
          onClick={e => e.target === e.currentTarget && setShowDividir(false)}
        >
          <div style={estilos.modalBox}>
            <div style={{ fontSize: 18, fontWeight: 700, color: '#e8eaed', marginBottom: 16 }}>
              ✂️ Dividir Pagamento
            </div>

            <div style={{ marginBottom: 12 }}>
              <div style={{ fontSize: 12, color: '#9aa0a6', marginBottom: 4 }}>Total</div>
              <div style={{ fontSize: 20, fontWeight: 700, color: '#e8eaed' }}>
                R$ {Number(cob.total).toFixed(2).replace('.', ',')}
              </div>
            </div>

            <div style={{ marginBottom: 16 }}>
              <label style={{ display: 'block', fontSize: 12, color: '#9aa0a6', marginBottom: 6 }}>
                Quanto quer pagar agora? (Mínimo R$ 10,00)
              </label>
              <input
                type="text"
                value={valorP1}
                onChange={e => setValorP1(e.target.value)}
                placeholder="Ex: 50,00"
                style={estilos.modalInput}
              />
            </div>

            {valorP1 && !isNaN(parseFloat(valorP1.replace(',', '.'))) && (
              <div style={{ marginBottom: 16, padding: 10, background: 'rgba(129,201,149,0.1)', borderRadius: 6 }}>
                <div style={{ fontSize: 12, color: '#9aa0a6' }}>Restante (Parte 2)</div>
                <div style={{ fontSize: 16, fontWeight: 700, color: '#81c995' }}>
                  R$ {(Number(cob.total) - parseFloat(valorP1.replace(',', '.'))).toFixed(2).replace('.', ',')}
                </div>
              </div>
            )}

            {erroDivisao && (
              <div style={{ marginBottom: 12, padding: 10, background: 'rgba(242,139,130,0.1)', borderRadius: 6, color: '#f28b82', fontSize: 13 }}>
                {erroDivisao}
              </div>
            )}

            <div style={{ display: 'flex', gap: 8 }}>
              <button
                onClick={() => { setShowDividir(false); setValorP1(''); setErroDivisao('') }}
                style={estilos.btnCancelar}
                disabled={dividindo}
              >
                Cancelar
              </button>
              <button
                onClick={handleDividir}
                style={estilos.btnConfirmar}
                disabled={dividindo}
              >
                {dividindo ? 'Gerando...' : 'Gerar Links de Pagamento'}
              </button>
            </div>
          </div>
        </div>
      )}
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
  btnVerificar: {
    display: 'block',
    width: '100%',
    padding: '12px',
    background: 'rgba(255,255,255,0.06)',
    color: '#9aa0a6',
    fontWeight: 600,
    fontSize: 14,
    textAlign: 'center',
    borderRadius: 8,
    border: '1px solid rgba(255,255,255,0.1)',
    cursor: 'pointer',
    marginTop: 4,
  },
  btnDividir: {
    display: 'block',
    width: '100%',
    padding: '12px',
    background: 'rgba(110,63,217,0.12)',
    color: '#a78bfa',
    fontWeight: 700,
    fontSize: 14,
    textAlign: 'center',
    borderRadius: 8,
    border: '1px solid rgba(110,63,217,0.3)',
    cursor: 'pointer',
    marginTop: 8,
  },
  modalOverlay: {
    position: 'fixed',
    inset: 0,
    background: 'rgba(0,0,0,0.75)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
    zIndex: 9999,
  },
  modalBox: {
    background: '#292a2d',
    border: '1px solid #3c4043',
    borderRadius: 16,
    padding: 24,
    width: '100%',
    maxWidth: 400,
    boxShadow: '0 8px 32px rgba(0,0,0,0.6)',
  },
  modalInput: {
    width: '100%',
    padding: '12px 14px',
    background: '#202124',
    border: '1px solid #3c4043',
    borderRadius: 8,
    color: '#e8eaed',
    fontSize: 16,
    outline: 'none',
    boxSizing: 'border-box',
  },
  btnCancelar: {
    flex: 1,
    padding: '12px',
    background: 'rgba(255,255,255,0.06)',
    color: '#9aa0a6',
    fontWeight: 600,
    fontSize: 14,
    borderRadius: 8,
    border: '1px solid rgba(255,255,255,0.1)',
    cursor: 'pointer',
  },
  btnConfirmar: {
    flex: 2,
    padding: '12px',
    background: '#009ee3',
    color: '#fff',
    fontWeight: 700,
    fontSize: 14,
    borderRadius: 8,
    border: 'none',
    cursor: 'pointer',
  },
}
