import { useState, useEffect } from 'react'
import { useParams, Link } from 'react-router-dom'
import PortalToastProvider, { usePortalToast } from '../../components/portal/PortalToast'
import LojaHeader from '../../components/loja/LojaHeader'
import CardPeca, { tituloPeca } from '../../components/loja/CardPeca'
import CarrinhoPainel, { BarraCarrinho } from '../../components/loja/CarrinhoPainel'
import ModalEntrar from '../../components/loja/ModalEntrar'
import useCarrinhoLoja, { lerPedidoSalvo } from './useCarrinhoLoja'
import useContaLoja from './useContaLoja'
import { buscarPeca } from '../../services/lojaService'
import '../../styles/portal.css'
import './loja.css'

// ============================================================================
// Página de uma peça — /loja/:slug/p/:codigo
// ============================================================================
// É o link que vai no story e no direct: endereço curto, foto grande e um
// caminho de volta para o catálogo inteiro.
//
// O link circula muito depois da venda, então peça vendida não dá erro: ela
// explica e convida a ver o resto.
// ============================================================================

const moeda = v => Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

function Peca() {
  const { slug, codigo } = useParams()
  const toast = usePortalToast()

  const [dados, setDados] = useState(null)
  const [erro, setErro] = useState('')
  const [carregando, setCarregando] = useState(true)
  const [fotoAtiva, setFotoAtiva] = useState(0)
  const [painelAberto, setPainelAberto] = useState(false)

  const carrinho = useCarrinhoLoja(slug, toast)
  const conta = useContaLoja()
  const [entrarAberto, setEntrarAberto] = useState(false)

  useEffect(() => {
    if (!slug || !codigo) return
    let vivo = true
    setCarregando(true)
    setFotoAtiva(0)

    buscarPeca(slug, codigo, lerPedidoSalvo(slug))
      .then(r => { if (vivo) { setDados(r); setErro('') } })
      .catch(err => { if (vivo) setErro(err.message || 'Não foi possível abrir a peça') })
      .finally(() => { if (vivo) setCarregando(false) })

    return () => { vivo = false }
  }, [slug, codigo])

  const peca = dados?.peca
  const noCarrinho = peca ? carrinho.temNoCarrinho(peca.id) : false

  async function guardar() {
    if (!peca) return
    const ok = await carrinho.adicionar(peca.id)
    // Deu certo: a sacola abre para a cliente ver o que já separou e o prazo
    if (ok) setPainelAberto(true)
    // Falhou por alguém ter levado a peça: recarrega para a página refletir
    else if (!carrinho.temNoCarrinho(peca.id)) {
      buscarPeca(slug, codigo, lerPedidoSalvo(slug)).then(setDados).catch(() => {})
    }
  }

  if (erro) {
    return (
      <div className="loja-root">
        <div className="loja-aviso">
          <h2>Não foi possível abrir a peça</h2>
          <p>{erro}</p>
          <Link to={`/loja/${slug}`} className="loja-btn secundario" style={{ marginTop: 14 }}>
            Ver a loja
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="loja-root">
      <LojaHeader
        nome={dados?.loja?.nome || 'Loja'}
        slug={slug}
        quantidade={carrinho.quantidade}
        onAbrirCarrinho={() => setPainelAberto(true)}
        mostrarVoltar
        instagram={conta.instagram}
        onEntrar={() => setEntrarAberto(true)}
        onSair={conta.sair}
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

      {carregando ? (
        <div className="loja-peca">
          <div className="loja-esqueleto" style={{ marginTop: 14 }} />
        </div>
      ) : dados?.fechada ? (
        <div className="loja-aviso">
          <h2>A loja está fechada agora</h2>
          <p>Logo tem peça nova por aqui.</p>
        </div>
      ) : dados?.indisponivel || !peca ? (
        <div className="loja-aviso">
          <h2>Esta peça já foi</h2>
          <p>Peça de brechó é única: quando sai, não volta. Mas tem outras esperando você.</p>
          <Link to={`/loja/${slug}`} className="loja-btn" style={{ marginTop: 16 }}>
            Ver as peças disponíveis
          </Link>
        </div>
      ) : (
        <>
          <div className="loja-peca">
            <div className="loja-peca-foto">
              {peca.imagens?.[fotoAtiva]
                ? <img src={peca.imagens[fotoAtiva]} alt={tituloPeca(peca)} />
                : null}
            </div>

            {peca.imagens?.length > 1 && (
              <div className="loja-peca-minis">
                {peca.imagens.map((url, i) => (
                  <button
                    key={url}
                    type="button"
                    className={`loja-peca-mini ${i === fotoAtiva ? 'ativa' : ''}`}
                    onClick={() => setFotoAtiva(i)}
                    aria-label={`Foto ${i + 1}`}
                  >
                    <img src={url} alt="" loading="lazy" />
                  </button>
                ))}
              </div>
            )}

            <h1 className="loja-peca-nome">{tituloPeca(peca) || `Peça ${peca.codigo}`}</h1>

            <div className="loja-peca-meta">
              {peca.marca && <span className="loja-peca-tag">{peca.marca}</span>}
              {peca.tamanho && <span className="loja-peca-tag">Tamanho {peca.tamanho}</span>}
              {peca.condicao && <span className="loja-peca-tag">{peca.condicao}</span>}
              <span className="loja-peca-tag">Cód. {peca.codigo}</span>
            </div>

            <div className="loja-peca-preco">
              {moeda(peca.preco)}
              {peca.preco_cheio ? <s>{moeda(peca.preco_cheio)}</s> : null}
            </div>
            <p className="loja-peca-unica">Peça única. Fica guardada para você por alguns minutos depois de entrar na sacola.</p>

            {noCarrinho ? (
              <button type="button" className="loja-btn secundario largo" onClick={() => setPainelAberto(true)}>
                Já está na sua sacola — ver
              </button>
            ) : (
              <button type="button" className="loja-btn largo" onClick={guardar} disabled={carrinho.ocupado}>
                {carrinho.ocupado ? 'Guardando…' : 'Quero esta peça'}
              </button>
            )}
          </div>

          {dados.relacionadas?.length > 0 && (
            <div className="loja-relacionadas">
              <h3>Outras parecidas</h3>
              <div className="loja-grid">
                {dados.relacionadas.map(p => (
                  <CardPeca key={p.id} peca={p} slug={slug} noCarrinho={carrinho.temNoCarrinho(p.id)} />
                ))}
              </div>
            </div>
          )}
        </>
      )}

      <BarraCarrinho
        quantidade={carrinho.quantidade}
        valor={carrinho.valorItens}
        restante={carrinho.restante}
        onAbrir={() => setPainelAberto(true)}
      />

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

export default function PecaPage() {
  return (
    <PortalToastProvider>
      <Peca />
    </PortalToastProvider>
  )
}
