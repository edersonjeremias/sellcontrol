import { useState, useEffect, useCallback, useRef } from 'react'
import AppShell from '../../components/ui/AppShell'
import { useAuth } from '../../context/AuthContext'
import { supabase } from '../../lib/supabase'
import { gerarEtiqueta, imprimirEtiqueta, calcularFrete, salvarCotacoes } from '../../services/melhorEnvioService'
import { montarLinkFrete } from '../../services/fretePublicoService'
import { showGlobalToast } from '../../context/AppContext'
import { pesoEmKg } from '../../lib/peso'
import { linkRastreio, sincronizarRastreio } from '../../lib/rastreio'
import ModalPergunta from '../../components/ui/ModalPergunta'
import { getHistoricoRomaneio } from '../../services/pedidosService'

/**
 * Pagamento aprovado mais recente do romaneio, para distinguir o que entrou
 * pelo Mercado Pago do que foi baixado na mão.
 */
function pagamentoDoRomaneio(rom) {
  const aprovados = (rom.pagamentos_frete || [])
    .filter(p => p.status === 'aprovado')
    .sort((a, b) => new Date(b.pago_em || b.created_at) - new Date(a.pago_em || a.created_at))

  return aprovados[0] || null
}

/**
 * Orientação para os erros do Melhor Envio que a loja resolve sozinha.
 * O código vem na própria mensagem deles (ex.: E-CRT-0001).
 */
function dicaDoErro(mensagem) {
  const texto = String(mensagem || '').toLowerCase()

  if (texto.includes('valor segurado') || texto.includes('e-crt-0001')) {
    return 'Conta de pessoa física tem limite de R$ 1.500,00 de valor segurado. ' +
           'Clique em Editar e reduza o valor declarado do romaneio para até R$ 1.500,00, ' +
           'ou use uma conta empresarial no Melhor Envio.'
  }
  if (texto.includes('saldo') || texto.includes('insufficient')) {
    return 'A compra da etiqueta usa o saldo da carteira do Melhor Envio. Adicione saldo e tente de novo.'
  }
  if (texto.includes('document') || texto.includes('cpf')) {
    return 'Confira o CPF do destinatário no endereço de entrega e os dados da loja em Configurações.'
  }
  if (texto.includes('peso') || texto.includes('dimens')) {
    return 'Clique em Editar e revise o peso e as medidas da caixa.'
  }
  return null
}

function formatarDataHora(valor) {
  if (!valor) return '-'
  return new Date(valor).toLocaleString('pt-BR', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}

/** Frete pago sem transação no gateway: baixa manual ou registro perdido */
function ehBaixaManual(rom) {
  if (!['frete_pago', 'etiqueta_gerada', 'despachado', 'em_transito', 'entregue'].includes(rom.status)) return false
  const pag = pagamentoDoRomaneio(rom)
  return !pag?.gateway_transaction_id
}

// Ícones das ações da linha, no mesmo traço dos botões do resto do sistema
const IconWa = () => (
  <svg viewBox="0 0 24 24" fill="currentColor">
    <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z" />
    <path d="M12 0C5.373 0 0 5.373 0 12c0 2.118.554 4.107 1.523 5.83L.057 23.857a.5.5 0 0 0 .621.608l6.228-1.638A11.95 11.95 0 0 0 12 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm0 22a9.95 9.95 0 0 1-5.053-1.373l-.362-.214-3.747.985.986-3.645-.232-.374A9.953 9.953 0 0 1 2 12C2 6.477 6.477 2 12 2s10 4.477 10 10-4.477 10-10 10z" />
  </svg>
)

const IconEnviar = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <line x1="22" y1="2" x2="11" y2="13" /><polygon points="22 2 15 22 11 13 2 9 22 2" />
  </svg>
)

const IconSacola = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z" />
    <line x1="3" y1="6" x2="21" y2="6" /><path d="M16 10a4 4 0 0 1-8 0" />
  </svg>
)

const IconEtiqueta = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M20.59 13.41 13.42 20.6a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z" />
    <line x1="7" y1="7" x2="7.01" y2="7" />
  </svg>
)

const IconImpressora = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="6 9 6 2 18 2 18 9" />
    <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" />
    <rect x="6" y="14" width="12" height="8" />
  </svg>
)

const IconCaminhao = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="1" y="3" width="15" height="13" /><polygon points="16 8 20 8 23 11 23 16 16 16 16 8" />
    <circle cx="5.5" cy="18.5" r="2.5" /><circle cx="18.5" cy="18.5" r="2.5" />
  </svg>
)

const IconLapis = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z" />
  </svg>
)

const ITENS_POR_PAGINA = 20

const STATUS_LISTADOS = [
  'pronto', 'frete_cotado', 'frete_pago', 'etiqueta_gerada',
  'despachado', 'em_transito', 'entregue', 'retirado', 'cancelado',
]

const LABEL_STATUS = {
  preparando: 'Preparando',
  pronto: 'Pronto',
  frete_cotado: 'Cotado',
  frete_pago: 'Frete Pago',
  etiqueta_gerada: 'Etiqueta Gerada',
  despachado: 'Despachado',
  em_transito: 'Em trânsito',
  entregue: 'Entregue',
  retirado: 'Retirado na loja',
  cancelado: 'Cancelado',
}

const COR_STATUS = {
  entregue: '#81c995',
  retirado: '#ce93d8',
  despachado: '#4caf50',
  etiqueta_gerada: '#2196f3',
  frete_pago: '#ffc107',
  frete_cotado: '#9c27b0',
  cancelado: '#f44336',
}

