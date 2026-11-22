import { useState, useEffect, useCallback } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import PortalToastProvider, { usePortalToast } from '../../components/portal/PortalToast'
import LojaHeader from '../../components/loja/LojaHeader'
import { relogio } from '../../components/loja/CarrinhoPainel'
import { tituloPeca, legendaPeca } from '../../components/loja/CardPeca'
import ModalEntrar from '../../components/loja/ModalEntrar'
import { lerPedidoSalvo } from './useCarrinhoLoja'
import { portalSb } from '../../lib/portalSupabase'
import {
  buscarPedido, identificar, cotarFrete, pagar, buscarCep, dadosDoPortal,
} from '../../services/lojaCheckoutService'
import '../../styles/portal.css'
import './loja.css'

// ============================================================================
// Checkout — /loja/:slug/checkout
// ============================================================================
// Três passos numa página só, na ordem em que a cliente consegue responder:
// quem é ela, para onde vai e como paga. O frete só pode ser calculado depois
// do CEP, e o pagamento só depois do frete escolhido — por isso cada bloco
// abre o seguinte em vez de tudo aparecer de uma vez.
// ============================================================================

const moeda = v => Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

const mascaraCep = v => v.replace(/\D/g, '').slice(0, 8).replace(/^(\d{5})(\d)/, '$1-$2')

const mascaraTelefone = v => {
  const d = v.replace(/\D/g, '').slice(0, 11)
  if (d.length <= 10) return d.replace(/^(\d{2})(\d)/, '($1) $2').replace(/(\d{4})(\d)/, '$1-$2')
  return d.replace(/^(\d{2})(\d)/, '($1) $2').replace(/(\d{5})(\d)/, '$1-$2')
}

const mascaraCpf = v => v.replace(/\D/g, '').slice(0, 11)
  .replace(/^(\d{3})(\d)/, '$1.$2')
  .replace(/^(\d{3})\.(\d{3})(\d)/, '$1.$2.$3')
  .replace(/\.(\d{3})(\d{1,2})$/, '.$1-$2')

function Campo({ rotulo, children, largura }) {
  return (
    <label className="loja-campo" style={largura ? { gridColumn: `span ${largura}` } : undefined}>
      <span>{rotulo}</span>
      {children}
    </label>
  )
}

