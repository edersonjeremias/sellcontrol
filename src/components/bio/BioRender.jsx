// ============================================================================
// O desenho da página de links
// ============================================================================
// Um componente só, usado em dois lugares: a página aberta (/bio/:slug) e a
// pré-visualização dentro das Configurações. É o que garante que o que a loja
// vê enquanto configura seja exatamente o que a cliente vê depois.
//
// Em modo pré-visualização nada é clicável e nenhum clique é contado: ninguém
// quer sair do sistema por engano ao arrumar a própria página.
// ============================================================================

import IconeBio from './IconesBio'
import { ehChavePix, hrefSeguro } from '../../lib/bioUrl'
import './bio.css'

/** Iniciais para a página não ficar com um buraco enquanto não há logo */
function iniciais(titulo) {
  const partes = String(titulo || '').trim().split(/\s+/).filter(Boolean)
  if (!partes.length) return '•'
  if (partes.length === 1) return partes[0].slice(0, 2).toUpperCase()
  return (partes[0][0] + partes[1][0]).toUpperCase()
}

function fundo(p) {
  return p.fundo_tipo === 'gradiente'
    ? `linear-gradient(160deg, ${p.cor_fundo} 0%, ${p.cor_fundo2} 100%)`
    : p.cor_fundo
}

export default function BioRender({ pagina, links, previa = false, onClique }) {
  const p = pagina || {}
  const sociais = (links || []).filter(l => l.grupo === 'social')
  const botoes  = (links || []).filter(l => l.grupo !== 'social')

  const estilo = {
    '--bio-fundo': fundo(p),
    '--bio-texto': p.cor_texto || '#ffffff',
    '--bio-botao': p.cor_botao || '#1e1e1e',
    '--bio-botao-texto': p.cor_texto_botao || '#ffffff',
  }

  const classeRaio = `bio-raio-${p.botao_raio || 'arredondado'}`
  const classeBotao = `bio-botao bio-botao-${p.botao_estilo || 'solido'}`

  function compartilhar() {
    if (previa) return
    const url = window.location.href
    const titulo = p.titulo || 'Meus links'
    if (navigator.share) {
      navigator.share({ title: titulo, url }).catch(() => {})
      return
    }
    navigator.clipboard?.writeText(url)
    onClique?.({ copiado: url })
  }

  function aoClicar(e, link) {
    if (previa) {
      e.preventDefault()
      return
    }
    // Chave Pix não leva a lugar nenhum: clicar copia.
    if (ehChavePix(link)) {
      e.preventDefault()
      navigator.clipboard?.writeText(link.url || '')
      onClique?.({ copiado: link.url, pix: true })
    }
    onClique?.({ link })
  }

  return (
    <div className={`bio-root ${classeRaio}`} style={estilo}>
      <div className="bio-conteudo">

        <div className="bio-topo">
          {p.mostrar_compartilhar !== false && (
            <button
              type="button"
              className="bio-compartilhar"
              onClick={compartilhar}
              aria-label="Compartilhar esta página"
              title="Compartilhar"
            >
              <svg viewBox="0 0 24 24" width="19" height="19" fill="none"
                   stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 16V4" />
                <path d="m7.5 8.5 4.5-4.5 4.5 4.5" />
                <path d="M5 14v4.5A1.5 1.5 0 0 0 6.5 20h11a1.5 1.5 0 0 0 1.5-1.5V14" />
              </svg>
            </button>
          )}
        </div>

        {p.logo_url ? (
          <img
            src={p.logo_url}
            alt={p.titulo || 'Logo'}
            className={`bio-logo bio-logo-${p.logo_formato || 'circulo'}`}
          />
        ) : (
          <div className={`bio-logo bio-logo-vazio bio-logo-${p.logo_formato || 'circulo'}`}>
            {iniciais(p.titulo)}
          </div>
        )}

        <h1 className="bio-titulo">{p.titulo || 'Sua loja'}</h1>
        {p.descricao ? <p className="bio-descricao">{p.descricao}</p> : null}

        {sociais.length > 0 && (
          <div className="bio-sociais">
            {sociais.map(l => (
              <a
                key={l.id}
                className="bio-social"
                href={previa ? undefined : hrefSeguro(l.url)}
                target={l.url?.startsWith('/') ? undefined : '_blank'}
                rel="noopener noreferrer"
                aria-label={l.titulo || l.tipo}
                title={l.titulo || l.tipo}
                onClick={e => aoClicar(e, l)}
              >
                <IconeBio tipo={l.tipo} tamanho={previa ? 22 : 26} />
              </a>
            ))}
          </div>
        )}

        {botoes.length > 0 && (
          <div className="bio-botoes">
            {botoes.map(l => (
              <a
                key={l.id}
                className={`${classeBotao}${l.destaque ? ' bio-botao-destaque' : ''}`}
                href={previa ? undefined : hrefSeguro(l.url)}
                target={l.url?.startsWith('/') || ehChavePix(l) ? undefined : '_blank'}
                rel="noopener noreferrer"
                onClick={e => aoClicar(e, l)}
              >
                <span className="bio-botao-icone">
                  <IconeBio tipo={l.tipo} tamanho={previa ? 17 : 19} />
                </span>
                <span className="bio-botao-rotulo">{l.titulo || 'Sem título'}</span>
                {l.subtitulo ? <span className="bio-botao-sub">{l.subtitulo}</span> : null}
              </a>
            ))}
          </div>
        )}

        {!botoes.length && !sociais.length && (
          <p className="bio-descricao" style={{ marginTop: 28 }}>
            {previa
              ? 'Os links que você adicionar aparecem aqui.'
              : 'Esta página ainda não tem links.'}
          </p>
        )}

        {p.mostrar_marca !== false && (
          <div className="bio-rodape">
            feito com <a href="https://sellcontrol.app" target="_blank" rel="noopener noreferrer">SellControl</a>
          </div>
        )}
      </div>
    </div>
  )
}
