// ============================================================================
// Filtros da vitrine
// ============================================================================
// O mesmo componente serve à coluna fixa do computador e à gaveta do celular:
// os filtros são os mesmos, muda só onde eles aparecem.
//
// Cada grupo aceita mais de uma opção, como em qualquer loja — quem procura
// tamanho 36 costuma aceitar 37 também.
// ============================================================================

import { rotuloGenero } from './genero'

const GRUPOS = [
  { campo: 'genero',    faceta: 'generos',    titulo: 'Para quem' },
  { campo: 'categoria', faceta: 'categorias', titulo: 'Tipo de peça' },
  { campo: 'tamanho',   faceta: 'tamanhos',   titulo: 'Tamanho' },
  { campo: 'marca',     faceta: 'marcas',     titulo: 'Marca' },
]

export function contarFiltros(filtros) {
  return GRUPOS.reduce((total, g) => total + (filtros[g.campo]?.length || 0), 0)
}

export default function FiltrosLoja({ facetas, filtros, onAlternar, onLimpar }) {
  const ativos = contarFiltros(filtros)
  const grupos = GRUPOS.filter(g => (facetas[g.faceta] || []).length > 1)

  if (!grupos.length) return null

  return (
    <div className="loja-filtros-painel">
      <div className="loja-filtros-topo">
        <h3>Filtrar</h3>
        {ativos > 0 && (
          <button type="button" className="loja-filtros-limpar" onClick={onLimpar}>
            Limpar
          </button>
        )}
      </div>

      {grupos.map(({ campo, faceta, titulo }) => (
        <div className="loja-filtro-grupo" key={campo}>
          <h4>{titulo}</h4>
          <div className={campo === 'tamanho' ? 'loja-filtro-tamanhos' : 'loja-filtro-lista'}>
            {facetas[faceta].map(valor => {
              const marcado = (filtros[campo] || []).some(v => v === valor)
              // Tamanho em grade de quadradinhos, como nas lojas: a lista é
              // longa e a cliente procura um número, não lê uma a uma
              return campo === 'tamanho' ? (
                <button
                  key={valor}
                  type="button"
                  className={`loja-filtro-tam ${marcado ? 'ativo' : ''}`}
                  onClick={() => onAlternar(campo, valor)}
                >
                  {valor}
                </button>
              ) : (
                <label key={valor} className={`loja-filtro-opcao ${marcado ? 'ativo' : ''}`}>
                  <input type="checkbox" checked={marcado} onChange={() => onAlternar(campo, valor)} />
                  <span>{campo === 'genero' ? rotuloGenero(valor) : valor}</span>
                </label>
              )
            })}
          </div>
        </div>
      ))}
    </div>
  )
}