function Checkout() {
  const { slug } = useParams()
  const navegar = useNavigate()
  const toast = usePortalToast()

  const [pedidoId] = useState(() => lerPedidoSalvo(slug))
  const [pedido, setPedido] = useState(null)
  const [loja, setLoja] = useState(null)
  const [carregando, setCarregando] = useState(true)
  const [erroFatal, setErroFatal] = useState('')
  const [restante, setRestante] = useState(0)

  const [cliente, setCliente] = useState({ nome: '', whatsapp: '', cpf: '', email: '' })
  const [endereco, setEndereco] = useState({
    cep: '', rua: '', numero: '', complemento: '', bairro: '', cidade: '', estado: '',
  })

  const [cotacoes, setCotacoes] = useState([])
  const [freteId, setFreteId] = useState('')
  const [cotando, setCotando] = useState(false)
  const [pagando, setPagando] = useState(false)

  // Conta do portal: quem já compra nas lives entra e não vira cadastro novo
  const [entrarAberto, setEntrarAberto] = useState(false)
  const [portalToken, setPortalToken] = useState(null)
  const [portalInsta, setPortalInsta] = useState('')
  const [enderecosSalvos, setEnderecosSalvos] = useState([])

  // ── Carrega o pedido montado na vitrine ──────────────────────────────────
  useEffect(() => {
    if (!pedidoId) {
      setCarregando(false)
      setErroFatal('vazio')
      return
    }
    let vivo = true
    buscarPedido(pedidoId)
      .then(r => {
        if (!vivo) return
        setLoja(r.loja)
        setPedido(r.pedido)
        setCotacoes(r.pedido.cotacoes || [])
        setFreteId(r.pedido.frete?.id || '')
        if (r.pedido.cliente?.nome) setCliente(r.pedido.cliente)
        if (r.pedido.endereco) setEndereco(e => ({ ...e, ...r.pedido.endereco }))
        if (!r.pedido.itens?.length) setErroFatal('vazio')
      })
      .catch(err => { if (vivo) setErroFatal(err.message || 'Não foi possível abrir seu pedido') })
      .finally(() => { if (vivo) setCarregando(false) })
    return () => { vivo = false }
  }, [pedidoId])

  // ── Cronômetro da reserva ────────────────────────────────────────────────
  useEffect(() => {
    const limite = pedido?.reserva_expira_em ? new Date(pedido.reserva_expira_em).getTime() : 0
    if (!limite) return

    const tique = () => {
      const segundos = Math.max(0, Math.round((limite - Date.now()) / 1000))
      setRestante(segundos)
      if (segundos === 0) setErroFatal('expirado')
    }
    tique()
    const timer = setInterval(tique, 1000)
    return () => clearInterval(timer)
  }, [pedido?.reserva_expira_em])

  // ── Conta do portal ──────────────────────────────────────────────────────
  // Puxa nome, CPF e endereços já cadastrados. A cliente confere e, se quiser,
  // troca — o que ela deixar na tela é o que vale para esta entrega.
  const aplicarPortal = useCallback(async (token) => {
    try {
      const r = await dadosDoPortal(pedidoId, token)
      setPortalToken(token)
      setPortalInsta(r.instagram || '')
      setCliente(c => ({
        nome: r.cliente.nome || c.nome,
        whatsapp: r.cliente.whatsapp || c.whatsapp,
        cpf: r.cliente.cpf || c.cpf,
        email: r.cliente.email || c.email,
      }))
      setEnderecosSalvos(r.enderecos || [])
      if (r.enderecos?.length) {
        const { id, apelido, ...campos } = r.enderecos[0]
        setEndereco(e => ({ ...e, ...campos }))
      }
      toast(`Olá, @${r.instagram}! Seus dados já estão aqui.`, 'success')
    } catch (err) {
      toast(err.message || 'Não foi possível carregar seus dados', 'error')
    }
  }, [pedidoId, toast])

  // Sessão do portal já aberta neste aparelho: aproveita sem pedir senha
  useEffect(() => {
    if (!pedidoId) return
    let vivo = true
    portalSb.auth.getSession().then(({ data }) => {
      const token = data?.session?.access_token
      if (vivo && token) aplicarPortal(token)
    })
    return () => { vivo = false }
  }, [pedidoId, aplicarPortal])

  const preencherPeloCep = useCallback(async (valor) => {
    const achado = await buscarCep(valor).catch(() => null)
    if (!achado) return toast('CEP não encontrado', 'error')
    setEndereco(e => ({ ...e, ...achado }))
  }, [toast])

  // ── Calcular frete ───────────────────────────────────────────────────────
  async function calcularFrete() {
    setCotando(true)
    try {
      // Os dados vão antes: é o CEP salvo no pedido que o servidor usa na cotação
      await identificar(pedidoId, cliente, endereco, portalToken)
      const r = await cotarFrete(pedidoId)
      setCotacoes(r.cotacoes || [])
      setFreteId(r.cotacoes?.[0]?.id || '') // a mais barata já vem marcada
      if (!r.cotacoes?.length) toast('Nenhuma transportadora entrega nesse endereço', 'error')
    } catch (err) {
      toast(err.message || 'Não foi possível calcular o frete', 'error')
      if (err.status === 409) setErroFatal('expirado')
    } finally {
      setCotando(false)
    }
  }

  // ── Pagar ────────────────────────────────────────────────────────────────
  async function finalizar(forma) {
    if (!freteId) return toast('Escolha uma opção de frete', 'error')
    setPagando(true)
    try {
      const r = await pagar(pedidoId, freteId, forma)
      if (forma === 'cartao' && r.link) {
        // O Mercado Pago devolve a cliente na página do pedido pela back_url
        window.location.href = r.link
        return
      }
      navegar(`/loja/${slug}/pedido/${pedidoId}`)
    } catch (err) {
      toast(err.message || 'Não foi possível iniciar o pagamento', 'error')
      if (err.status === 409) setErroFatal('expirado')
      setPagando(false)
    }
  }

  const freteEscolhido = cotacoes.find(c => c.id === freteId)
  const total = Number(pedido?.valor_itens || 0) + Number(freteEscolhido?.valor || 0)

  const dadosCompletos =
    cliente.nome.trim().length > 2 &&
    cliente.whatsapp.replace(/\D/g, '').length >= 10 &&
    cliente.cpf.replace(/\D/g, '').length === 11 &&
    cliente.email.includes('@') &&
    endereco.cep.replace(/\D/g, '').length === 8 &&
    endereco.rua && endereco.numero && endereco.bairro && endereco.cidade && endereco.estado

  if (carregando) {
    return (
      <div className="loja-root">
        <div className="loja-aviso"><p>Abrindo seu pedido…</p></div>
      </div>
    )
  }

  if (erroFatal) {
    const expirou = erroFatal === 'expirado'
    const vazio = erroFatal === 'vazio'
    return (
      <div className="loja-root">
        <LojaHeader nome={loja?.nome || 'Loja'} slug={slug} quantidade={0} onAbrirCarrinho={() => navegar(`/loja/${slug}`)} mostrarVoltar />
        <div className="loja-aviso">
          <h2>{expirou ? 'O tempo da reserva acabou' : vazio ? 'Sua sacola está vazia' : 'Não foi possível abrir seu pedido'}</h2>
          <p>
            {expirou
              ? 'As peças voltaram para a loja. Se ainda estiverem lá, dá para montar a sacola de novo.'
              : vazio
                ? 'Escolha as peças que você quer e volte aqui para fechar o pedido.'
                : erroFatal}
          </p>
          <Link to={`/loja/${slug}`} className="loja-btn" style={{ marginTop: 16 }}>Ver a loja</Link>
        </div>
      </div>
    )
  }

  return (
    <div className="loja-root">
      <LojaHeader
        nome={loja?.nome || 'Loja'}
        slug={slug}
        quantidade={pedido?.itens?.length || 0}
        onAbrirCarrinho={() => navegar(`/loja/${slug}`)}
        mostrarVoltar
      />

      <div className="loja-checkout">
        {restante > 0 && (
          <p className="loja-prazo">
            Suas peças estão guardadas por{' '}
            <span className={`loja-relogio ${restante <= 120 ? 'urgente' : ''}`}>{relogio(restante)}</span>
          </p>
        )}

        {/* ── Peças ── */}
        <section className="loja-bloco">
          <h2>Sua sacola</h2>
          {pedido.itens.map(item => (
            <div key={item.id} className="loja-item">
              <div className="loja-item-foto">
                {item.imagem ? <img src={item.imagem} alt="" loading="lazy" /> : null}
              </div>
              <div className="loja-item-texto">
                {tituloPeca(item) || `Peça ${item.codigo}`}
                {legendaPeca(item) && <><br />{legendaPeca(item)}</>}
                <br /><b>{moeda(item.preco)}</b>
              </div>
            </div>
          ))}
          <div className="loja-painel-total">
            <span>{pedido.itens.length} {pedido.itens.length === 1 ? 'peça' : 'peças'}</span>
            <b>{moeda(pedido.valor_itens)}</b>
          </div>
        </section>

        {/* ── Dados ── */}
        <section className="loja-bloco">
          <h2>Seus dados</h2>

          {portalInsta ? (
            <p className="loja-nota" style={{ marginTop: 0, marginBottom: 12, color: 'var(--p-green)' }}>
              Você entrou como <b>@{portalInsta}</b>. Suas compras ficam todas juntas.
            </p>
          ) : (
            <button
              type="button"
              className="loja-btn secundario largo"
              style={{ marginBottom: 12 }}
              onClick={() => setEntrarAberto(true)}
            >
              Já compro com vocês? Entrar
            </button>
          )}

          <div className="loja-form">
            <Campo rotulo="Nome completo" largura={2}>
              <input
                value={cliente.nome}
                onChange={e => setCliente(c => ({ ...c, nome: e.target.value }))}
                placeholder="Como está no documento"
                autoComplete="name"
              />
            </Campo>
            <Campo rotulo="WhatsApp">
              <input
                value={mascaraTelefone(cliente.whatsapp)}
                onChange={e => setCliente(c => ({ ...c, whatsapp: e.target.value.replace(/\D/g, '') }))}
                placeholder="(00) 00000-0000"
                inputMode="numeric"
                autoComplete="tel"
              />
            </Campo>
            <Campo rotulo="CPF">
              <input
                value={mascaraCpf(cliente.cpf)}
                onChange={e => setCliente(c => ({ ...c, cpf: e.target.value.replace(/\D/g, '') }))}
                placeholder="000.000.000-00"
                inputMode="numeric"
              />
            </Campo>
            <Campo rotulo="E-mail" largura={2}>
              <input
                type="email"
                value={cliente.email}
                onChange={e => setCliente(c => ({ ...c, email: e.target.value }))}
                placeholder="para o comprovante e o rastreio"
                autoComplete="email"
              />
            </Campo>
          </div>
          <p className="loja-nota">O CPF é exigido pela transportadora para emitir a etiqueta.</p>
        </section>

        {/* ── Entrega ── */}
        <section className="loja-bloco">
          <h2>Entrega</h2>

          {enderecosSalvos.length > 1 && (
            <div className="loja-chips" style={{ padding: '0 0 12px' }}>
              {enderecosSalvos.map(e => (
                <button
                  key={e.id}
                  type="button"
                  className={`loja-chip ${endereco.cep === e.cep && endereco.numero === e.numero ? 'ativo' : ''}`}
                  onClick={() => {
                    const { id, apelido, ...campos } = e
                    setEndereco(atual => ({ ...atual, ...campos }))
                  }}
                >
                  {e.apelido || `${e.rua}, ${e.numero}`}
                </button>
              ))}
            </div>
          )}

          <div className="loja-form">
            <Campo rotulo="CEP">
              <input
                value={mascaraCep(endereco.cep)}
                onChange={e => {
                  const v = e.target.value.replace(/\D/g, '')
                  setEndereco(en => ({ ...en, cep: v }))
                  if (v.length === 8) preencherPeloCep(v)
                }}
                placeholder="00000-000"
                inputMode="numeric"
                autoComplete="postal-code"
              />
            </Campo>
            <Campo rotulo="Número">
              <input
                value={endereco.numero}
                onChange={e => setEndereco(en => ({ ...en, numero: e.target.value }))}
                placeholder="123"
              />
            </Campo>
            <Campo rotulo="Rua" largura={2}>
              <input
                value={endereco.rua}
                onChange={e => setEndereco(en => ({ ...en, rua: e.target.value }))}
              />
            </Campo>
            <Campo rotulo="Complemento" largura={2}>
              <input
                value={endereco.complemento}
                onChange={e => setEndereco(en => ({ ...en, complemento: e.target.value }))}
                placeholder="apto, bloco, referência"
              />
            </Campo>
            <Campo rotulo="Bairro">
              <input
                value={endereco.bairro}
                onChange={e => setEndereco(en => ({ ...en, bairro: e.target.value }))}
              />
            </Campo>
            <Campo rotulo="Cidade">
              <input
                value={endereco.cidade}
                onChange={e => setEndereco(en => ({ ...en, cidade: e.target.value }))}
              />
            </Campo>
            <Campo rotulo="Estado">
              <input
                value={endereco.estado}
                onChange={e => setEndereco(en => ({ ...en, estado: e.target.value.toUpperCase().slice(0, 2) }))}
                placeholder="SP"
              />
            </Campo>
          </div>

          <button
            type="button"
            className="loja-btn secundario largo"
            style={{ marginTop: 14 }}
            onClick={calcularFrete}
            disabled={!dadosCompletos || cotando}
          >
            {cotando ? 'Calculando…' : cotacoes.length ? 'Calcular frete de novo' : 'Calcular frete'}
          </button>
          {!dadosCompletos && (
            <p className="loja-nota">Complete seus dados e o endereço para calcular o frete.</p>
          )}
        </section>

        {/* ── Frete ── */}
        {cotacoes.length > 0 && (
          <section className="loja-bloco">
            <h2>Como você quer receber</h2>
            {cotacoes.map(c => (
              <label key={c.id} className={`loja-opcao ${freteId === c.id ? 'ativa' : ''}`}>
                <input
                  type="radio"
                  name="frete"
                  checked={freteId === c.id}
                  onChange={() => setFreteId(c.id)}
                />
                <span className="loja-opcao-texto">
                  <b>{c.transportadora} {c.servico}</b>
                  {c.prazo ? <span>chega em até {c.prazo} {c.prazo === 1 ? 'dia útil' : 'dias úteis'}</span> : null}
                </span>
                <span className="loja-opcao-valor">{moeda(c.valor)}</span>
              </label>
            ))}
          </section>
        )}

        {/* ── Pagamento ── */}
        {freteEscolhido && (
          <section className="loja-bloco">
            <h2>Pagamento</h2>
            <div className="loja-resumo">
              <div><span>Peças</span><span>{moeda(pedido.valor_itens)}</span></div>
              <div><span>Frete</span><span>{moeda(freteEscolhido.valor)}</span></div>
              <div className="total"><span>Total</span><span>{moeda(total)}</span></div>
            </div>

            <button type="button" className="loja-btn largo" onClick={() => finalizar('pix')} disabled={pagando}>
              {pagando ? 'Abrindo…' : 'Pagar com PIX'}
            </button>
            <button
              type="button"
              className="loja-btn secundario largo"
              style={{ marginTop: 10 }}
              onClick={() => finalizar('cartao')}
              disabled={pagando}
            >
              Pagar com cartão
            </button>
            <p className="loja-nota">
              As peças ficam guardadas enquanto o pagamento estiver aberto. Confirmado o pagamento,
              o pedido entra na produção e sai com o frete já pago.
            </p>
          </section>
        )}
      </div>

      {entrarAberto && (
        <ModalEntrar
          onFechar={() => setEntrarAberto(false)}
          onEntrou={async (token) => {
            setEntrarAberto(false)
            await aplicarPortal(token)
          }}
        />
      )}
    </div>
  )
}

export default function CheckoutPage() {
  return (
    <PortalToastProvider>
      <Checkout />
    </PortalToastProvider>
  )
}
