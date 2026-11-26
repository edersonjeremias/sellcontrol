// ============================================================================
// Editor da lista de links (Configurações › Link da Bio)
// ============================================================================
// Serve às duas listas da tela: os ícones de rede social e os botões largos.
// A diferença entre elas é só o que cada uma mostra — o botão tem título e
// subtítulo, o ícone não precisa de nenhum dos dois.
//
// Ligar, desligar, subir, descer e excluir mexem no array em memória. O banco
// só fica sabendo no Salvar: assim nada do que a pessoa está no meio de
// arrumar vai parar na página pública antes da hora.
// ============================================================================

import IconeBio, { TIPOS_BIO } from './IconesBio'

const input = {
  width: '100%',
  padding: '10px 12px',
  background: '#1e1e1e',
  border: '1px solid #333',
  borderRadius: 8,
  color: '#fff',
  fontSize: 14,
  colorScheme: 'dark',
}

const label = { display: 'block', fontSize: 11, color: 'var(--muted)', marginBottom: 4 }

const botaoIcone = (cor) => ({
  width: 32,
  height: 32,
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  borderRadius: 7,
  border: '1px solid var(--border-light)',
  background: 'rgba(255,255,255,0.03)',
  color: cor,
  fontSize: 14,
  fontWeight: 700,
  cursor: 'pointer',
  padding: 0,
  lineHeight: 1,
})

function Interruptor({ ligado, onChange, titulo }) {
  return (
    <button
      type="button"
      onClick={() => onChange(!ligado)}
      title={titulo}
      aria-pressed={ligado}
      style={{
        width: 42, height: 24, borderRadius: 999, padding: 2, cursor: 'pointer',
        border: '1px solid ' + (ligado ? 'var(--green)' : 'var(--border-light)'),
        background: ligado ? 'rgba(129,201,149,0.25)' : 'rgba(255,255,255,0.04)',
        display: 'inline-flex', alignItems: 'center',
        justifyContent: ligado ? 'flex-end' : 'flex-start',
        transition: 'all .15s', flexShrink: 0,
      }}
    >
      <span style={{
        width: 18, height: 18, borderRadius: '50%',
        background: ligado ? 'var(--green)' : '#777', display: 'block',
      }} />
    </button>
  )
}

function Linha({ link, indice, total, completo, onMudar, onMover, onExcluir }) {
  const tipo = TIPOS_BIO.find(t => t.valor === link.tipo) || TIPOS_BIO[0]
  const desligado = link.ativo === false

  return (
    <div style={{
      border: '1px solid var(--border-light)',
      borderRadius: 10,
      padding: 12,
      background: desligado ? 'rgba(255,255,255,0.01)' : 'rgba(255,255,255,0.03)',
      opacity: desligado ? 0.55 : 1,
      transition: 'opacity .15s',
    }}>
      {/* Cabeçalho da linha: o que é, se está no ar e onde fica na lista */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
        <span style={{ color: 'var(--blue)', display: 'inline-flex' }}>
          <IconeBio tipo={link.tipo} tamanho={20} />
        </span>

        <select
          value={link.tipo}
          onChange={e => onMudar({ tipo: e.target.value })}
          style={{ ...input, width: 'auto', flex: '0 0 160px', padding: '7px 10px' }}
        >
          {TIPOS_BIO.map(t => (
            <option key={t.valor} value={t.valor}>{t.rotulo}</option>
          ))}
        </select>

        <div style={{ flex: 1 }} />

        {Number(link.cliques) > 0 && (
          <span style={{ fontSize: 11, color: 'var(--muted)', whiteSpace: 'nowrap' }}
                title="Cliques desde que o link foi criado">
            {link.cliques} {link.cliques === 1 ? 'clique' : 'cliques'}
          </span>
        )}

        <Interruptor
          ligado={link.ativo !== false}
          onChange={v => onMudar({ ativo: v })}
          titulo={desligado ? 'Mostrar na página' : 'Esconder da página'}
        />

        <button type="button" onClick={() => onMover(-1)} disabled={indice === 0}
                title="Subir" style={{ ...botaoIcone('var(--text-body)'), opacity: indice === 0 ? 0.3 : 1 }}>
          ↑
        </button>
        <button type="button" onClick={() => onMover(1)} disabled={indice === total - 1}
                title="Descer" style={{ ...botaoIcone('var(--text-body)'), opacity: indice === total - 1 ? 0.3 : 1 }}>
          ↓
        </button>
        <button type="button" onClick={onExcluir} title="Excluir"
                style={botaoIcone('var(--red)')}>
          ×
        </button>
      </div>

      {completo ? (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 }}>
            <div>
              <label style={label}>Texto do botão</label>
              <input
                value={link.titulo || ''}
                onChange={e => onMudar({ titulo: e.target.value })}
                style={input}
                placeholder={tipo.rotulo}
              />
            </div>
            <div>
              <label style={label}>Linha de baixo (opcional)</label>
              <input
                value={link.subtitulo || ''}
                onChange={e => onMudar({ subtitulo: e.target.value })}
                style={input}
                placeholder="R. Aurélia, 1363 — São Paulo"
              />
            </div>
          </div>

          <div>
            <label style={label}>Destino — {tipo.dica}</label>
            <input
              value={link.valor || ''}
              onChange={e => onMudar({ valor: e.target.value })}
              style={input}
              placeholder={tipo.placeholder}
            />
          </div>

          <label style={{
            display: 'inline-flex', alignItems: 'center', gap: 8,
            marginTop: 10, fontSize: 12, color: 'var(--muted)', cursor: 'pointer',
          }}>
            <input
              type="checkbox"
              checked={link.destaque === true}
              onChange={e => onMudar({ destaque: e.target.checked })}
            />
            Destacar este botão
          </label>
        </>
      ) : (
        <div>
          <label style={label}>{tipo.dica}</label>
          <input
            value={link.valor || ''}
            onChange={e => onMudar({ valor: e.target.value })}
            style={input}
            placeholder={tipo.placeholder}
          />
        </div>
      )}
    </div>
  )
}

export default function EditorLinks({ links, completo, onMudar, onMover, onExcluir, vazio }) {
  if (!links.length) {
    return (
      <p style={{ fontSize: 13, color: 'var(--muted)', margin: '4px 0 0' }}>{vazio}</p>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {links.map((l, i) => (
        <Linha
          key={l.id}
          link={l}
          indice={i}
          total={links.length}
          completo={completo}
          onMudar={campos => onMudar(l.id, campos)}
          onMover={passo => onMover(l.id, passo)}
          onExcluir={() => onExcluir(l.id)}
        />
      ))}
    </div>
  )
}
