import { memo, useState } from 'react'
import AutocompleteInput, { navigateNext, navigatePrevious } from '../ui/AutocompleteInput'

// NAVEGAÇÃO DOM DIRETA (Performance crítica - não depende de state)
function navegarProximoInput(currentElement) {
  const tr = currentElement.closest('tr')
  if (!tr) return false

  // Pega TODOS inputs não-disabled da linha (DOM nativo)
  const inputs = Array.from(tr.querySelectorAll('input:not([disabled]):not([tabindex="-1"]), textarea:not([disabled]), select:not([disabled])'))
  const currentIndex = inputs.indexOf(currentElement)

  if (currentIndex >= 0 && currentIndex < inputs.length - 1) {
    inputs[currentIndex + 1]?.focus()
    return true
  }

  return false
}

function navegarAnteriorInput(currentElement) {
  const tr = currentElement.closest('tr')
  if (!tr) return false

  const inputs = Array.from(tr.querySelectorAll('input:not([disabled]):not([tabindex="-1"]), textarea:not([disabled]), select:not([disabled])'))
  const currentIndex = inputs.indexOf(currentElement)

  if (currentIndex > 0) {
    inputs[currentIndex - 1]?.focus()
    return true
  }

  return false
}

function onEnterNext(e) {
  if (e.key === 'Enter') {
    e.preventDefault()
    const navegou = navegarProximoInput(e.target)
    if (!navegou) navigateNext(e.target)
    return
  }

  if (e.key === 'Tab') {
    if (e.shiftKey) {
      e.preventDefault()
      const navegou = navegarAnteriorInput(e.target)
      if (!navegou) navigatePrevious(e.target)
    } else {
      e.preventDefault()
      const navegou = navegarProximoInput(e.target)
      if (!navegou) navigateNext(e.target)
    }
  }
}

function onEnterNextPulaCodigo(e, codigoAutomatico) {
  if (e.key === 'Enter') {
    e.preventDefault()
    navegarProximoInput(e.target)
    return
  }

  if (e.key === 'Tab') {
    if (e.shiftKey) {
      e.preventDefault()
      navegarAnteriorInput(e.target)
    } else {
      e.preventDefault()
      navegarProximoInput(e.target)
    }
  }
}

function copyToClipboard(text) {
  if (navigator.clipboard && window.isSecureContext) {
    return navigator.clipboard.writeText(text)
  }
  return new Promise((res, rej) => {
    const ta = document.createElement('textarea')
    ta.value = text
    ta.style.cssText = 'position:fixed;left:-999999px;top:-999999px'
    document.body.appendChild(ta)
    ta.focus(); ta.select()
    document.execCommand('copy') ? res() : rej()
    ta.remove()
  })
}