/** Histórico de status do romaneio, alimentado por trigger no banco */
function ModalHistorico({ romaneio, onFechar }) {
  const [hist, setHist] = useState([])
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState(null)

  useEffect(() => {
    let vivo = true
    getHistoricoRomaneio(romaneio.id)
      .then(d => { if (vivo) setHist(d) })
      .catch(e => { if (vivo) setErro(e.message || 'Erro ao carregar histórico') })
      .finally(() => { if (vivo) setCarregando(false) })
    return () => { vivo = false }
  }, [romaneio.id])

  return (
    <div
      style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)', zIndex: 12000,
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20,
      }}
      onClick={e => e.target === e.currentTarget && onFechar()}
    >
      <div style={{
        background: '#1e1e1e', border: '1px solid rgba(255,255,255,0.12)',
        borderRadius: 12, width: 'min(560px, 100%)', maxHeight: '80vh',
        display: 'flex', flexDirection: 'column',
        boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
      }}>
        <div style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start',
          gap: 12, padding: '16px 20px', borderBottom: '1px solid rgba(255,255,255,0.08)',
        }}>
          <div>
            <div style={{ color: '#e8eaed', fontWeight: 700, fontSize: 15 }}>
              Histórico de status
            </div>
            <div style={{ color: '#9aa0a6', fontSize: 12, marginTop: 2 }}>
              {romaneio.numero} — @{romaneio.cliente_instagram}
            </div>
          </div>
          <button
            onClick={onFechar}
            style={{
              background: 'rgba(255,255,255,0.08)', color: '#e8eaed', border: 'none',
              borderRadius: 6, padding: '6px 12px', fontSize: 13, fontWeight: 600, cursor: 'pointer',
            }}
          >
            Fechar
          </button>
        </div>

        <div style={{ overflow: 'auto', padding: 16, display: 'flex', flexDirection: 'column', gap: 6 }}>
          {carregando && (
            <div style={{ color: '#9aa0a6', fontSize: 13, padding: 20, textAlign: 'center' }}>
              Carregando...
            </div>
          )}

          {erro && <div style={{ color: '#f28b82', fontSize: 13, padding: 12 }}>{erro}</div>}

          {!carregando && !erro && hist.length === 0 && (
            <div style={{ color: '#9aa0a6', fontSize: 13, padding: 20, textAlign: 'center' }}>
              Nenhuma alteração de status registrada ainda.
            </div>
          )}

          {hist.map(h => (
            <div key={h.id} style={{
              display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap',
              padding: '8px 10px', borderRadius: 6,
              background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)',
            }}>
              <span style={{ color: '#9aa0a6', fontSize: 11, whiteSpace: 'nowrap' }}>
                {formatarDataHora(h.created_at)}
              </span>
              <span style={{ fontSize: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ color: '#9aa0a6' }}>
                  {LABEL_STATUS[h.status_anterior] || h.status_anterior || '—'}
                </span>
                <span style={{ color: '#9aa0a6' }}>→</span>
                <span style={{ fontWeight: 700, color: COR_STATUS[h.status_novo] || '#e8eaed' }}>
                  {LABEL_STATUS[h.status_novo] || h.status_novo || '—'}
                </span>
              </span>
              <span style={{ color: '#9aa0a6', fontSize: 11, marginLeft: 'auto', whiteSpace: 'nowrap' }}>
                {h.alterado_por_nome || 'Sistema'}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

// No celular a tabela em grid não cabe na tela: a listagem vira cartões
function useIsMobile(largura = 720) {
  const [mobile, setMobile] = useState(
    typeof window !== 'undefined' ? window.innerWidth <= largura : false
  )

  useEffect(() => {
    const mq = window.matchMedia(`(max-width: ${largura}px)`)
    const aplicar = () => setMobile(mq.matches)
    aplicar()
    mq.addEventListener('change', aplicar)
    return () => mq.removeEventListener('change', aplicar)
  }, [largura])

  return mobile
}

export default function EtiquetasPage() {
  const { profile } = useAuth()
  const tenantId = profile?.tenant_id
  const isMobile = useIsMobile()

  const [romaneios, setRomaneios] = useState([])
  const [totalRegistros, setTotalRegistros] = useState(0)
  const [paginaAtual, setPaginaAtual] = useState(1)
  const [loading, setLoading] = useState(true)
  const [gerando, setGerando] = useState(null)
  const [modalAberto, setModalAberto] = useState(null)
  // instagram (minúsculo, sem @) -> whatsapp do cliente, para o botão de envio do link
  const [whatsPorInstagram, setWhatsPorInstagram] = useState({})
  // instagram -> total em aberto, para avisar quem vier retirar na loja
  const [debitoPorInstagram, setDebitoPorInstagram] = useState({})
  // Erros da transportadora ficam em modal: o toast some antes de dar tempo de ler
  const [erroModal, setErroModal] = useState(null)
  // Confirmações em modal, no lugar de window.confirm e prompt
  const [pergunta, setPergunta] = useState(null)
  const [historicoDe, setHistoricoDe] = useState(null)
  // Margem da loja: o modal mostra o valor que a cliente paga, nunca o custo
  const [margemFrete, setMargemFrete] = useState(0)
  // Endereço do portal do cliente, que vai junto no aviso de pedido da loja
  const [slugLoja, setSlugLoja] = useState('')

  // O cabeçalho da tabela gruda logo abaixo da barra de filtros, que muda
  // de altura quando os campos quebram em várias linhas no celular.
  // É callback ref porque a barra só existe depois que a lista carrega: um
  // useEffect([]) rodaria antes dela nascer e a altura ficaria em zero.
  const [alturaBarra, setAlturaBarra] = useState(0)
  const observerBarra = useRef(null)

  const barraRef = useCallback((node) => {
    observerBarra.current?.disconnect()
    if (!node) return

    // getBoundingClientRect dá a altura fracionária: arredondar para cima
    // evita a fresta de 1px por onde as linhas apareciam
    const medir = () => setAlturaBarra(Math.ceil(node.getBoundingClientRect().height))
    medir()

    observerBarra.current = new ResizeObserver(medir)
    observerBarra.current.observe(node)
  }, [])

  // Estados para cotação
  const [cotando, setCotando] = useState(false)
  const [cotacoes, setCotacoes] = useState([])
  const [cotacaoSelecionada, setCotacaoSelecionada] = useState(null)

  // Estados para edição
  const [editando, setEditando] = useState(null)
  const [formEdicao, setFormEdicao] = useState({
    altura: '',
    largura: '',
    comprimento: '',
    peso: '',
    produto_declaracao: '',
    produto_quantidade: '',
    produto_valor_declarado: '',
  })

  // Filtros
  const [busca, setBusca] = useState('')
  const [statusFiltro, setStatusFiltro] = useState('etiqueta_gerada')
  const [dataInicio, setDataInicio] = useState('')
  const [dataFim, setDataFim] = useState('')
  const [buscaAplicada, setBuscaAplicada] = useState('')

  // Espera a digitação parar antes de ir ao banco
  useEffect(() => {
    const t = setTimeout(() => {
      setBuscaAplicada(busca.trim())
      setPaginaAtual(1)
    }, 400)
    return () => clearTimeout(t)
  }, [busca])

  const carregar = useCallback(async () => {
    if (!tenantId) return
    setLoading(true)
    try {

      // Os filtros vão para o banco: a tela carrega só a página pedida
      let query = supabase
        .from('romaneios')
        .select('*, enderecos_clientes(*), pagamentos_frete(*)', { count: 'exact' })
        .eq('tenant_id', tenantId)

      if (statusFiltro === 'aguardando_pagamento') {
        query = query.in('status', ['pronto', 'frete_cotado'])
      } else if (statusFiltro && statusFiltro !== 'todos') {
        query = query.eq('status', statusFiltro)
      } else {
        query = query.in('status', STATUS_LISTADOS)
      }

      // As aspas protegem o ponto do instagram, que quebraria a sintaxe do or
      const termo = buscaAplicada.replace(/["%,]/g, '')
      if (termo) {
        query = query.or(`numero.ilike."%${termo}%",cliente_instagram.ilike."%${termo}%"`)
      }

      // Etiqueta gerada e aguardando pagamento aparecem sempre, sem corte de
      // data, para não esquecer de despachar nem de cobrar
      if (!['etiqueta_gerada', 'aguardando_pagamento'].includes(statusFiltro)) {
        if (dataInicio) {
          query = query.or(`frete_pago_em.gte.${dataInicio},and(frete_pago_em.is.null,created_at.gte.${dataInicio})`)
        }
        if (dataFim) {
          const fim = `${dataFim}T23:59:59`
          query = query.or(`frete_pago_em.lte.${fim},and(frete_pago_em.is.null,created_at.lte.${fim})`)
        }
      }

      const inicio = (paginaAtual - 1) * ITENS_POR_PAGINA
      const { data, error, count } = await query
        .order('created_at', { ascending: false })
        .range(inicio, inicio + ITENS_POR_PAGINA - 1)

      if (error) throw error
      setRomaneios(data || [])
      setTotalRegistros(count || 0)

      // WhatsApp dos clientes desses romaneios (para o link de frete)
      const instas = [...new Set((data || [])
        .map(r => String(r.cliente_instagram || '').replace('@', '').toLowerCase())
        .filter(Boolean))]

      if (instas.length) {
        const { data: clientes } = await supabase
          .from('clientes')
          .select('instagram, whatsapp')
          .eq('tenant_id', tenantId)
          .in('instagram', [...instas, ...instas.map(i => `@${i}`)])

        const mapa = {}
        for (const c of clientes || []) {
          const chave = String(c.instagram || '').replace('@', '').toLowerCase()
          if (chave && c.whatsapp) mapa[chave] = c.whatsapp
        }
        setWhatsPorInstagram(mapa)

        // Compras em aberto: mesma regra do resto do sistema. Buscamos todas
        // as pendentes do tenant e cruzamos em minúsculo, porque a cobrança
        // guarda o instagram escrito do jeito que foi lançado.
        const { data: pendentes } = await supabase
          .from('cobrancas')
          .select('cliente, total')
          .eq('tenant_id', tenantId)
          .not('status', 'in', '("PAGO","BAIXADO","CANCELADO")')

        const devendo = {}
        for (const c of pendentes || []) {
          const chave = String(c.cliente || '').replace('@', '').trim().toLowerCase()
          if (!chave) continue
          devendo[chave] = (devendo[chave] || 0) + Number(c.total || 0)
        }
        setDebitoPorInstagram(devendo)
      }
    } catch (err) {
      console.error('Erro ao carregar romaneios:', err)
    } finally {
      setLoading(false)
    }
  }, [tenantId, statusFiltro, buscaAplicada, dataInicio, dataFim, paginaAtual])

  useEffect(() => { carregar() }, [carregar])

  // Config da loja: não muda entre páginas, basta uma vez
  useEffect(() => {
    if (!tenantId) return

    supabase
      .from('configuracoes')
      .select('margem_frete, slug')
      .eq('tenant_id', tenantId)
      .maybeSingle()
      .then(({ data }) => {
        setMargemFrete(Number(data?.margem_frete ?? 0))
        setSlugLoja(data?.slug || '')
      })
  }, [tenantId])

  // O Melhor Envio só devolve o código depois que a transportadora registra o
  // objeto. É uma consulta externa: roda ao abrir a tela e no botão Atualizar,
  // nunca a cada filtro ou troca de página.
  const sincronizarEAtualizar = useCallback(async () => {
    if (!tenantId) return
    const r = await sincronizarRastreio({ tenant_id: tenantId })
    if (r?.atualizados || r?.despachados || r?.entregues) carregar()
  }, [tenantId, carregar])

  useEffect(() => {
    if (tenantId) sincronizarRastreio({ tenant_id: tenantId })
  }, [tenantId])


  /** Link público do romaneio, criando token e código se ainda não existirem */
  const garantirLink = async (rom) => {
    let { link_token: linkToken, link_codigo: linkCodigo } = rom

    // Romaneio antigo que ficou sem token/código: gera na hora
    if (!linkToken || !linkCodigo) {
      linkToken = linkToken || crypto.randomUUID()
      linkCodigo = linkCodigo || crypto.randomUUID().replace(/-/g, '').slice(0, 10)

      const { error } = await supabase
        .from('romaneios')
        .update({ link_token: linkToken, link_codigo: linkCodigo })
        .eq('id', rom.id)

      if (error) throw error

      const novos = { link_token: linkToken, link_codigo: linkCodigo }
      setRomaneios(prev => prev.map(r => r.id === rom.id ? { ...r, ...novos } : r))
      setModalAberto(m => (m && m.id === rom.id ? { ...m, ...novos } : m))
    }

    return montarLinkFrete({ link_token: linkToken, link_codigo: linkCodigo })
  }

  // Copia o link do romaneio: serve em qualquer status, inclusive depois de
  // gerada a etiqueta, quando a cliente ainda quer acompanhar o pedido
  const handleCopiarLinkFrete = async (rom) => {
    try {
      const link = await garantirLink(rom)
      await navigator.clipboard.writeText(link)
      showGlobalToast(`Link do ${rom.numero} copiado`)
    } catch (err) {
      console.error('Erro ao copiar link:', err)
      setErroModal({
        titulo: 'Não foi possível copiar o link',
        mensagem: err.message || 'Tente novamente.',
      })
    }
  }

  /**
   * Avisa a cliente do pedido que já veio pago da loja.
   *
   * O botão de frete não serve para esses pedidos: ele manda a cliente cotar e
   * pagar o envio, e aqui o frete já foi pago junto com as peças. O que falta
   * é a cliente saber que deu certo — quem compra numa loja aberta e não
   * recebe nenhuma palavra depois de pagar acha que caiu em golpe.
   *
   * A mensagem muda conforme o pedido anda: confirmação enquanto está na
   * produção, rastreio depois de postado.
   */
  const handleAvisarCliente = (rom) => {
    const insta = String(rom.cliente_instagram || '').replace('@', '')
    const fone = String(
      whatsPorInstagram[insta.toLowerCase()] || rom.enderecos_clientes?.telefone || ''
    ).replace(/\D/g, '')

    const primeiroNome = String(rom.enderecos_clientes?.destinatario || '').split(/\s+/)[0]
    const saudacao = primeiroNome ? `Oi, ${primeiroNome}!` : 'Oi! Tudo bem?'
    const rastreio = String(rom.codigo_rastreio || '').trim()

    // Sem emoji: eles chegam corrompidos pelo deep link do WhatsApp.
    // O link fica sozinho na última linha, que é como o app reconhece melhor.
    const partes = [`${saudacao}`, '']

    if (rastreio) {
      partes.push(
        `Seu pedido ${rom.numero} foi postado!`,
        `Transportadora: ${rom.transportadora || ''} ${rom.servico || ''}`.trim(),
        `Código de rastreio: ${rastreio}`,
        '',
        'Acompanhe por aqui:',
        linkRastreio(rastreio, rom.transportadora)
      )
    } else {
      partes.push(
        `Recebemos seu pagamento e seu pedido ${rom.numero} já entrou na produção.`,
        'O frete está pago: assim que a peça for separada e embalada, eu te mando o código de rastreio por aqui.',
      )
      if (slugLoja) {
        partes.push(
          '',
          `Você também pode acompanhar pelo portal. Entre com ${insta} e, se for a primeira vez, a senha é o número do seu WhatsApp (só os números):`,
          `${window.location.origin.replace('://www.', '://')}/portal/${slugLoja}`
        )
      }
    }

    const msg = partes.join('\n')

    if (!fone) {
      showGlobalToast('Cliente sem WhatsApp cadastrado — escolha o contato', 'error')
      window.open(`https://wa.me/?text=${encodeURIComponent(msg)}`, '_blank')
      return
    }

    const comDDI = fone.length <= 11 ? `55${fone}` : fone
    window.open(`https://wa.me/${comDDI}?text=${encodeURIComponent(msg)}`, '_blank')
  }

  // Abre o WhatsApp do cliente com o link onde ele mesmo cota e paga o frete
  const handleEnviarLinkFrete = async (rom) => {
    try {
      const link = await garantirLink(rom)
      const insta = String(rom.cliente_instagram || '').replace('@', '')
      const fone = String(whatsPorInstagram[insta.toLowerCase()] || '').replace(/\D/g, '')

      // Sem emoji: eles chegam corrompidos pelo deep link do WhatsApp.
      // O link fica sozinho na última linha, que é como o app reconhece melhor.
      const msg =
        `Oi @${insta}! Tudo bem?\n\n` +
        `Seu pedido ${rom.numero} já está pronto aqui na loja.\n` +
        `Escolha o frete e pague pelo PIX no link abaixo. ` +
        `Assim que o pagamento cair, a gente posta seu pedido!\n\n` +
        link

      if (!fone) {
        try { await navigator.clipboard.writeText(link) } catch { /* sem permissão de clipboard */ }
        showGlobalToast('Cliente sem WhatsApp cadastrado — link copiado, escolha o contato', 'error')
        window.open(`https://wa.me/?text=${encodeURIComponent(msg)}`, '_blank')
        return
      }

      const comDDI = fone.length <= 11 ? `55${fone}` : fone
      window.open(`https://wa.me/${comDDI}?text=${encodeURIComponent(msg)}`, '_blank')
    } catch (err) {
      console.error('Erro ao gerar link de frete:', err)
      showGlobalToast('Não foi possível gerar o link do frete', 'error')
    }
  }

  // Cliente buscou na loja: não há frete, etiqueta nem rastreio a gerar
  const handleMarcarRetirado = (romaneio) => {
    setPergunta({
      titulo: `Retirada do ${romaneio.numero}`,
      mensagem: `Confirmar que o pedido de @${romaneio.cliente_instagram} foi retirado na loja? O frete deixa de ser cobrado neste romaneio.`,
      campo: {
        label: 'Quem retirou',
        placeholder: 'Nome de quem buscou o pedido',
        ajuda: 'Opcional. Útil quando outra pessoa retira no lugar da cliente.',
      },
      textoConfirmar: 'Confirmar retirada',
      aoConfirmar: (quemRetirou) => registrarRetirada(romaneio, quemRetirou),
    })
  }

  const registrarRetirada = async (romaneio, quemRetirou) => {
    try {
      const { error } = await supabase
        .from('romaneios')
        .update({
          status: 'retirado',
          retirado_em: new Date().toISOString(),
          retirado_nome: (quemRetirou || '').trim() || null,
          retirado_por_nome: profile?.nome || profile?.username || null,
        })
        .eq('id', romaneio.id)

      if (error) throw error

      showGlobalToast(`${romaneio.numero} marcado como retirado na loja`)
      setModalAberto(null)
      carregar()
    } catch (err) {
      setErroModal({ titulo: 'Não foi possível registrar a retirada', mensagem: err.message })
    }
  }

  const handleGerarEtiqueta = async (romaneio, confirmado = false) => {
    setGerando(romaneio.id)
    try {
      let orderId = romaneio.melhor_envio_order_id

      // Se não tem pedido, cria primeiro
      if (!orderId) {
        if (!romaneio.melhor_envio_cotacao_id) {
          showGlobalToast('Este romaneio não possui cotação salva', 'error')
          return
        }

        // A compra da etiqueta debita o saldo do Melhor Envio: confirma antes
        if (!confirmado) {
          setGerando(null)
          setPergunta({
            titulo: `Comprar etiqueta do ${romaneio.numero}`,
            mensagem: 'Este romaneio ainda não tem pedido no Melhor Envio. ' +
                      'Criar o pedido agora compra a etiqueta e debita o saldo da carteira.',
            textoConfirmar: 'Criar pedido e comprar',
            aoConfirmar: () => handleGerarEtiqueta(romaneio, true),
          })
          return
        }

        showGlobalToast('Criando pedido no Melhor Envio... aguarde')

        // Chama Edge Function para criar pedido
        const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL

        // Pega o token de sessão do usuário autenticado
        const { data: { session } } = await supabase.auth.getSession()
        const token = session?.access_token

        if (!token) {
          throw new Error('Usuário não autenticado')
        }

        console.log('🔍 DEBUG - SUPABASE_URL:', SUPABASE_URL)
        console.log('🔍 DEBUG - URL completa:', `${SUPABASE_URL}/functions/v1/criar-pedido-melhor-envio`)

        const response = await fetch(`${SUPABASE_URL}/functions/v1/criar-pedido-melhor-envio`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`,
          },
          body: JSON.stringify({
            romaneio_id: romaneio.id,
          }),
        })

        if (!response.ok) {
          const error = await response.json()
          console.error('❌ Erro completo da API:', error)
          throw new Error(error.error || 'Erro ao criar pedido')
        }

        const result = await response.json()

        showGlobalToast(`Etiqueta gerada! Pedido ${result.order_id}${result.tracking ? ' · Rastreio ' + result.tracking : ''}`)

        // O filtro escolhido não muda: quem está processando uma fila
        // precisa continuar na mesma lista
        carregar()
        return
      }

      // Compra a etiqueta
      const result = await gerarEtiqueta(tenantId, [orderId])

      await supabase
        .from('romaneios')
        .update({
          status: 'etiqueta_gerada',
          etiqueta_gerada_em: new Date().toISOString(),
        })
        .eq('id', romaneio.id)

      showGlobalToast('Etiqueta gerada com sucesso!')
      carregar()
    } catch (err) {
      setErroModal({ titulo: 'Não foi possível gerar a etiqueta', mensagem: err.message })
    } finally {
      setGerando(null)
    }
  }

  const handleImprimirEtiqueta = async (romaneio) => {
    if (!romaneio.melhor_envio_order_id) {
      showGlobalToast('Este romaneio não possui pedido no Melhor Envio', 'error')
      return
    }

    try {
      const pdfUrl = await imprimirEtiqueta(tenantId, [romaneio.melhor_envio_order_id])

      await supabase
        .from('romaneios')
        .update({
          url_etiqueta: pdfUrl,
        })
        .eq('id', romaneio.id)

      window.open(pdfUrl, '_blank')
    } catch (err) {
      setErroModal({ titulo: 'Não foi possível imprimir a etiqueta', mensagem: err.message })
    }
  }

  const handleMarcarDespachado = (romaneio) => {
    setPergunta({
      titulo: `Despachar ${romaneio.numero}`,
      mensagem: 'Confirmar que o pacote já foi postado na transportadora?',
      textoConfirmar: 'Marcar como despachado',
      aoConfirmar: () => despachar(romaneio),
    })
  }

  const despachar = async (romaneio) => {
    try {
      await supabase
        .from('romaneios')
        .update({
          status: 'despachado',
          despachado_em: new Date().toISOString(),
        })
        .eq('id', romaneio.id)

      showGlobalToast('Romaneio marcado como despachado!')
      carregar()
    } catch (err) {
      showGlobalToast(`Erro: ${err.message}`, 'error')
    }
  }

  const handleMarcarComoPago = (romaneio) => {
    setPergunta({
      titulo: `Baixa manual do frete · ${romaneio.numero}`,
      mensagem: 'O frete será marcado como pago sem passar pelo Mercado Pago. Fica registrado quem deu a baixa.',
      campo: {
        label: 'Motivo',
        placeholder: 'Crédito do cliente, cortesia, pagamento externo...',
      },
      textoConfirmar: 'Marcar como pago',
      aoConfirmar: (motivo) => darBaixaManual(romaneio, motivo),
    })
  }

  const darBaixaManual = async (romaneio, motivo) => {
    try {
      // O registro vem primeiro: se ele falhar, o romaneio não pode ficar
      // marcado como pago sem nenhum rastro de quem deu a baixa
      const { error: pagError } = await supabase
        .from('pagamentos_frete')
        .insert({
          romaneio_id: romaneio.id,
          valor: romaneio.valor_frete || 0,
          metodo: 'manual',
          status: 'aprovado',
          pago_em: new Date().toISOString(),
          observacao: motivo || 'Marcado manualmente como pago',
          registrado_por: profile?.id || null,
          registrado_por_nome: profile?.nome || profile?.username || null,
        })

      if (pagError) throw pagError

      const { error: romError } = await supabase
        .from('romaneios')
        .update({
          status: 'frete_pago',
          frete_pago_em: new Date().toISOString(),
        })
        .eq('id', romaneio.id)

      if (romError) throw romError

      showGlobalToast('Frete marcado como pago com sucesso!')
      carregar()
    } catch (err) {
      showGlobalToast(`Erro: ${err.message}`, 'error')
    }
  }

  const handleCotarFrete = async (romaneio) => {
    if (!romaneio.enderecos_clientes) {
      showGlobalToast('Este romaneio não possui endereço de entrega', 'error')
      return
    }

    // Sem peso/medidas a cotação sai errada — preencher em Editar primeiro
    if (!romaneio.peso || !romaneio.altura || !romaneio.largura || !romaneio.comprimento) {
      showGlobalToast('Informe o peso e as medidas da caixa (botão Editar) antes de cotar', 'error')
      return
    }

    setCotando(true)
    setCotacoes([])
    setCotacaoSelecionada(null)

    try {
      // Buscar configurações da empresa (incluindo margem de frete)
      const { data: config } = await supabase
        .from('configuracoes')
        .select('endereco_cep, margem_frete, melhor_envio_api_url')
        .eq('tenant_id', tenantId)
        .single()

      if (!config?.endereco_cep) {
        showGlobalToast('Configure o endereço da empresa primeiro em Configurações', 'error')
        setCotando(false)
        return
      }

      const margemFrete = config.margem_frete || 0
      const apiUrl = config.melhor_envio_api_url || 'https://sandbox.melhorenvio.com.br'

      console.log('🌐 API configurada:', apiUrl)
      if (apiUrl.includes('sandbox')) {
        console.warn('⚠️  ATENÇÃO: Você está usando SANDBOX! Valores são SIMULADOS!')
      }

      // Preparar dados para cotação
      const enderecoOrigem = {
        postal_code: config.endereco_cep.replace(/\D/g, ''),
      }

      const enderecoDestino = {
        postal_code: romaneio.enderecos_clientes.cep.replace(/\D/g, ''),
      }

      // Dimensões reais do romaneio (validadas acima)
      const pacote = {
        height: Number(romaneio.altura),
        width: Number(romaneio.largura),
        length: Number(romaneio.comprimento),
        weight: pesoEmKg(romaneio.peso),
      }

      console.log('📦 Cotando frete...', { enderecoOrigem, enderecoDestino, pacote, margemFrete })

      const resultado = await calcularFrete(tenantId, {
        from: enderecoOrigem,
        to: enderecoDestino,
        package: pacote,
      })

      // Aplicar margem de frete nas cotações
      const cotacoesComMargem = resultado.map(cot => {
        const valorBase = Number(cot.price || cot.custom_price || cot.valor_original || 0)
        const valorComMargem = valorBase * (1 + margemFrete / 100)

        return {
          ...cot,
          valor_original: valorBase,
          price: valorComMargem,
          margem_aplicada: margemFrete,
        }
      })

      // Filtrar opção indesejada: "Jadlog - .Package Centralizado"
      const cotacoesFiltradas = cotacoesComMargem.filter(cot => {
        const nomeServico = cot.name || ''
        const nomeTransp = cot.company?.name || ''
        // Remove se for Jadlog E o serviço for ".Package Centralizado"
        if (nomeTransp.toLowerCase().includes('jadlog') && nomeServico.toLowerCase().includes('package centralizado')) {
          return false
        }
        return true
      })

      console.log('✅ Cotações recebidas com margem:', cotacoesFiltradas)
      setCotacoes(cotacoesFiltradas)
    } catch (err) {
      console.error('❌ Erro ao cotar:', err)
      setErroModal({ titulo: 'Não foi possível cotar o frete', mensagem: err.message })
    } finally {
      setCotando(false)
    }
  }

  const handleConfirmarCotacao = async (romaneio) => {
    if (!cotacaoSelecionada) {
      showGlobalToast('Selecione uma transportadora', 'error')
      return
    }

    try {
      const cotacao = cotacoes.find(c => c.id === cotacaoSelecionada)
      // Salvar valor SEM margem (valor base/original)
      const valorBase = Number(cotacao.valor_original || 0)

      // 1. SALVAR COTAÇÕES NO BANCO (retorna com UUIDs gerados!)
      console.log('💾 Salvando cotações no banco...')
      const cotacoesSalvas = await salvarCotacoes(romaneio.id, cotacoes)

      // 2. Encontrar a cotação salva correspondente à selecionada
      const cotacaoSalva = cotacoesSalvas.find(cs =>
        cs.transportadora === (cotacao.company?.name || cotacao.name) &&
        cs.servico === cotacao.name
      )

      if (!cotacaoSalva) {
        throw new Error('Erro ao encontrar cotação salva')
      }

      console.log('✅ UUID da cotação salva:', cotacaoSalva.id)

      // 3. Atualizar romaneio com o UUID correto da cotação salva
      await supabase
        .from('romaneios')
        .update({
          transportadora: cotacao.company?.name || cotacao.name,
          servico: cotacao.name,
          valor_frete: valorBase,
          prazo_entrega: cotacao.delivery_time || cotacao.delivery_range?.max || 0,
          status: 'frete_cotado',
          melhor_envio_cotacao_id: cotacaoSalva.id, // UUID da nossa tabela!
        })
        .eq('id', romaneio.id)

      // Limpar estados de cotação
      setCotacoes([])
      setCotacaoSelecionada(null)

      showGlobalToast('Cotação confirmada com sucesso!')
      carregar()
      setModalAberto(null)
    } catch (err) {
      setErroModal({ titulo: 'Não foi possível confirmar a cotação', mensagem: err.message })
    }
  }

  const handleAbrirEdicao = (romaneio) => {
    setEditando(romaneio)
    setFormEdicao({
      altura: romaneio.altura || '',
      largura: romaneio.largura || '',
      comprimento: romaneio.comprimento || '',
      peso: romaneio.peso || '',
      produto_declaracao: romaneio.produto_declaracao || '',
      produto_quantidade: romaneio.produto_quantidade || '',
      produto_valor_declarado: romaneio.produto_valor_declarado || '',
    })
  }

  const handleSalvarEdicao = async () => {
    if (!editando) return

    setPergunta({
      titulo: `Editar ${editando.numero}`,
      mensagem: 'As dimensões e os dados do produto serão atualizados.\n' +
                'O status volta para PRONTO e as cotações e pagamentos anteriores são apagados.',
      textoConfirmar: 'Salvar e voltar para PRONTO',
      perigo: true,
      aoConfirmar: () => salvarEdicao(),
    })
  }

  const salvarEdicao = async () => {
    try {
      // 1. Deletar cotações antigas
      await supabase
        .from('cotacoes_frete')
        .delete()
        .eq('romaneio_id', editando.id)

      // 2. Deletar pagamentos antigos
      await supabase
        .from('pagamentos_frete')
        .delete()
        .eq('romaneio_id', editando.id)

      // 3. Atualizar romaneio e voltar para PRONTO
      await supabase
        .from('romaneios')
        .update({
          altura: parseFloat(formEdicao.altura) || null,
          largura: parseFloat(formEdicao.largura) || null,
          comprimento: parseFloat(formEdicao.comprimento) || null,
          peso: parseFloat(formEdicao.peso) || null,
          produto_declaracao: formEdicao.produto_declaracao || null,
          produto_quantidade: parseInt(formEdicao.produto_quantidade) || null,
          produto_valor_declarado: parseFloat(formEdicao.produto_valor_declarado) || null,
          status: 'pronto',
          transportadora: null,
          servico: null,
          valor_frete: null,
          prazo_entrega: null,
          melhor_envio_cotacao_id: null,
          melhor_envio_order_id: null,
          codigo_rastreio: null,
          frete_pago_em: null,
          etiqueta_gerada_em: null,
          despachado_em: null,
        })
        .eq('id', editando.id)

      showGlobalToast('Romaneio editado! Status voltou para PRONTO.')
      setEditando(null)
      carregar()
    } catch (err) {
      showGlobalToast(`Erro ao editar romaneio: ${err.message}`, 'error')
    }
  }

  if (loading) {
    return (
      <AppShell page="Etiquetas" hideTitle>
        <div style={{ padding: 24, textAlign: 'center', color: '#9aa0a6' }}>
          Carregando...
        </div>
      </AppShell>
    )
  }

  return (
    <AppShell page="Etiquetas" hideTitle>
      <div style={{ padding: '4px 12px 16px' }}>
        {/* Título e filtros na mesma linha */}
        <div ref={barraRef} className="filtros-fixos" style={{
          display: 'flex',
          gap: 8,
          paddingBottom: 14,
          flexWrap: isMobile ? 'wrap' : 'nowrap',
          alignItems: 'center',
        }}>
          <h1 style={{
            margin: 0,
            color: '#e8eaed',
            fontSize: 17,
            fontWeight: 700,
            whiteSpace: 'nowrap',
            width: isMobile ? '100%' : 'auto',
          }}>
            Gestão de Etiquetas
          </h1>

          <input
            type="text"
            placeholder="Buscar cliente ou romaneio..."
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            style={{
              flex: isMobile ? '1 1 100%' : '1 1 120px',
              minWidth: 0,
              background: 'rgba(255,255,255,0.05)',
              border: '1px solid rgba(255,255,255,0.1)',
              borderRadius: 6,
              padding: '6px 10px',
              color: '#e8eaed',
              fontSize: 13,
            }}
          />

          <select
            value={statusFiltro}
            onChange={(e) => { setStatusFiltro(e.target.value); setPaginaAtual(1) }}
            style={{
              flex: isMobile ? '1 1 100%' : '0 0 auto',
              minWidth: 0,
              background: 'rgba(255,255,255,0.05)',
              border: '1px solid rgba(255,255,255,0.1)',
              borderRadius: 6,
              padding: '6px 8px',
              color: '#e8eaed',
              fontSize: 13,
              cursor: 'pointer',
            }}
          >
            <option value="etiqueta_gerada">Etiqueta Gerada</option>
            <option value="aguardando_pagamento">Aguardando Pagamento</option>
            <option value="despachado">Despachado</option>
            <option value="entregue">Entregue</option>
            <option value="retirado">Retirado na loja</option>
            <option value="frete_pago">Frete Pago</option>
            <option value="cancelado">Cancelado</option>
            <option value="todos">Todos</option>
          </select>

          <input
            type="date"
            value={dataInicio}
            onChange={(e) => { setDataInicio(e.target.value); setPaginaAtual(1) }}
            title="Data início"
            style={{
              flex: isMobile ? '1 1 calc(50% - 4px)' : '0 0 auto',
              width: isMobile ? 'auto' : 128,
              minWidth: 0,
              background: 'rgba(255,255,255,0.05)',
              border: '1px solid rgba(255,255,255,0.1)',
              borderRadius: 6,
              padding: '6px 8px',
              color: '#e8eaed',
              fontSize: 12,
              colorScheme: 'dark',
            }}
          />

          <input
            type="date"
            value={dataFim}
            onChange={(e) => { setDataFim(e.target.value); setPaginaAtual(1) }}
            title="Data fim"
            style={{
              flex: isMobile ? '1 1 calc(50% - 4px)' : '0 0 auto',
              width: isMobile ? 'auto' : 128,
              minWidth: 0,
              background: 'rgba(255,255,255,0.05)',
              border: '1px solid rgba(255,255,255,0.1)',
              borderRadius: 6,
              padding: '6px 8px',
              color: '#e8eaed',
              fontSize: 12,
              colorScheme: 'dark',
            }}
          />

          {(busca || statusFiltro !== 'etiqueta_gerada' || dataInicio || dataFim) && (
            <button
              onClick={() => {
                setBusca('')
                setStatusFiltro('etiqueta_gerada')
                setDataInicio('')
                setDataFim('')
                setPaginaAtual(1)
              }}
              style={{
                flex: isMobile ? '1 1 calc(50% - 4px)' : '0 0 auto',
                background: 'rgba(244,67,54,0.1)',
                color: '#f44336',
                border: '1px solid rgba(244,67,54,0.3)',
                borderRadius: 6,
                padding: '6px 12px',
                fontWeight: 600,
                cursor: 'pointer',
                fontSize: 13,
                whiteSpace: 'nowrap',
              }}
            >
              Limpar
            </button>
          )}

          <button
            onClick={() => { carregar(); sincronizarEAtualizar() }}
            style={{
              flex: isMobile ? '1 1 calc(50% - 4px)' : '0 0 auto',
              background: 'rgba(255,255,255,0.1)',
              color: '#e8eaed',
              border: '1px solid rgba(255,255,255,0.2)',
              borderRadius: 6,
              padding: '6px 12px',
              fontWeight: 600,
              cursor: 'pointer',
              fontSize: 13,
              whiteSpace: 'nowrap',
            }}
          >
            Atualizar
          </button>
        </div>

        {romaneios.length === 0 ? (
          <div style={{
            textAlign: 'center',
            padding: 60,
            background: 'rgba(255,255,255,0.03)',
            borderRadius: 16,
            border: '1px dashed rgba(255,255,255,0.1)',
          }}>
            <p style={{ color: '#9aa0a6', margin: 0, fontSize: 16 }}>
              Nenhum romaneio com frete pago no momento
            </p>
          </div>
        ) : (
          // Sem overflow hidden: ele impediria o cabeçalho de grudar no topo
          <div style={{
            background: 'rgba(255,255,255,0.03)',
            border: '1px solid rgba(255,255,255,0.1)',
            borderRadius: 12,
          }}>
            {/* Header da Tabela - no celular cada romaneio vira um cartão */}
            <div className="grid-header-fixo" style={{
              top: alturaBarra,
              display: isMobile ? 'none' : 'grid',
              gridTemplateColumns: '110px 1fr 100px 100px 100px 120px 170px 82px',
              gap: 16,
              padding: '14px 20px',
              borderTopLeftRadius: 12,
              borderTopRightRadius: 12,
              borderBottom: '1px solid rgba(255,255,255,0.1)',
              fontSize: 11,
              fontWeight: 700,
              textTransform: 'uppercase',
              letterSpacing: '0.5px',
            }}>
              <div>Romaneio</div>
              <div>Cliente</div>
              <div>Data Pronto</div>
              <div>Data Pago</div>
              <div>Data Despacho</div>
              <div>Status</div>
              <div>Ações</div>
              <div />
            </div>

            {/* Linhas da Tabela */}
            {romaneios.map(rom => {
              const formatarData = (data) => {
                if (!data) return '-'
                const d = new Date(data)
                return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })
              }

              return (
                <div
                  key={rom.id}
                  onClick={() => setModalAberto(rom)}
                  style={{
                    display: isMobile ? 'flex' : 'grid',
                    flexDirection: isMobile ? 'column' : undefined,
                    gridTemplateColumns: isMobile ? undefined : '110px 1fr 100px 100px 100px 120px 170px 82px',
                    gap: isMobile ? 6 : 16,
                    padding: isMobile ? '12px 14px' : '16px 20px',
                    borderBottom: '1px solid rgba(255,255,255,0.05)',
                    cursor: 'pointer',
                    transition: 'background 0.2s',
                  }}
                  onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.03)'}
                  onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                >
                  <div>
                    <div style={{ color: 'var(--p-blue)', fontWeight: 700, fontSize: 15 }}>
                      {rom.numero}
                    </div>
                    {rom.codigo_rastreio && (
                      <a
                        href={linkRastreio(rom.codigo_rastreio, rom.transportadora)}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={(e) => e.stopPropagation()}
                        title="Clique para rastrear"
                        style={{
                          display: 'inline-block',
                          color: '#2196f3',
                          fontSize: 11,
                          marginTop: 4,
                          fontFamily: 'monospace',
                          fontWeight: 600,
                          textDecoration: 'none',
                          padding: '2px 6px',
                          background: 'rgba(33,150,243,0.1)',
                          borderRadius: 4,
                          border: '1px solid rgba(33,150,243,0.3)',
                        }}
                      >
                        {rom.codigo_rastreio}
                      </a>
                    )}
                  </div>

                  <div style={{ color: '#e8eaed', fontSize: 14 }}>
                    @{rom.cliente_instagram}

                    {/* Aviso para quem vier retirar na loja */}
                    {(() => {
                      const deve = debitoPorInstagram[
                        String(rom.cliente_instagram || '').replace('@', '').toLowerCase()
                      ]
                      if (!deve) return null

                      return (
                        <span
                          title="Cliente com compra em aberto — cobrar antes de entregar"
                          style={{
                            marginLeft: 8,
                            display: 'inline-block',
                            background: 'rgba(244,67,54,0.18)',
                            color: '#ff8a80',
                            border: '1px solid rgba(244,67,54,0.5)',
                            borderRadius: 5,
                            padding: '2px 6px',
                            fontSize: 10,
                            fontWeight: 700,
                            whiteSpace: 'nowrap',
                          }}
                        >
                          DEVE R$ {Number(deve).toFixed(2)}
                        </span>
                      )
                    })()}
                  </div>

                  {(!isMobile || rom.pronto_em) && (
                    <div style={{ color: '#9aa0a6', fontSize: isMobile ? 12 : 13 }}>
                      {isMobile && 'Pronto em '}{formatarData(rom.pronto_em)}
                    </div>
                  )}

                  {(!isMobile || rom.frete_pago_em) && (
                    <div style={{ color: '#9aa0a6', fontSize: isMobile ? 12 : 13 }}>
                      {isMobile && 'Pago em '}{formatarData(rom.frete_pago_em)}
                    </div>
                  )}

                  {(!isMobile || rom.despachado_em || rom.retirado_em) && (
                    <div style={{ color: '#9aa0a6', fontSize: isMobile ? 12 : 13 }}>
                      {isMobile && (rom.status === 'retirado' ? 'Retirado em ' : 'Despachado em ')}
                      {formatarData(rom.status === 'retirado' ? rom.retirado_em : rom.despachado_em)}
                    </div>
                  )}

                  <div>
                  <div style={{
                    display: 'inline-block',
                    background: rom.status === 'retirado' ? 'rgba(156,39,176,0.2)' :
                               rom.status === 'entregue' ? 'rgba(129,201,149,0.25)' :
                               rom.status === 'despachado' ? 'rgba(76,175,80,0.2)' :
                               rom.status === 'etiqueta_gerada' ? 'rgba(33,150,243,0.2)' :
                               rom.status === 'frete_pago' ? 'rgba(255,193,7,0.2)' :
                               rom.status === 'frete_cotado' ? 'rgba(156,39,176,0.2)' :
                               rom.status === 'cancelado' ? 'rgba(244,67,54,0.2)' :
                               'rgba(158,158,158,0.2)',
                    color: rom.status === 'retirado' ? '#ce93d8' :
                           rom.status === 'entregue' ? '#81c995' :
                           rom.status === 'despachado' ? '#4caf50' :
                           rom.status === 'etiqueta_gerada' ? '#2196f3' :
                           rom.status === 'frete_pago' ? '#ffc107' :
                           rom.status === 'frete_cotado' ? '#9c27b0' :
                           rom.status === 'cancelado' ? '#f44336' : '#9e9e9e',
                    fontSize: 10,
                    fontWeight: 700,
                    padding: '5px 10px',
                    borderRadius: 6,
                    textTransform: 'uppercase',
                  }}>
                    {ehBaixaManual(rom) ? 'Pago na mão · ' : ''}
                    {rom.status === 'retirado' ? 'Retirado na loja' :
                     rom.status === 'entregue' ? 'Entregue' :
                     rom.status === 'despachado' ? 'Despachado' :
                     rom.status === 'etiqueta_gerada' ? 'Etiqueta Gerada' :
                     rom.status === 'frete_pago' ? 'Frete Pago' :
                     rom.status === 'frete_cotado' ? 'Cotado' :
                     rom.status === 'cancelado' ? 'Cancelado' :
                     rom.status === 'pronto' ? 'Pronto' : rom.status}
                  </div>

                  {/* Quem deu a baixa e por quê, sem precisar abrir o romaneio */}
                  {ehBaixaManual(rom) && (() => {
                    const pag = pagamentoDoRomaneio(rom)
                    const quem = pag?.registrado_por_nome || 'não identificado'
                    const motivo = pag?.observacao || ''

                    return (
                      <div
                        title={`Baixa manual por ${quem}${motivo ? ` — ${motivo}` : ''}`}
                        style={{
                          marginTop: 4,
                          fontSize: 10,
                          color: '#ffc107',
                          lineHeight: 1.35,
                          wordBreak: 'break-word',
                        }}
                      >
                        {quem}{motivo && <><br />{motivo}</>}
                      </div>
                    )
                  })()}
                </div>

                <div
                  onClick={(e) => e.stopPropagation()}
                  style={{
                    display: 'flex',
                    gap: 6,
                    flexWrap: isMobile ? 'wrap' : 'nowrap',
                    marginTop: isMobile ? 4 : 0,
                  }}
                >
                  {['pronto', 'frete_cotado', 'frete_pago'].includes(rom.status) && (
                    <button
                      type="button"
                      className="btn-action-sm"
                      onClick={() => handleMarcarRetirado(rom)}
                      title="Cliente retirou o pedido na loja"
                      style={{ color: '#ce93d8', borderColor: 'rgba(156,39,176,0.5)' }}
                    >
                      <IconSacola />
                    </button>
                  )}

                  {/* Pedido com frete já pago: não há o que cobrar, o que
                      falta é a cliente saber que deu certo */}
                  {['frete_pago', 'etiqueta_gerada', 'despachado', 'em_transito'].includes(rom.status) && (
                    <button
                      type="button"
                      className="btn-action-sm"
                      onClick={() => handleAvisarCliente(rom)}
                      title={rom.codigo_rastreio ? 'Mandar o rastreio no WhatsApp' : 'Avisar a cliente no WhatsApp'}
                      style={{ color: '#25d366', borderColor: 'rgba(37,211,102,0.5)' }}
                    >
                      <IconWa />
                    </button>
                  )}

                  {!['frete_pago', 'etiqueta_gerada', 'despachado', 'cancelado'].includes(rom.status) && (
                    <button
                      type="button"
                      className="btn-action-sm"
                      onClick={() => handleEnviarLinkFrete(rom)}
                      title="Enviar link de frete pelo WhatsApp"
                      style={{ color: '#25d366', borderColor: 'rgba(37,211,102,0.5)' }}
                    >
                      <IconEnviar />
                    </button>
                  )}

                  {rom.status === 'frete_pago' && (
                    <button
                      type="button"
                      className="btn-action-sm"
                      onClick={() => handleGerarEtiqueta(rom)}
                      disabled={gerando === rom.id}
                      title="Gerar etiqueta no Melhor Envio"
                      style={{
                        color: 'var(--p-blue)',
                        borderColor: 'rgba(138,180,248,0.5)',
                        cursor: gerando === rom.id ? 'wait' : 'pointer',
                        opacity: gerando === rom.id ? 0.5 : 1,
                      }}
                    >
                      <IconEtiqueta />
                    </button>
                  )}

                  {(rom.status === 'etiqueta_gerada' || rom.status === 'despachado') && (
                    <>
                      <button
                        type="button"
                        className="btn-action-sm"
                        onClick={() => handleImprimirEtiqueta(rom)}
                        title="Imprimir etiqueta"
                        style={{ color: '#2196f3', borderColor: 'rgba(33,150,243,0.5)' }}
                      >
                        <IconImpressora />
                      </button>

                      {rom.status === 'etiqueta_gerada' && (
                        <button
                          type="button"
                          className="btn-action-sm"
                          onClick={() => handleMarcarDespachado(rom)}
                          title="Marcar como despachado"
                          style={{ color: '#4caf50', borderColor: 'rgba(76,175,80,0.5)' }}
                        >
                          <IconCaminhao />
                        </button>
                      )}
                    </>
                  )}

                  {/* Botão Editar - sempre visível */}
                  <button
                    type="button"
                    className="btn-action-sm"
                    onClick={() => handleAbrirEdicao(rom)}
                    title="Editar romaneio"
                    style={{ color: '#ff9800', borderColor: 'rgba(255,152,0,0.5)' }}
                  >
                    <IconLapis />
                  </button>
                </div>

                {/* Link e histórico: disponíveis em qualquer status */}
                <div
                  onClick={(e) => e.stopPropagation()}
                  className="acoes-wrapper"
                  style={{ justifyContent: isMobile ? 'flex-start' : 'center' }}
                >
                  <button
                    type="button"
                    className="btn-action-sm copy"
                    title="Copiar link do romaneio"
                    onClick={(e) => { e.stopPropagation(); handleCopiarLinkFrete(rom) }}
                  >
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
                      <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
                    </svg>
                  </button>

                  <button
                    type="button"
                    className="btn-action-sm hist"
                    title="Ver histórico de status"
                    onClick={(e) => { e.stopPropagation(); setHistoricoDe(rom) }}
                  >
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" />
                    </svg>
                  </button>
                </div>
              </div>
              )
            })}
          </div>
        )}

        {/* Paginação */}
        {totalRegistros > 0 && (() => {
          const totalPaginas = Math.max(1, Math.ceil(totalRegistros / ITENS_POR_PAGINA))
          const primeiro = (paginaAtual - 1) * ITENS_POR_PAGINA + 1
          const ultimo = Math.min(paginaAtual * ITENS_POR_PAGINA, totalRegistros)

          const estiloBotao = (desabilitado) => ({
            padding: '6px 12px',
            background: desabilitado ? '#2a2a2a' : '#3a3a3a',
            border: 'none',
            borderRadius: 4,
            color: desabilitado ? '#666' : '#e0e0e0',
            fontSize: 13,
            cursor: desabilitado ? 'not-allowed' : 'pointer',
          })

          return (
            <div style={{
              padding: '16px 8px',
              display: 'flex',
              justifyContent: 'center',
              alignItems: 'center',
              gap: 8,
              flexWrap: 'wrap',
            }}>
              <button onClick={() => setPaginaAtual(1)} disabled={paginaAtual === 1}
                style={estiloBotao(paginaAtual === 1)}>
                Primeira
              </button>

              <button onClick={() => setPaginaAtual(p => Math.max(1, p - 1))} disabled={paginaAtual === 1}
                style={estiloBotao(paginaAtual === 1)}>
                Anterior
              </button>

              <select
                value={paginaAtual}
                onChange={e => setPaginaAtual(Number(e.target.value))}
                style={{
                  padding: '6px 12px',
                  background: '#3a3a3a',
                  border: '1px solid var(--border-light)',
                  borderRadius: 4,
                  color: '#e0e0e0',
                  fontSize: 13,
                  cursor: 'pointer',
                }}
              >
                {Array.from({ length: totalPaginas }, (_, i) => i + 1).map(pagina => (
                  <option key={pagina} value={pagina}>{pagina}</option>
                ))}
              </select>

              <button onClick={() => setPaginaAtual(p => Math.min(totalPaginas, p + 1))}
                disabled={paginaAtual >= totalPaginas}
                style={estiloBotao(paginaAtual >= totalPaginas)}>
                Próxima
              </button>

              <button onClick={() => setPaginaAtual(totalPaginas)}
                disabled={paginaAtual >= totalPaginas}
                style={estiloBotao(paginaAtual >= totalPaginas)}>
                Última
              </button>

              <span style={{ marginLeft: 16, color: '#888', fontSize: 13, whiteSpace: 'nowrap' }}>
                {primeiro} - {ultimo} de {totalRegistros}
              </span>
            </div>
          )
        })()}

        {/* Modal de Detalhes */}
        {modalAberto && (
          <div
            onClick={() => setModalAberto(null)}
            style={{
              position: 'fixed',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              background: 'rgba(0,0,0,0.7)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              zIndex: 9999,
              padding: 20,
            }}
          >
            <div
              onClick={(e) => e.stopPropagation()}
              style={{
                background: '#1e1e1e',
                border: '1px solid rgba(255,255,255,0.1)',
                borderRadius: 16,
                maxWidth: 600,
                width: '100%',
                maxHeight: '90vh',
                overflow: 'auto',
                boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
              }}
            >
              {/* Header Modal */}
              <div style={{
                padding: 20,
                borderBottom: '1px solid rgba(255,255,255,0.1)',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
              }}>
                <div>
                  <div style={{ color: 'var(--p-blue)', fontWeight: 700, fontSize: 20 }}>
                    {modalAberto.numero}
                  </div>
                  <div style={{ color: '#9aa0a6', fontSize: 14, marginTop: 4 }}>
                    @{modalAberto.cliente_instagram}
                  </div>

                  {(() => {
                    const deve = debitoPorInstagram[
                      String(modalAberto.cliente_instagram || '').replace('@', '').toLowerCase()
                    ]
                    if (!deve) return null

                    return (
                      <div style={{
                        marginTop: 10,
                        padding: '8px 12px',
                        background: 'rgba(244,67,54,0.12)',
                        border: '1px solid rgba(244,67,54,0.45)',
                        borderRadius: 6,
                        color: '#ff8a80',
                        fontSize: 13,
                        fontWeight: 700,
                      }}>
                        Cliente deve R$ {Number(deve).toFixed(2)} — cobrar antes de entregar
                      </div>
                    )
                  })()}
                </div>
                <button
                  onClick={() => setModalAberto(null)}
                  style={{
                    background: 'rgba(255,255,255,0.1)',
                    color: '#e8eaed',
                    border: 'none',
                    borderRadius: 8,
                    width: 32,
                    height: 32,
                    cursor: 'pointer',
                    fontSize: 18,
                  }}
                >
                  ×
                </button>
              </div>

              {/* Conteúdo Modal */}
              <div style={{ padding: 20 }}>
                {/* Status */}
                <div style={{ marginBottom: 20 }}>
                  <div style={{ color: '#9aa0a6', fontSize: 11, marginBottom: 8, textTransform: 'uppercase', fontWeight: 700 }}>
                    Status
                  </div>
                  <div style={{
                    display: 'inline-block',
                    background: modalAberto.status === 'retirado' ? 'rgba(156,39,176,0.2)' :
                               modalAberto.status === 'entregue' ? 'rgba(129,201,149,0.25)' :
                               modalAberto.status === 'despachado' ? 'rgba(76,175,80,0.2)' :
                               modalAberto.status === 'etiqueta_gerada' ? 'rgba(33,150,243,0.2)' :
                               modalAberto.status === 'frete_pago' ? 'rgba(255,193,7,0.2)' :
                               modalAberto.status === 'frete_cotado' ? 'rgba(156,39,176,0.2)' :
                               modalAberto.status === 'cancelado' ? 'rgba(244,67,54,0.2)' :
                               'rgba(158,158,158,0.2)',
                    color: modalAberto.status === 'retirado' ? '#ce93d8' :
                           modalAberto.status === 'entregue' ? '#81c995' :
                           modalAberto.status === 'despachado' ? '#4caf50' :
                           modalAberto.status === 'etiqueta_gerada' ? '#2196f3' :
                           modalAberto.status === 'frete_pago' ? '#ffc107' :
                           modalAberto.status === 'frete_cotado' ? '#9c27b0' :
                           modalAberto.status === 'cancelado' ? '#f44336' : '#9e9e9e',
                    fontSize: 11,
                    fontWeight: 700,
                    padding: '8px 14px',
                    borderRadius: 8,
                    textTransform: 'uppercase',
                  }}>
                    {modalAberto.status === 'retirado' ? 'Retirado na loja' :
                     modalAberto.status === 'entregue' ? 'Entregue' :
                     modalAberto.status === 'despachado' ? 'Despachado' :
                     modalAberto.status === 'etiqueta_gerada' ? 'Etiqueta Gerada' :
                     modalAberto.status === 'frete_pago' ? 'Frete Pago' :
                     modalAberto.status === 'frete_cotado' ? 'Cotado' :
                     modalAberto.status === 'cancelado' ? 'Cancelado' :
                     modalAberto.status === 'pronto' ? 'Pronto' : modalAberto.status}
                  </div>
                </div>

                {/* Informações de Frete */}
                <div style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(2, 1fr)',
                  gap: 16,
                  marginBottom: 20,
                  padding: 16,
                  background: 'rgba(255,255,255,0.03)',
                  borderRadius: 8,
                }}>
                  <div>
                    <div style={{ color: '#9aa0a6', fontSize: 11, marginBottom: 4 }}>Transportadora</div>
                    <div style={{ color: '#e8eaed', fontWeight: 600, fontSize: 14 }}>
                      {modalAberto.transportadora || '-'}
                    </div>
                  </div>
                  <div>
                    <div style={{ color: '#9aa0a6', fontSize: 11, marginBottom: 4 }}>Serviço</div>
                    <div style={{ color: '#e8eaed', fontWeight: 600, fontSize: 14 }}>
                      {modalAberto.servico || '-'}
                    </div>
                  </div>
                  {/* Só o valor pago pela cliente: o custo da postagem é
                      informação financeira da loja e não aparece aqui */}
                  {(() => {
                    const pag = pagamentoDoRomaneio(modalAberto)

                    return (
                      <div>
                        <div style={{ color: '#9aa0a6', fontSize: 11, marginBottom: 4 }}>
                          {pag ? 'Pago pela cliente' : 'Valor do Frete'}
                        </div>
                        <div style={{ color: '#e8eaed', fontWeight: 600, fontSize: 14 }}>
                          {pag
                            ? `R$ ${Number(pag.valor).toFixed(2)}`
                            : (modalAberto.valor_frete
                                ? `R$ ${(Number(modalAberto.valor_frete) * (1 + margemFrete / 100)).toFixed(2)}`
                                : '-')}
                        </div>
                      </div>
                    )
                  })()}
                  <div>
                    <div style={{ color: '#9aa0a6', fontSize: 11, marginBottom: 4 }}>Prazo</div>
                    <div style={{ color: '#e8eaed', fontWeight: 600, fontSize: 14 }}>
                      {modalAberto.prazo_entrega ? `${modalAberto.prazo_entrega} dia(s)` : '-'}
                    </div>
                  </div>
                </div>

                {/* Endereço */}
                {modalAberto.enderecos_clientes && (
                  <div style={{
                    padding: 16,
                    background: 'rgba(255,255,255,0.03)',
                    borderRadius: 8,
                    marginBottom: 20,
                  }}>
                    <div style={{ color: '#9aa0a6', fontSize: 11, marginBottom: 8, textTransform: 'uppercase', fontWeight: 700 }}>
                      Endereço de Entrega
                    </div>
                    <div style={{ color: '#e8eaed', fontSize: 14, lineHeight: 1.6 }}>
                      <strong>{modalAberto.enderecos_clientes.destinatario}</strong><br />
                      {modalAberto.enderecos_clientes.rua}, {modalAberto.enderecos_clientes.numero}
                      {modalAberto.enderecos_clientes.complemento && ` - ${modalAberto.enderecos_clientes.complemento}`}<br />
                      {modalAberto.enderecos_clientes.bairro} - {modalAberto.enderecos_clientes.cidade}/{modalAberto.enderecos_clientes.estado}<br />
                      CEP: {modalAberto.enderecos_clientes.cep}
                    </div>
                  </div>
                )}

                {/* Retirada na loja */}
                {modalAberto.status === 'retirado' && (
                  <div style={{
                    padding: 16,
                    background: 'rgba(156,39,176,0.1)',
                    border: '1px solid rgba(156,39,176,0.3)',
                    borderRadius: 8,
                    marginBottom: 20,
                  }}>
                    <div style={{ color: '#9aa0a6', fontSize: 11, marginBottom: 8, textTransform: 'uppercase', fontWeight: 700 }}>
                      Retirada na Loja
                    </div>
                    <div style={{ color: '#e8eaed', fontSize: 13, lineHeight: 1.6 }}>
                      A cliente buscou o pedido na loja — sem frete e sem etiqueta.<br />
                      {modalAberto.retirado_nome && <>Retirado por: <strong>{modalAberto.retirado_nome}</strong><br /></>}
                      {modalAberto.retirado_em && <>Em: {formatarDataHora(modalAberto.retirado_em)}<br /></>}
                      {modalAberto.retirado_por_nome && <>Registrado por: {modalAberto.retirado_por_nome}</>}
                    </div>
                  </div>
                )}

                {/* Origem do pagamento do frete */}
                {['frete_pago', 'etiqueta_gerada', 'despachado', 'em_transito', 'entregue'].includes(modalAberto.status) && (() => {
                  const pag = pagamentoDoRomaneio(modalAberto)
                  const manual = !pag?.gateway_transaction_id

                  return (
                    <div style={{
                      padding: 16,
                      background: manual ? 'rgba(255,193,7,0.08)' : 'rgba(76,175,80,0.08)',
                      border: `1px solid ${manual ? 'rgba(255,193,7,0.3)' : 'rgba(76,175,80,0.3)'}`,
                      borderRadius: 8,
                      marginBottom: 20,
                    }}>
                      <div style={{ color: '#9aa0a6', fontSize: 11, marginBottom: 8, textTransform: 'uppercase', fontWeight: 700 }}>
                        Pagamento do Frete
                      </div>

                      {manual ? (
                        <div style={{ color: '#e8eaed', fontSize: 13, lineHeight: 1.6 }}>
                          <strong style={{ color: '#ffc107' }}>Baixa manual</strong> — não entrou pelo Mercado Pago.<br />
                          {pag?.registrado_por_nome && <>Por: {pag.registrado_por_nome}<br /></>}
                          {pag?.observacao && <>Motivo: {pag.observacao}<br /></>}
                          {!pag && 'Sem registro em pagamentos_frete (baixa anterior à auditoria).'}
                          {pag?.pago_em && <>Em: {formatarDataHora(pag.pago_em)}</>}
                        </div>
                      ) : (
                        <div style={{ color: '#e8eaed', fontSize: 13, lineHeight: 1.6 }}>
                          <strong style={{ color: '#4caf50' }}>Mercado Pago</strong> — {pag.metodo?.toUpperCase()}<br />
                          Transação: <span style={{ fontFamily: 'monospace' }}>{pag.gateway_transaction_id}</span><br />
                          {pag.pago_em && <>Em: {formatarDataHora(pag.pago_em)}</>}
                        </div>
                      )}
                    </div>
                  )
                })()}

                {/* Código de Rastreio */}
                {modalAberto.codigo_rastreio && (
                  <div style={{
                    padding: 16,
                    background: 'rgba(33,150,243,0.1)',
                    border: '1px solid rgba(33,150,243,0.3)',
                    borderRadius: 8,
                    marginBottom: 20,
                  }}>
                    <div style={{ color: '#9aa0a6', fontSize: 11, marginBottom: 8, textTransform: 'uppercase', fontWeight: 700 }}>
                      Código de Rastreio
                    </div>
                    <a
                      href={linkRastreio(modalAberto.codigo_rastreio, modalAberto.transportadora)}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{ color: '#2196f3', fontSize: 16, fontWeight: 700, fontFamily: 'monospace', textDecoration: 'none' }}
                    >
                      {modalAberto.codigo_rastreio}
                    </a>
                  </div>
                )}

                {/* Cotação de Frete */}
                {['pronto', 'frete_cotado'].includes(modalAberto.status) && !modalAberto.transportadora && (
                  <div style={{
                    padding: 16,
                    background: 'rgba(255,193,7,0.1)',
                    border: '1px solid rgba(255,193,7,0.3)',
                    borderRadius: 8,
                    marginBottom: 20,
                  }}>
                    <div style={{ color: '#ffc107', fontSize: 14, fontWeight: 600, marginBottom: 8 }}>
                      Frete ainda não cotado
                    </div>

                    {cotacoes.length === 0 ? (
                      <>
                        <div style={{ color: '#9aa0a6', fontSize: 13, marginBottom: 12 }}>
                          Clique no botão abaixo para cotar as opções de frete disponíveis.
                        </div>
                        <button
                          onClick={() => handleCotarFrete(modalAberto)}
                          disabled={cotando}
                          style={{
                            background: 'var(--p-blue)',
                            color: '#0f0f0f',
                            border: 'none',
                            borderRadius: 8,
                            padding: '10px 16px',
                            fontWeight: 700,
                            cursor: cotando ? 'wait' : 'pointer',
                            fontSize: 14,
                            opacity: cotando ? 0.6 : 1,
                          }}
                        >
                          {cotando ? 'Cotando...' : 'Cotar Frete'}
                        </button>
                      </>
                    ) : (
                      <>
                        <div style={{ color: '#9aa0a6', fontSize: 13, marginBottom: 12 }}>
                          Selecione a transportadora desejada:
                        </div>

                        <div style={{ marginBottom: 12, maxHeight: 300, overflow: 'auto' }}>
                          {cotacoes.map((cot) => {
                            // price já vem com margem aplicada
                            const valorComMargem = Number(cot.price || 0)
                            const prazo = cot.delivery_time || cot.delivery_range?.max || 0
                            const nomeTransp = cot.company?.name || cot.name || 'Transportadora'
                            const nomeServico = cot.name || 'Serviço'

                            return (
                              <label
                                key={cot.id}
                                style={{
                                  display: 'flex',
                                  alignItems: 'center',
                                  padding: 12,
                                  marginBottom: 8,
                                  background: cotacaoSelecionada === cot.id ? 'rgba(var(--p-blue-rgb), 0.2)' : 'rgba(255,255,255,0.03)',
                                  border: `1px solid ${cotacaoSelecionada === cot.id ? 'var(--p-blue)' : 'rgba(255,255,255,0.1)'}`,
                                  borderRadius: 8,
                                  cursor: 'pointer',
                                }}
                              >
                                <input
                                  type="radio"
                                  name="cotacao"
                                  value={cot.id}
                                  checked={cotacaoSelecionada === cot.id}
                                  onChange={() => setCotacaoSelecionada(cot.id)}
                                  style={{ marginRight: 12 }}
                                />
                                <div style={{ flex: 1 }}>
                                  <div style={{ color: '#e8eaed', fontWeight: 600, fontSize: 14 }}>
                                    {nomeTransp} - {nomeServico}
                                  </div>
                                  <div style={{ color: '#9aa0a6', fontSize: 12, marginTop: 2 }}>
                                    {prazo} dia(s) úteis
                                  </div>
                                </div>
                                <div style={{ color: 'var(--p-blue)', fontWeight: 700, fontSize: 16 }}>
                                  R$ {valorComMargem.toFixed(2)}
                                </div>
                              </label>
                            )
                          })}
                        </div>

                        <div style={{ display: 'flex', gap: 8 }}>
                          <button
                            onClick={() => {
                              setCotacoes([])
                              setCotacaoSelecionada(null)
                            }}
                            style={{
                              flex: 1,
                              background: 'rgba(255,255,255,0.1)',
                              color: '#e8eaed',
                              border: '1px solid rgba(255,255,255,0.2)',
                              borderRadius: 8,
                              padding: '10px 16px',
                              fontWeight: 700,
                              cursor: 'pointer',
                              fontSize: 14,
                            }}
                          >
                            Voltar
                          </button>
                          <button
                            onClick={() => handleConfirmarCotacao(modalAberto)}
                            disabled={!cotacaoSelecionada}
                            style={{
                              flex: 2,
                              background: cotacaoSelecionada ? 'var(--p-blue)' : 'rgba(255,255,255,0.1)',
                              color: cotacaoSelecionada ? '#0f0f0f' : '#666',
                              border: 'none',
                              borderRadius: 8,
                              padding: '10px 16px',
                              fontWeight: 700,
                              cursor: cotacaoSelecionada ? 'pointer' : 'not-allowed',
                              fontSize: 14,
                            }}
                          >
                            Confirmar Cotação
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                )}

                {/* Botões do Modal */}
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  {modalAberto.status === 'frete_pago' && (
                    <button
                      onClick={() => {
                        handleGerarEtiqueta(modalAberto)
                        setModalAberto(null)
                      }}
                      disabled={gerando === modalAberto.id}
                      style={{
                        flex: 1,
                        minWidth: 150,
                        background: 'var(--p-blue)',
                        color: '#0f0f0f',
                        border: 'none',
                        borderRadius: 8,
                        padding: '14px 20px',
                        fontWeight: 700,
                        cursor: gerando === modalAberto.id ? 'wait' : 'pointer',
                        opacity: gerando === modalAberto.id ? 0.6 : 1,
                      }}
                    >
                      {gerando === modalAberto.id ? 'Gerando...' : 'Gerar Etiqueta'}
                    </button>
                  )}

                  {(modalAberto.status === 'etiqueta_gerada' || modalAberto.status === 'despachado') && (
                    <>
                      <button
                        onClick={() => handleImprimirEtiqueta(modalAberto)}
                        style={{
                          flex: 1,
                          minWidth: 150,
                          background: 'rgba(33,150,243,0.2)',
                          color: '#2196f3',
                          border: '1px solid rgba(33,150,243,0.5)',
                          borderRadius: 8,
                          padding: '14px 20px',
                          fontWeight: 700,
                          cursor: 'pointer',
                        }}
                      >
                        Imprimir Etiqueta
                      </button>

                      {modalAberto.status === 'etiqueta_gerada' && (
                        <button
                          onClick={() => {
                            handleMarcarDespachado(modalAberto)
                            setModalAberto(null)
                          }}
                          style={{
                            flex: 1,
                            minWidth: 150,
                            background: 'rgba(76,175,80,0.2)',
                            color: '#4caf50',
                            border: '1px solid rgba(76,175,80,0.5)',
                            borderRadius: 8,
                            padding: '14px 20px',
                            fontWeight: 700,
                            cursor: 'pointer',
                          }}
                        >
                          Marcar como Despachado
                        </button>
                      )}
                    </>
                  )}

                  {/* Retirada na loja: encerra o romaneio sem frete */}
                  {['pronto', 'frete_cotado', 'frete_pago'].includes(modalAberto.status) && (
                    <button
                      onClick={() => handleMarcarRetirado(modalAberto)}
                      style={{
                        flex: 1,
                        minWidth: 150,
                        background: 'rgba(156,39,176,0.15)',
                        color: '#ce93d8',
                        border: '1px solid rgba(156,39,176,0.5)',
                        borderRadius: 8,
                        padding: '14px 20px',
                        fontWeight: 700,
                        cursor: 'pointer',
                      }}
                    >
                      Retirou na loja
                    </button>
                  )}

                  {/* Aviso ao cliente do pedido que já veio pago */}
                  {['frete_pago', 'etiqueta_gerada', 'despachado', 'em_transito'].includes(modalAberto.status) && (
                    <button
                      onClick={() => handleAvisarCliente(modalAberto)}
                      style={{
                        flex: 1,
                        minWidth: 150,
                        background: 'rgba(37,211,102,0.15)',
                        color: '#25d366',
                        border: '1px solid rgba(37,211,102,0.5)',
                        borderRadius: 8,
                        padding: '14px 20px',
                        fontWeight: 700,
                        cursor: 'pointer',
                      }}
                    >
                      {modalAberto.codigo_rastreio ? 'Mandar rastreio no WhatsApp' : 'Avisar cliente no WhatsApp'}
                    </button>
                  )}

                  {/* Link de frete no WhatsApp - o cliente cota e paga sozinho */}
                  {!['frete_pago', 'etiqueta_gerada', 'despachado', 'cancelado'].includes(modalAberto.status) && (
                    <button
                      onClick={() => handleEnviarLinkFrete(modalAberto)}
                      style={{
                        flex: 1,
                        minWidth: 150,
                        background: 'rgba(37,211,102,0.15)',
                        color: '#25d366',
                        border: '1px solid rgba(37,211,102,0.5)',
                        borderRadius: 8,
                        padding: '14px 20px',
                        fontWeight: 700,
                        cursor: 'pointer',
                      }}
                    >
                      Enviar link no WhatsApp
                    </button>
                  )}

                  {/* Botão Marcar como Pago - aparece apenas quando NÃO está pago */}
                  {!['frete_pago', 'etiqueta_gerada', 'despachado', 'em_transito', 'entregue'].includes(modalAberto.status) && (
                    <button
                      onClick={() => {
                        handleMarcarComoPago(modalAberto)
                        setModalAberto(null)
                      }}
                      style={{
                        flex: 1,
                        minWidth: 150,
                        background: 'rgba(255,193,7,0.2)',
                        color: '#ffc107',
                        border: '1px solid rgba(255,193,7,0.5)',
                        borderRadius: 8,
                        padding: '14px 20px',
                        fontWeight: 700,
                        cursor: 'pointer',
                      }}
                    >
                      Marcar como Pago
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {historicoDe && (
          <ModalHistorico romaneio={historicoDe} onFechar={() => setHistoricoDe(null)} />
        )}

        {/* Confirmações do sistema, no lugar de window.confirm e prompt */}
        {pergunta && (
          <ModalPergunta
            titulo={pergunta.titulo}
            mensagem={pergunta.mensagem}
            campo={pergunta.campo}
            textoConfirmar={pergunta.textoConfirmar}
            perigo={pergunta.perigo}
            onCancelar={() => setPergunta(null)}
            onConfirmar={(valor) => {
              const acao = pergunta.aoConfirmar
              setPergunta(null)
              acao?.(valor)
            }}
          />
        )}

        {/* Erro da transportadora: fica na tela até a pessoa fechar */}
        {erroModal && (
          <div style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.75)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 20,
            zIndex: 11000,
          }}>
            <div style={{
              background: '#1e1e1e',
              border: '1px solid rgba(244,67,54,0.4)',
              borderRadius: 12,
              maxWidth: 520,
              width: '100%',
              boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
            }}>
              <div style={{
                display: 'flex',
                alignItems: 'flex-start',
                justifyContent: 'space-between',
                gap: 12,
                padding: '16px 20px',
                borderBottom: '1px solid rgba(255,255,255,0.08)',
              }}>
                <h3 style={{ margin: 0, color: '#f44336', fontSize: 16, fontWeight: 700 }}>
                  {erroModal.titulo}
                </h3>
                <button
                  onClick={() => setErroModal(null)}
                  title="Fechar"
                  style={{
                    background: 'rgba(255,255,255,0.08)',
                    color: '#e8eaed',
                    border: 'none',
                    borderRadius: 6,
                    width: 28,
                    height: 28,
                    fontSize: 15,
                    lineHeight: 1,
                    cursor: 'pointer',
                    flexShrink: 0,
                  }}
                >
                  ✕
                </button>
              </div>

              <div style={{ padding: 20 }}>
                <p style={{ margin: 0, color: '#e8eaed', fontSize: 14, lineHeight: 1.6 }}>
                  {erroModal.mensagem}
                </p>

                {dicaDoErro(erroModal.mensagem) && (
                  <div style={{
                    marginTop: 16,
                    padding: 14,
                    background: 'rgba(255,193,7,0.1)',
                    border: '1px solid rgba(255,193,7,0.3)',
                    borderRadius: 8,
                    color: '#e8eaed',
                    fontSize: 13,
                    lineHeight: 1.6,
                  }}>
                    <strong style={{ color: '#ffc107' }}>Como resolver:</strong><br />
                    {dicaDoErro(erroModal.mensagem)}
                  </div>
                )}

                <button
                  onClick={() => setErroModal(null)}
                  style={{
                    marginTop: 20,
                    width: '100%',
                    padding: 12,
                    background: 'rgba(255,255,255,0.1)',
                    color: '#e8eaed',
                    border: '1px solid rgba(255,255,255,0.2)',
                    borderRadius: 8,
                    fontWeight: 700,
                    fontSize: 14,
                    cursor: 'pointer',
                  }}
                >
                  Entendi
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Modal de Edição */}
        {editando && (
          <div
            onClick={() => setEditando(null)}
            style={{
              position: 'fixed',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              background: 'rgba(0,0,0,0.7)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              zIndex: 9999,
              padding: 20,
            }}
          >
            <div
              onClick={(e) => e.stopPropagation()}
              style={{
                background: '#1e1e1e',
                border: '1px solid rgba(255,255,255,0.1)',
                borderRadius: 12,
                maxWidth: 600,
                width: '100%',
                maxHeight: '90vh',
                overflow: 'auto',
              }}
            >
              {/* Header */}
              <div style={{
                padding: '20px 24px',
                borderBottom: '1px solid rgba(255,255,255,0.1)',
              }}>
                <h2 style={{ margin: 0, color: '#e8eaed', fontSize: 20, fontWeight: 700 }}>
                  Editar Romaneio {editando.numero}
                </h2>
                <p style={{ margin: '8px 0 0 0', color: '#9aa0a6', fontSize: 13 }}>
                  Ao salvar, o status voltará para PRONTO e cotações serão limpas
                </p>
              </div>

              {/* Formulário */}
              <div style={{ padding: 24 }}>
                <div style={{ marginBottom: 24 }}>
                  <h3 style={{ margin: '0 0 12px 0', color: '#e8eaed', fontSize: 16 }}>
                    Dimensões da Embalagem
                  </h3>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                    <div>
                      <label style={{ display: 'block', color: '#9aa0a6', fontSize: 13, marginBottom: 6 }}>
                        Altura (cm)
                      </label>
                      <input
                        type="number"
                        step="0.01"
                        value={formEdicao.altura}
                        onChange={(e) => setFormEdicao(p => ({ ...p, altura: e.target.value }))}
                        style={{
                          width: '100%',
                          background: 'rgba(255,255,255,0.05)',
                          border: '1px solid rgba(255,255,255,0.1)',
                          borderRadius: 6,
                          padding: '10px 12px',
                          color: '#e8eaed',
                          fontSize: 14,
                        }}
                      />
                    </div>
                    <div>
                      <label style={{ display: 'block', color: '#9aa0a6', fontSize: 13, marginBottom: 6 }}>
                        Largura (cm)
                      </label>
                      <input
                        type="number"
                        step="0.01"
                        value={formEdicao.largura}
                        onChange={(e) => setFormEdicao(p => ({ ...p, largura: e.target.value }))}
                        style={{
                          width: '100%',
                          background: 'rgba(255,255,255,0.05)',
                          border: '1px solid rgba(255,255,255,0.1)',
                          borderRadius: 6,
                          padding: '10px 12px',
                          color: '#e8eaed',
                          fontSize: 14,
                        }}
                      />
                    </div>
                    <div>
                      <label style={{ display: 'block', color: '#9aa0a6', fontSize: 13, marginBottom: 6 }}>
                        Comprimento (cm)
                      </label>
                      <input
                        type="number"
                        step="0.01"
                        value={formEdicao.comprimento}
                        onChange={(e) => setFormEdicao(p => ({ ...p, comprimento: e.target.value }))}
                        style={{
                          width: '100%',
                          background: 'rgba(255,255,255,0.05)',
                          border: '1px solid rgba(255,255,255,0.1)',
                          borderRadius: 6,
                          padding: '10px 12px',
                          color: '#e8eaed',
                          fontSize: 14,
                        }}
                      />
                    </div>
                    <div>
                      <label style={{ display: 'block', color: '#9aa0a6', fontSize: 13, marginBottom: 6 }}>
                        Peso (kg)
                      </label>
                      <input
                        type="number"
                        step="0.001"
                        value={formEdicao.peso}
                        onChange={(e) => setFormEdicao(p => ({ ...p, peso: e.target.value }))}
                        style={{
                          width: '100%',
                          background: 'rgba(255,255,255,0.05)',
                          border: '1px solid rgba(255,255,255,0.1)',
                          borderRadius: 6,
                          padding: '10px 12px',
                          color: '#e8eaed',
                          fontSize: 14,
                        }}
                      />
                    </div>
                  </div>
                </div>

                <div>
                  <h3 style={{ margin: '0 0 12px 0', color: '#e8eaed', fontSize: 16 }}>
                    Dados do Produto
                  </h3>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                    <div>
                      <label style={{ display: 'block', color: '#9aa0a6', fontSize: 13, marginBottom: 6 }}>
                        Declaração (Nota Fiscal)
                      </label>
                      <input
                        type="text"
                        value={formEdicao.produto_declaracao}
                        onChange={(e) => setFormEdicao(p => ({ ...p, produto_declaracao: e.target.value }))}
                        style={{
                          width: '100%',
                          background: 'rgba(255,255,255,0.05)',
                          border: '1px solid rgba(255,255,255,0.1)',
                          borderRadius: 6,
                          padding: '10px 12px',
                          color: '#e8eaed',
                          fontSize: 14,
                        }}
                      />
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                      <div>
                        <label style={{ display: 'block', color: '#9aa0a6', fontSize: 13, marginBottom: 6 }}>
                          Quantidade
                        </label>
                        <input
                          type="number"
                          value={formEdicao.produto_quantidade}
                          onChange={(e) => setFormEdicao(p => ({ ...p, produto_quantidade: e.target.value }))}
                          style={{
                            width: '100%',
                            background: 'rgba(255,255,255,0.05)',
                            border: '1px solid rgba(255,255,255,0.1)',
                            borderRadius: 6,
                            padding: '10px 12px',
                            color: '#e8eaed',
                            fontSize: 14,
                          }}
                        />
                      </div>
                      <div>
                        <label style={{ display: 'block', color: '#9aa0a6', fontSize: 13, marginBottom: 6 }}>
                          Valor Declarado (R$)
                        </label>
                        <input
                          type="number"
                          step="0.01"
                          value={formEdicao.produto_valor_declarado}
                          onChange={(e) => setFormEdicao(p => ({ ...p, produto_valor_declarado: e.target.value }))}
                          style={{
                            width: '100%',
                            background: 'rgba(255,255,255,0.05)',
                            border: '1px solid rgba(255,255,255,0.1)',
                            borderRadius: 6,
                            padding: '10px 12px',
                            color: '#e8eaed',
                            fontSize: 14,
                          }}
                        />
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Footer */}
              <div style={{
                padding: '16px 24px',
                borderTop: '1px solid rgba(255,255,255,0.1)',
                display: 'flex',
                gap: 12,
                justifyContent: 'flex-end',
              }}>
                <button
                  onClick={() => setEditando(null)}
                  style={{
                    background: 'rgba(255,255,255,0.05)',
                    color: '#9aa0a6',
                    border: '1px solid rgba(255,255,255,0.1)',
                    borderRadius: 8,
                    padding: '12px 24px',
                    fontWeight: 600,
                    cursor: 'pointer',
                  }}
                >
                  Cancelar
                </button>
                <button
                  onClick={handleSalvarEdicao}
                  style={{
                    background: '#ff9800',
                    color: '#0f0f0f',
                    border: 'none',
                    borderRadius: 8,
                    padding: '12px 24px',
                    fontWeight: 700,
                    cursor: 'pointer',
                  }}
                >
                  Salvar e Voltar para PRONTO
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </AppShell>
  )
}
