import { useState, useEffect, useCallback, useRef } from 'react'
import { useParams } from 'react-router-dom'
import PortalToastProvider, { usePortalToast } from '../../components/portal/PortalToast'
import LojaHeader from '../../components/loja/LojaHeader'
import CardPeca from '../../components/loja/CardPeca'
import FiltrosLoja, { contarFiltros } from '../../components/loja/FiltrosLoja'
import CarrinhoPainel, { BarraCarrinho } from '../../components/loja/CarrinhoPainel'
import ModalEntrar from '../../components/loja/ModalEntrar'
import useCarrinhoLoja, { lerPedidoSalvo } from './useCarrinhoLoja'
import useContaLoja from './useContaLoja'
import { buscarCatalogo } from '../../services/lojaService'
import '../../styles/portal.css'
import './loja.css'

// ============================================================================
// Catálogo público — /loja/:slug
// ============================================================================
// Página aberta, sem login, feita para o celular: é o link que vai na bio do
// Instagram. Nenhuma consulta sai daqui para o banco; quem responde é a Edge
// Function loja-publica.
// ============================================================================

const ORDENS = [
  { valor: 'recentes', rotulo: 'Mais recentes' },
  { valor: 'menor', rotulo: 'Menor preço' },
  { valor: 'maior', rotulo: 'Maior preço' },
]