const TabelaRow = memo(function TabelaRow({
  linha, listas,
  onFieldChange, onClienteBlur, onClienteSelect, onIsBlocked, onEnterNoCliente,
  onAbrirModal, onAbrirFila,
  onEnviar, onEstornar, onCopiar, onExcluir,
  onStatusChange,
  cols = {},
  config = {},
  modoHistorico = false,
  podeEditarEnviadas = true,
  podeEstornar = true,
}) {
  const upd = (field, val) => onFieldChange(linha._key, field, val)

  // Desabilita edição se for venda enviada E usuário não tiver permissão
  const camposDesabilitados = linha.isSent && !podeEditarEnviadas

  // Debug permissões
  if (linha.isSent) {
    console.log('🔍 Permissões da linha:', {
      podeEditarEnviadas,
      podeEstornar,
      camposDesabilitados
    })
  }

  const [txtCopiado, setTxtCopiado] = useState(false)
  const hasFila = linha.fila1 || linha.fila2 || linha.fila3
  const isCancelado = (linha.status || '').toUpperCase() === 'CANCELADO'

  const dataFormatada = linha.data_live
    ? `${linha.data_live.slice(8, 10)}/${linha.data_live.slice(5, 7)}`
    : '—'

  function copiarTexto(e) {
    e.stopPropagation()
    const partes = []
    if (linha.codigo?.trim())      partes.push(`Código: ${linha.codigo.trim()}`)
    if (linha.produto?.trim())     partes.push(linha.produto.trim())
    if (linha.modelo?.trim())      partes.push(linha.modelo.trim())
    if (linha.cor?.trim())         partes.push(linha.cor.trim())
    if (linha.marca?.trim())       partes.push(linha.marca.trim())
    if (linha.tamanho?.trim())     partes.push(`(${linha.tamanho.trim()})`)
    if (linha.preco?.trim())       partes.push(`R$ ${linha.preco.trim()}`)
    if (linha.cliente_nome?.trim()) partes.push(`- Cliente: ${linha.cliente_nome.trim()}`)
    const texto = partes.join(' ').replace(/\s+/g, ' ')
    copyToClipboard(texto)
      .then(() => { setTxtCopiado(true); setTimeout(() => setTxtCopiado(false), 1000) })
      .catch(() => {})
  }

  return (
    <tr className={linha.isSent ? 'linha-enviada' : isCancelado ? 'linha-cancelada' : ''}>
      {/* SACOLA */}
      <td className="col-sacola td-sacola"
        onClick={() => {
          if (camposDesabilitados) return // Bloqueia se não tiver permissão
          onAbrirModal()
        }}
        title={camposDesabilitados ? "Sem permissão para editar vendas enviadas" : "Clique para editar"}
        style={camposDesabilitados ? { cursor: 'not-allowed', opacity: 0.6 } : undefined}>
        <input className="cell-input sacola" value={linha.sacolinha ?? ''} readOnly tabIndex={-1} />
      </td>

      {/* PRODUTO */}
      <td className="col-produto">
        <AutocompleteInput className="cell-input" value={linha.produto}
          list={listas.produtos} onChange={v => upd('produto', v)} disabled={camposDesabilitados} />
      </td>

      {/* MODELO */}
      <td className="col-modelo">
        <AutocompleteInput className="cell-input" value={linha.modelo}
          list={listas.modelos} onChange={v => upd('modelo', v)} disabled={camposDesabilitados} />
      </td>

      {/* GÊNERO (opcional) */}
      {cols.genero && (
        <td className="col-genero">
          <select className="cell-input cell-select" value={linha.genero || ''} disabled={camposDesabilitados}
            onChange={e => upd('genero', e.target.value)}>
            <option value=""></option>
            <option value="M">Masc.</option>
            <option value="F">Fem.</option>
            <option value="U">Unissex</option>
          </select>
        </td>
      )}

      {/* COR */}
      <td className="col-cor">
        <AutocompleteInput className="cell-input" value={linha.cor}
          list={listas.cores} onChange={v => upd('cor', v)} disabled={camposDesabilitados} />
      </td>

      {/* MARCA */}
      <td>
        <AutocompleteInput className="cell-input" value={linha.marca}
          list={listas.marcas} onChange={v => upd('marca', v)} disabled={camposDesabilitados} />
      </td>

      {/* TAMANHO */}
      <td className="col-tam">
        <input className="cell-input" value={linha.tamanho}
          onChange={e => upd('tamanho', e.target.value)}
          onKeyDown={onEnterNext} disabled={camposDesabilitados} />
      </td>

      {/* CONDIÇÃO (opcional) */}
      {cols.condicao && (
        <td className="col-tam">
          <select className="cell-input cell-select" value={linha.condicao || ''} disabled={camposDesabilitados}
            onChange={e => upd('condicao', e.target.value)}>
            <option value=""></option>
            <option value="Novo">Novo</option>
            <option value="Usado">Usado</option>
          </select>
        </td>
      )}

      {/* CUSTO (opcional) — antes do Preço */}
      {cols.custo && (
        <td className="col-preco">
          <input className="cell-input price" value={linha.custo || ''}
            onChange={e => upd('custo', e.target.value.replace(/[^\d,]/g, ''))}
            onKeyDown={onEnterNext} disabled={camposDesabilitados}
            placeholder="0,00" />
        </td>
      )}

      {/* PREÇO */}
      <td className="col-preco">
        <input className="cell-input price" value={linha.preco}
          onChange={e => upd('preco', e.target.value.replace(/[^\d,]/g, ''))}
          onKeyDown={e => onEnterNextPulaCodigo(e, config.codigo_automatico)}
          disabled={camposDesabilitados} />
      </td>

      {/* CÓDIGO */}
      <td className="col-cod">
        <input className="cell-input" value={linha.codigo}
          onChange={e => upd('codigo', e.target.value)}
          onKeyDown={onEnterNext}
          disabled={camposDesabilitados}
          readOnly={config.codigo_automatico}
          tabIndex={config.codigo_automatico ? -1 : undefined}
          style={config.codigo_automatico ? {
            backgroundColor: 'rgba(139, 180, 248, 0.1)',
            cursor: 'not-allowed',
            color: 'var(--blue)',
            fontWeight: 600
          } : {}} />
      </td>

      {/* CLIENTE */}
      <td className="col-cliente">
        <AutocompleteInput
          className="cell-input"
          value={linha.cliente_nome}
          list={listas.clientes}
          onChange={v => upd('cliente_nome', v)}
          onBlur={() => onClienteBlur(linha._key)}
          onSelect={(v, inputEl) => onClienteSelect?.(linha._key, v, inputEl)}
          isBlocked={v => onIsBlocked?.(v)}
          onEnterNewRow={onEnterNoCliente}
          disabled={camposDesabilitados}
        />
      </td>

      {/* STATUS — só no histórico */}
      {modoHistorico && (
        <td className="col-status">
          <select
            value={linha.status || 'ENVIADO'}
            onChange={e => onStatusChange && onStatusChange(idx, e.target.value)}
            style={{
              background: isCancelado ? 'rgba(239,68,68,0.15)' : 'rgba(34,197,94,0.1)',
              color: isCancelado ? 'var(--red)' : 'var(--green)',
              border: `1px solid ${isCancelado ? 'rgba(239,68,68,0.3)' : 'rgba(34,197,94,0.3)'}`,
              borderRadius: 4, fontSize: 11, fontWeight: 700,
              padding: '2px 4px', width: '100%', cursor: 'pointer',
            }}
          >
            <option value="ENVIADO">Enviado</option>
            <option value="CANCELADO">Cancelado</option>
          </select>
        </td>
      )}

      {/* AÇÕES */}
      <td className="col-acoes">
        <div className="acoes-wrapper">
          {/* Fila */}
          <button type="button"
            className={`btn-action-sm fila${hasFila ? ' has-fila' : ''}`}
            title="Fila de Espera"
            onClick={e => { e.stopPropagation(); onAbrirFila() }}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="8.5" cy="7" r="4"/>
              <line x1="20" y1="8" x2="20" y2="14"/><line x1="23" y1="11" x2="17" y2="11"/>
            </svg>
          </button>

          {/* Copiar texto da linha */}
          {!modoHistorico && (
            <button type="button"
              className="btn-action-sm copy-txt"
              title="Copiar texto da linha"
              onClick={e => { e.stopPropagation(); copiarTexto(e) }}
              style={txtCopiado ? { color: 'var(--green)' } : undefined}
            >
              {txtCopiado
                ? <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                : <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><rect x="8" y="2" width="8" height="4" rx="1" ry="1"/></svg>
              }
            </button>
          )}

          {/* Enviar — oculto no histórico */}
          {!linha.isSent && !modoHistorico && (
            <button type="button" className="btn-action-sm send" title="Enviar para o banco"
              onClick={e => { e.stopPropagation(); onEnviar(linha._key) }}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/>
              </svg>
            </button>
          )}

          {/* Estornar - só aparece se tiver permissão */}
          {(linha.isSent || modoHistorico) && podeEstornar && (
            <button type="button" className="btn-action-sm undo" title="Estornar envio" style={{ display: 'flex' }}
              onClick={e => { e.stopPropagation(); onEstornar(linha._key) }}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="9 14 4 9 9 4"/><path d="M20 20v-7a4 4 0 0 0-4-4H4"/>
              </svg>
            </button>
          )}

          {/* Copiar linha */}
          {!linha.isSent && !modoHistorico && (
            <button type="button" className="btn-action-sm copy" title="Copiar linha"
              onClick={e => { e.stopPropagation(); onCopiar(linha._key) }}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/>
                <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
              </svg>
            </button>
          )}

          {/* Excluir */}
          {(!linha.isSent || modoHistorico) && (
            <button type="button" className="btn-action-sm del" title="Excluir linha"
              onClick={e => { e.stopPropagation(); onExcluir(linha._key) }}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="3 6 5 6 21 6"/>
                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
              </svg>
            </button>
          )}
        </div>
      </td>
    </tr>
  )
}, (prevProps, nextProps) => {
  // COMPARAÇÃO OTIMIZADA (evita rerenders desnecessários)
  // Só rerrenderiza se a linha atual mudou (não por mudanças em outras linhas)
  const prev = prevProps.linha
  const next = nextProps.linha

  // Se qualquer campo da linha mudou, rerenderiza
  if (
    prev.produto !== next.produto ||
    prev.modelo !== next.modelo ||
    prev.cor !== next.cor ||
    prev.marca !== next.marca ||
    prev.tamanho !== next.tamanho ||
    prev.preco !== next.preco ||
    prev.codigo !== next.codigo ||
    prev.cliente_nome !== next.cliente_nome ||
    prev.deleted !== next.deleted ||
    prev.isSent !== next.isSent ||
    prev.sacolinha !== next.sacolinha ||
    prev.custo !== next.custo ||
    prev.qtde !== next.qtde ||
    prev.condicao !== next.condicao ||
    prev.genero !== next.genero
  ) {
    return false // Rerenderiza
  }

  // Se config mudou, rerenderiza
  if (prevProps.config?.codigo_automatico !== nextProps.config?.codigo_automatico) {
    return false
  }

  // Caso contrário, não rerenderiza (PERFORMANCE!)
  return true
})

export default TabelaRow
