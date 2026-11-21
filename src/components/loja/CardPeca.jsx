import { Link } from 'react-router-dom'

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
        {legendaPeca(peca) && <span className="loja-card-meta">{legendaPeca(peca)}</span>}
        <span className="loja-card-preco">
          {moeda(peca.preco)}
          {peca.preco_cheio ? <s>{moeda(peca.preco_cheio)}</s> : null}
        </span>
      </div>
    </Link>
  )
}
