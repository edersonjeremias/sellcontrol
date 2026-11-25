import { Link } from 'react-router-dom'
import { rotuloGenero } from './genero'

const moeda = v => Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

// Nome curto da peça: o que diferencia uma peça da outra na vitrine.
// A marca sai do título e vira linha de baixo — em brechó o que decide é a
// peça, e o nome inteiro em duas linhas de card fica ilegível.
export function tituloPeca(p) {
  return [p.produto, p.modelo, p.cor].map(v => String(v || '').trim()).filter(Boolean).join(' ')
}

export function legendaPeca(p) {
  const partes = []
  if (String(p.marca || '').trim()) partes.push(p.marca.trim())
  if (rotuloGenero(p.genero)) partes.push(rotuloGenero(p.genero))
  if (String(p.tamanho || '').trim()) partes.push(`Tam. ${p.tamanho.trim()}`)
  return partes.join(' · ')
}

export default function CardPeca({ peca, slug, noCarrinho }) {
  return (
    <Link to={`/loja/${slug}/p/${encodeURIComponent(peca.codigo)}`} className="loja-card">
      <div className="loja-card-foto">
        {peca.imagem
          ? <img src={peca.imagem} alt={tituloPeca(peca)} loading="lazy" />
          : null}
        {noCarrinho && <span className="loja-card-selo">Na sua sacola</span>}
      </div>

      <div className="loja-card-info">
        <span className="loja-card-nome">{tituloPeca(peca) || `Peça ${peca.codigo}`}</span>
        {/* Código na frente de tudo: é por ele que a cliente pergunta no
            direct, e sem isso a loja tinha de abrir a peça para descobrir */}
        <span className="loja-card-meta">
          {peca.codigo && <b className="loja-card-codigo">Cód. {peca.codigo}</b>}
          {peca.codigo && legendaPeca(peca) ? ' · ' : ''}
          {legendaPeca(peca)}
        </span>
        <span className="loja-card-preco">
          {moeda(peca.preco)}
          {peca.preco_cheio ? <s>{moeda(peca.preco_cheio)}</s> : null}
        </span>
      </div>
    </Link>
  )
}
