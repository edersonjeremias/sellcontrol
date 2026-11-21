import { Link } from 'react-router-dom'

// Cabeçalho da loja pública. Fica grudado no topo porque é por ele que a
// cliente volta ao catálogo e abre o carrinho — as duas ações que ela mais
// repete enquanto escolhe peça.
export default function LojaHeader({ nome, slug, quantidade, onAbrirCarrinho, mostrarVoltar }) {
  return (
    <header className="loja-header">
      <Link to={`/loja/${slug}`} className="loja-header-nome">
        {mostrarVoltar && (
          <span className="loja-voltar" aria-hidden="true">
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="15 18 9 12 15 6" />
            </svg>
          </span>
        )}
        <span>{nome}</span>
      </Link>

      <button
        type="button"
        className={`loja-btn-carrinho ${quantidade > 0 ? 'cheio' : ''}`}
        onClick={onAbrirCarrinho}
      >
        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z" />
          <line x1="3" y1="6" x2="21" y2="6" />
          <path d="M16 10a4 4 0 0 1-8 0" />
        </svg>
        Sacola
        {quantidade > 0 && <span className="loja-badge">{quantidade}</span>}
      </button>
    </header>
  )
}
