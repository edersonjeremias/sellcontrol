import { useState, useEffect, useRef } from 'react'
import { useParams, Link } from 'react-router-dom'
import PortalToastProvider, { usePortalToast } from '../../components/portal/PortalToast'
import LojaHeader from '../../components/loja/LojaHeader'
import { relogio } from '../../components/loja/CarrinhoPainel'
import { tituloPeca } from '../../components/loja/CardPeca'
import { limparPedidoSalvo } from './useCarrinhoLoja'
import { buscarPedido, confirmarPedido } from '../../services/lojaCheckoutService'
import '../../styles/portal.css'
import './loja.css'

// ============================================================================
// Acompanhamento do pedido — /loja/:slug/pedido/:pedidoId
// ============================================================================
// É onde a cliente paga o PIX e onde o Mercado Pago a devolve depois do
// cartão. Enquanto ela espera, a página mesma pergunta ao Mercado Pago se o
// dinheiro entrou: o webhook faz o mesmo trabalho, mas pode atrasar, e quem
// acabou de pagar não deve ficar olhando uma tela parada.
// ============================================================================

const moeda = v => Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

const INTERVALO_CONSULTA = 5000

function Pedido() {
  const { slug, pedidoId } = useParams()
  const toast = usePortalToast()

  const [pedido, setPedido] = useState(null)
  const [loja, setLoja] = useState(null)
  const [erro, setErro] = useState('')
  const [carregando, setCarregando] = useState(true)
  const [restante, setRestante] = useState(0)
  const [copiado, setCopiado] = useState(false)
  const [numeroPedido, setNumeroPedido] = useState(null)

  const pagoRef = useRef(false)

  // ── Carrega o pedido ─────────────────────────────────────────────────────
  useEffect(() => {
    let vivo = true
    buscarPedido(pedidoId)
      .then(r => {
        if (!vivo) return
        setLoja(r.loja)
        setPedido(r.pedido)
        if (r.pedido.status === 'pago') {
          pagoRef.current = true
          limparPedidoSalvo(slug)
        }
      })
      .catch(err => { if (vivo) setErro(err.message || 'Não foi possível abrir seu pedido') })
      .finally(() => { if (vivo) setCarregando(false) })
    return () => { vivo = false }
  }, [pedidoId, slug])

  // ── Enquanto não paga, pergunta ao Mercado Pago ──────────────────────────
  useEffect(() => {
    if (!pedido || pedido.status === 'pago') return

    let vivo = true
    const perguntar = async () => {
      try {
        const r = await confirmarPedido(pedidoId)
        if (!vivo) return
        if (r.ok && (r.pago || r.ja_confirmado)) {
          pagoRef.current = true
          setNumeroPedido(r.numero_pedido || null)
          limparPedidoSalvo(slug)
          const atual = await buscarPedido(pedidoId)
          if (vivo) setPedido(atual.pedido)
        }
      } catch {
        // Falha de rede numa consulta não interrompe: a próxima tenta de novo
      }
    }

    const timer = setInterval(perguntar, INTERVALO_CONSULTA)
    perguntar()
    return () => { vivo = false; clearInterval(timer) }
  }, [pedido?.status, pedidoId, slug])

  // ── Relógio do PIX ───────────────────────────────────────────────────────
  useEffect(() => {
    const limite = pedido?.pix?.expiracao ? new Date(pedido.pix.expiracao).getTime() : 0
    if (!limite || pedido?.status === 'pago') return

    const tique = () => setRestante(Math.max(0, Math.round((limite - Date.now()) / 1000)))
    tique()
    const timer = setInterval(tique, 1000)
    return () => clearInterval(timer)
  }, [pedido?.pix?.expiracao, pedido?.status])

  function copiarPix() {
    if (!pedido?.pix?.qr_code) return
    navigator.clipboard?.writeText(pedido.pix.qr_code)
      .then(() => { setCopiado(true); setTimeout(() => setCopiado(false), 2000) })
      .catch(() => toast('Não foi possível copiar. Segure o dedo no código para copiar.', 'error'))
  }

  if (carregando) {
    return <div className="loja-root"><div className="loja-aviso"><p>Abrindo seu pedido…</p></div></div>
  }

  if (erro || !pedido) {
    return (
      <div className="loja-root">
        <div className="loja-aviso">
          <h2>Não foi possível abrir seu pedido</h2>
          <p>{erro}</p>
          <Link to={`/loja/${slug}`} className="loja-btn" style={{ marginTop: 16 }}>Ver a loja</Link>
        </div>
      </div>
    )
  }

  const pago = pedido.status === 'pago'
  const expirou = !pago && restante === 0 && pedido.pix

  return (
    <div className="loja-root">
      <LojaHeader nome={loja?.nome || 'Loja'} slug={slug} quantidade={0} onAbrirCarrinho={() => {}} mostrarVoltar />

      <div className="loja-checkout">
        {pago ? (
          <section className="loja-bloco destaque">
            <h2>Pagamento confirmado</h2>
            <p className="loja-nota" style={{ fontSize: 14 }}>
              Seu pedido <b>{pedido.codigo}</b>{numeroPedido ? <> (romaneio {numeroPedido})</> : null} já entrou
              na produção. O frete está pago: assim que a peça for separada e embalada, a etiqueta sai e você
              recebe o rastreio no WhatsApp.
            </p>
            <Link to={`/loja/${slug}`} className="loja-btn largo" style={{ marginTop: 16 }}>
              Continuar vendo peças
            </Link>
          </section>
        ) : pedido.forma_pagamento === 'pix' && pedido.pix ? (
          <section className="loja-bloco">
            <h2>Pague com PIX para garantir as peças</h2>

            {expirou ? (
              <p className="loja-nota" style={{ fontSize: 14 }}>
                Este código expirou. Se as peças ainda estiverem na loja, monte a sacola de novo.
              </p>
            ) : (
              <>
                <p className="loja-prazo">
                  O código vale por <span className={`loja-relogio ${restante <= 120 ? 'urgente' : ''}`}>{relogio(restante)}</span>
                </p>

                {pedido.pix.qr_code_base64 && (
                  <div className="loja-qr">
                    <img src={`data:image/png;base64,${pedido.pix.qr_code_base64}`} alt="QR Code do PIX" />
                  </div>
                )}

                <button type="button" className="loja-btn largo" onClick={copiarPix}>
                  {copiado ? 'Código copiado' : 'Copiar código PIX'}
                </button>
                <p className="loja-nota">
                  Abra o app do banco, escolha PIX copia e cola e confirme. Esta tela avisa sozinha
                  quando o pagamento entrar — pode deixar aberta.
                </p>
              </>
            )}
          </section>
        ) : (
          <section className="loja-bloco">
            <h2>Esperando a confirmação</h2>
            <p className="loja-nota" style={{ fontSize: 14 }}>
              Assim que o Mercado Pago confirmar o pagamento, seu pedido entra na produção.
              Esta tela avisa sozinha — pode deixar aberta.
            </p>
          </section>
        )}

        {/* ── O que foi comprado ── */}
        <section className="loja-bloco">
          <h2>Pedido {pedido.codigo}</h2>
          {pedido.itens.map(item => (
            <div key={item.id} className="loja-item">
              <div className="loja-item-foto">
                {item.imagem ? <img src={item.imagem} alt="" loading="lazy" /> : null}
              </div>
              <div className="loja-item-texto">
                {tituloPeca(item) || `Peça ${item.codigo}`}
                <br /><b>{moeda(item.preco)}</b>
              </div>
            </div>
          ))}

          <div className="loja-resumo" style={{ marginTop: 14 }}>
            <div><span>Peças</span><span>{moeda(pedido.valor_itens)}</span></div>
            <div>
              <span>Frete{pedido.frete ? ` — ${pedido.frete.transportadora} ${pedido.frete.servico}` : ''}</span>
              <span>{moeda(pedido.valor_frete)}</span>
            </div>
            <div className="total"><span>Total</span><span>{moeda(pedido.total)}</span></div>
          </div>

          {pedido.endereco && (
            <p className="loja-nota">
              Entrega em {pedido.endereco.rua}, {pedido.endereco.numero}
              {pedido.endereco.complemento ? ` — ${pedido.endereco.complemento}` : ''} ·
              {' '}{pedido.endereco.bairro}, {pedido.endereco.cidade}/{pedido.endereco.estado}
            </p>
          )}
        </section>
      </div>
    </div>
  )
}

export default function PedidoPage() {
  return (
    <PortalToastProvider>
      <Pedido />
    </PortalToastProvider>
  )
}
