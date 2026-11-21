import { Link } from 'react-router-dom'
import { tituloPeca, legendaPeca } from './CardPeca'

const moeda = v => Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

export function relogio(segundos) {
  const m = Math.floor(segundos / 60)
  const s = segundos % 60
  return `${m}:${String(s).padStart(2, '0')}`
}

// Barra de baixo: aparece só com peça na sacola. Mostra o total e o tempo que
// falta, porque a reserva correndo sem aviso é a pior surpresa possível.
export function BarraCarrinho({ quantidade, valor, restante, onAbrir }) {
  if (!quantidade) return null

  return (
    <div className="loja-barra">
      <div className="loja-barra-info">
        <b>{moeda(valor)}</b>
        {quantidade} {quantidade === 1 ? 'peça guardada' : 'peças guardadas'}
        {restante > 0 && (
          <> · <span className={`loja-relogio ${restante <= 120 ? 'urgente' : ''}`}>{relogio(restante)}</span></>
        )}
      </div>
      <button type="button" className="loja-btn" onClick={onAbrir}>Ver sacola</button>
    </div>
  )
}

export default function CarrinhoPainel({ itens, valor, restante, ocupado, slug, onFechar, onRemover }) {
  return (
    <div className="loja-painel-fundo" onClick={onFechar}>
      <div className="loja-painel" onClick={e => e.stopPropagation()}>
        <div className="loja-painel-topo">
          <h2>Sua sacola</h2>
          <button type="button" className="loja-fechar" onClick={onFechar} aria-label="Fechar">×</button>
        </div>

        {restante > 0 && (
          <p className="loja-painel-nota">
            As peças estão guardadas só para você por{' '}
            <span className={`loja-relogio ${restante <= 120 ? 'urgente' : ''}`}>{relogio(restante)}</span>.
            Depois disso elas voltam para a loja.
          </p>
        )}

        {!itens.length && (
          <p className="loja-painel-nota">Sua sacola está vazia.</p>
        )}

        {itens.map(item => (
          <div key={item.id} className="loja-item">
            <div className="loja-item-foto">
              {item.imagem ? <img src={item.imagem} alt="" loading="lazy" /> : null}
            </div>
            <div className="loja-item-texto">
              {tituloPeca(item) || `Peça ${item.codigo}`}
              {legendaPeca(item) && <><br />{legendaPeca(item)}</>}
              <br /><b>{moeda(item.preco)}</b>
            </div>
            <button
              type="button"
              className="loja-item-tirar"
              onClick={() => onRemover(item.produto_id)}
              disabled={ocupado}
            >
              Tirar
            </button>
          </div>
        ))}

        {!!itens.length && (
          <>
            <div className="loja-painel-total">
              <span>Total das peças</span>
              <b>{moeda(valor)}</b>
            </div>
            <Link to={`/loja/${slug}/checkout`} className="loja-btn largo" onClick={onFechar}>
              Fechar pedido
            </Link>
            <p className="loja-painel-nota">O frete é calculado pelo seu CEP no passo seguinte.</p>
          </>
        )}
      </div>
    </div>
  )
}