function Catalogo() {
  const { slug } = useParams()
  const toast = usePortalToast()

  const [loja, setLoja] = useState(null)
  const [fechada, setFechada] = useState(false)
  const [erro, setErro] = useState('')
  const [pecas, setPecas] = useState([])
  const [facetas, setFacetas] = useState({ categorias: [], tamanhos: [], marcas: [] })
  const [filtros, setFiltros] = useState({})
  const [ordem, setOrdem] = useState('recentes')
  const [filtrosAbertos, setFiltrosAbertos] = useState(false) // gaveta do celular
  const [busca, setBusca] = useState('')
  const [buscaAtiva, setBuscaAtiva] = useState('') // com atraso: uma consulta por pausa, não por tecla
  const [pagina, setPagina] = useState(1)
  const [temMais, setTemMais] = useState(false)
  const [total, setTotal] = useState(0) // quantas peças o filtro atual encontrou
  const [carregando, setCarregando] = useState(true)
  const [carregandoMais, setCarregandoMais] = useState(false)
  const [painelAberto, setPainelAberto] = useState(false)

  const carrinho = useCarrinhoLoja(slug, toast)
  const conta = useContaLoja()
  const [entrarAberto, setEntrarAberto] = useState(false)
  const primeiraCarga = useRef(true)

  useEffect(() => {
    const timer = setTimeout(() => {
      // Busca nova recomeça da primeira página. Os dois juntos, no mesmo
      // passo: zerar a página num efeito à parte dispararia uma consulta com
      // a página antiga, que acrescentaria o resultado novo ao antigo.
      setBuscaAtiva(busca)
      setPagina(1)
    }, 350)
    return () => clearTimeout(timer)
  }, [busca])

  useEffect(() => {
    if (!slug) return
    let vivo = true
    const inicial = pagina === 1

    if (inicial && !primeiraCarga.current) setCarregando(true)
    if (!inicial) setCarregandoMais(true)

    buscarCatalogo(slug, { pagina, filtros, busca: buscaAtiva, ordem, pedidoId: lerPedidoSalvo(slug) })
      .then(dados => {
        if (!vivo) return
        setLoja(dados.loja)
        setFechada(Boolean(dados.fechada))
        setFacetas(dados.facetas || { categorias: [], tamanhos: [], marcas: [] })
        setTemMais(Boolean(dados.tem_mais))
        setTotal(Number(dados.total || 0))
        // "Ver mais" acrescenta; filtro novo substitui
        setPecas(prev => inicial ? (dados.pecas || []) : [...prev, ...(dados.pecas || [])])
        setErro('')
      })
      .catch(err => {
        if (!vivo) return
        setErro(err.message || 'Não foi possível abrir a loja agora')
      })
      .finally(() => {
        if (!vivo) return
        primeiraCarga.current = false
        setCarregando(false)
        setCarregandoMais(false)
      })

    return () => { vivo = false }
  }, [slug, pagina, filtros, buscaAtiva, ordem])

  // Marca e desmarca uma opção dentro do grupo, sem derrubar as outras
  const alternarFiltro = useCallback((campo, valor) => {
    setFiltros(prev => {
      const atuais = prev[campo] || []
      const novos = atuais.includes(valor)
        ? atuais.filter(v => v !== valor)
        : [...atuais, valor]
      return { ...prev, [campo]: novos.length ? novos : undefined }
    })
    setPagina(1)
  }, [])

  const limparFiltros = useCallback(() => {
    setFiltros({})
    setBusca('')
    setBuscaAtiva('')
    setPagina(1)
  }, [])

  const filtrosAtivos = contarFiltros(filtros)
  const temFiltro = filtrosAtivos > 0 || Boolean(buscaAtiva.trim())

  const painelFiltros = (
    <FiltrosLoja
      facetas={facetas}
      filtros={filtros}
      onAlternar={alternarFiltro}
      onLimpar={limparFiltros}
    />
  )

  // Erro de rede ou loja inexistente: sem cabeçalho, porque nem o nome da loja
  // chegou até aqui
  if (erro) {
    return (
      <div className="loja-root">
        <div className="loja-aviso">
          <h2>Não foi possível abrir a loja</h2>
          <p>{erro}</p>
        </div>
      </div>
    )
  }

  return (
    <div className="loja-root">
      <LojaHeader
        nome={loja?.nome || 'Loja'}
        slug={slug}
        quantidade={carrinho.quantidade}
        onAbrirCarrinho={() => setPainelAberto(true)}
        instagram={conta.instagram}
        onEntrar={() => setEntrarAberto(true)}
        onSair={conta.sair}
      />

      {fechada ? (
        <div className="loja-aviso">
          <h2>A loja está fechada agora</h2>
          <p>Logo tem peça nova por aqui. Acompanhe o Instagram para saber quando a loja abrir.</p>
        </div>
      ) : (
        <div className="loja-corpo">
          {/* Coluna de filtros: fica à vista no computador e vira gaveta no celular */}
          <aside className="loja-lateral">{painelFiltros}</aside>

          <div className="loja-vitrine">
            <div className="loja-filtros">
              <input
                className="loja-busca"
                value={busca}
                onChange={e => setBusca(e.target.value)}
                placeholder="Buscar peça, marca, tamanho…"
                inputMode="search"
              />
              <span className="loja-busca-dica">
                Procure por mais de uma coisa separando por vírgula: jeans, 10
              </span>
            </div>

            <div className="loja-barra-lista">
              <button
                type="button"
                className="loja-btn-filtrar"
                onClick={() => setFiltrosAbertos(true)}
              >
                Filtrar
                {filtrosAtivos > 0 && <span className="loja-badge">{filtrosAtivos}</span>}
              </button>

              <span className="loja-contagem">
                {carregando ? '' : `${total} ${total === 1 ? 'peça' : 'peças'}`}
              </span>

              <select
                className="loja-ordem"
                value={ordem}
                onChange={e => { setOrdem(e.target.value); setPagina(1) }}
                aria-label="Ordenar"
              >
                {ORDENS.map(o => <option key={o.valor} value={o.valor}>{o.rotulo}</option>)}
              </select>
            </div>

          {carregando ? (
            <div className="loja-grid">
              {Array.from({ length: 6 }).map((_, i) => <div key={i} className="loja-esqueleto" />)}
            </div>
          ) : pecas.length === 0 ? (
            <div className="loja-aviso">
              <h2>{temFiltro ? 'Nada com esse filtro' : 'Ainda não tem peça no ar'}</h2>
              <p>
                {temFiltro
                  ? 'Tente outro tamanho ou limpe a busca para ver tudo.'
                  : 'As peças aparecem aqui assim que a loja publicar.'}
              </p>
              {temFiltro && (
                <button type="button" className="loja-btn secundario" style={{ marginTop: 14 }} onClick={limparFiltros}>
                  Ver todas as peças
                </button>
              )}
            </div>
          ) : (
            <>
              <div className="loja-grid">
                {pecas.map(peca => (
                  <CardPeca
                    key={peca.id}
                    peca={peca}
                    slug={slug}
                    noCarrinho={carrinho.temNoCarrinho(peca.id)}
                  />
                ))}
              </div>

              {temMais && (
                <div className="loja-ver-mais">
                  <button
                    type="button"
                    className="loja-btn secundario"
                    onClick={() => setPagina(p => p + 1)}
                    disabled={carregandoMais}
                  >
                    {carregandoMais ? 'Carregando…' : 'Ver mais peças'}
                  </button>
                </div>
              )}
            </>
          )}
          </div>
        </div>
      )}

      {/* Gaveta de filtros do celular */}
      {filtrosAbertos && (
        <div className="loja-gaveta-fundo" onClick={() => setFiltrosAbertos(false)}>
          <div className="loja-gaveta" onClick={e => e.stopPropagation()}>
            <div className="loja-painel-topo">
              <h2>Filtrar</h2>
              <button type="button" className="loja-fechar" onClick={() => setFiltrosAbertos(false)} aria-label="Fechar">×</button>
            </div>

            {painelFiltros}

            <div className="loja-gaveta-rodape">
              <button type="button" className="loja-btn secundario" onClick={limparFiltros}>
                Limpar
              </button>
              <button type="button" className="loja-btn" onClick={() => setFiltrosAbertos(false)}>
                Ver {total} {total === 1 ? 'peça' : 'peças'}
              </button>
            </div>
          </div>
        </div>
      )}

      <BarraCarrinho
        quantidade={carrinho.quantidade}
        valor={carrinho.valorItens}
        restante={carrinho.restante}
        onAbrir={() => setPainelAberto(true)}
      />

      {entrarAberto && (
        <ModalEntrar
          onFechar={() => setEntrarAberto(false)}
          onEntrou={() => {
            setEntrarAberto(false)
            toast('Pronto! Você está conectada neste aparelho.', 'success')
          }}
        />
      )}

      {painelAberto && (
        <CarrinhoPainel
          itens={carrinho.itens}
          valor={carrinho.valorItens}
          restante={carrinho.restante}
          ocupado={carrinho.ocupado}
          slug={slug}
          onFechar={() => setPainelAberto(false)}
          onRemover={carrinho.remover}
        />
      )}
    </div>
  )
}

export default function LojaPage() {
  return (
    <PortalToastProvider>
      <Catalogo />
    </PortalToastProvider>
  )
}
