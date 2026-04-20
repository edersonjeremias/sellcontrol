import { memo } from 'react'
import AutocompleteInput, { navigateNext } from '../ui/AutocompleteInput'

function onEnterNext(e) {
  if (e.key !== 'Enter') return
  e.preventDefault()
  navigateNext(e.target)
}

const TabelaRow = memo(function TabelaRow({
  linha, idx, listas,
  onFieldChange, onClienteBlur, onClienteSelect, onNovoFromRow,
  onAbrirModal, onAbrirFila,
  onEnviar, onEstornar, onCopiar, onExcluir,
  onStatusChange,
  modoHistorico = false,
}) {
  const upd = (field, val) => onFieldChange(idx, field, val)
  const hasFila = linha.fila1 || linha.fila2 || linha.fila3
  const isCancelado = (linha.status || '').toUpperCase() === 'CANCELADO'

  // Formata data_live (YYYY-MM-DD → DD/MM) para exibição compacta no histórico
  const dataFormatada = linha.data_live
    ? `${linha.data_live.slice(8, 10)}/${linha.data_live.slice(5, 7)}`
    : '—'

  return (
    <tr className={linha.isSent && !modoHistorico ? 'linha-enviada' : isCancelado ? 'linha-cancelada' : ''}>
      {/* SACOLA / DATA-LIVE */}
      <td className="col-sacola td-sacola"
        onClick={() => (modoHistorico || !linha.isSent) && onAbrirModal(idx)}
        title="Clique para editar">
        {modoHistorico ? (
          <div style={{ textAlign: 'center', lineHeight: 1.4 }}>
            <div style={{ color: 'var(--blue)', fontWeight: 700, fontSize: 13 }}>{dataFormatada}</div>
            <div style={{ color: 'var(--muted)', fontSize: 10, maxWidth: 60, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', margin: '0 auto' }}
              title={linha.live_nome}>{linha.live_nome || '—'}</div>
          </div>
        ) : (
          <input className="cell-input sacola" value={linha.sacolinha ?? ''} readOnly tabIndex={-1} />
        )}
      </td>

      {/* PRODUTO */}
      <td>
        <AutocompleteInput className="cell-input" value={linha.produto}
          list={listas.produtos} onChange={v => upd('produto', v)} disabled={linha.isSent} />
      </td>

      {/* MODELO */}
      <td>
        <AutocompleteInput className="cell-input" value={linha.modelo}
          list={listas.modelos} onChange={v => upd('modelo', v)} disabled={linha.isSent} />
      </td>

      {/* COR */}
      <td className="col-cor">
        <AutocompleteInput className="cell-input" value={linha.cor}
          list={listas.cores} onChange={v => upd('cor', v)} disabled={linha.isSent} />
      </td>

      {/* MARCA */}
      <td>
        <AutocompleteInput className="cell-input" value={linha.marca}
          list={listas.marcas} onChange={v => upd('marca', v)} disabled={linha.isSent} />
      </td>

      {/* TAMANHO */}
      <td className="col-tam">
        <input className="cell-input" value={linha.tamanho}
          onChange={e => upd('tamanho', e.target.value)}
          onKeyDown={onEnterNext} disabled={linha.isSent} />
      </td>

      {/* PREÇO */}
      <td className="col-preco">
        <input className="cell-input price" value={linha.preco}
          onChange={e => upd('preco', e.target.value.replace(/[^\d,]/g, ''))}
          onKeyDown={onEnterNext} disabled={linha.isSent} />
      </td>

      {/* CÓDIGO */}
      <td className="col-cod">
        <input className="cell-input" value={linha.codigo}
          onChange={e => upd('codigo', e.target.value)}
          onKeyDown={onEnterNext} disabled={linha.isSent} />
      </td>

      {/* CLIENTE */}
      <td className="col-cliente">
        <AutocompleteInput
          className="cell-input"
          value={linha.cliente_nome}
          list={listas.clientes}
          onChange={v => upd('cliente_nome', v)}
          onBlur={() => onClienteBlur(idx)}
          onSelect={v => onClienteSelect?.(idx, v)}
          onEnterNewRow={onNovoFromRow}
          disabled={linha.isSent}
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
          {/* Fila — visível em live e no histórico */}
          <button
            className={`btn-action-sm fila${hasFila ? ' has-fila' : ''}`}
            title="Fila de Espera"
            onClick={e => { e.stopPropagation(); onAbrirFila(idx) }}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="8.5" cy="7" r="4"/>
              <line x1="20" y1="8" x2="20" y2="14"/><line x1="23" y1="11" x2="17" y2="11"/>
            </svg>
          </button>

          {/* Enviar — oculto no histórico */}
          {!linha.isSent && !modoHistorico && (
            <button className="btn-action-sm send" title="Enviar para o banco"
              onClick={e => { e.stopPropagation(); onEnviar(idx) }}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/>
              </svg>
            </button>
          )}

          {/* Estornar — sempre visível no histórico */}
          {(linha.isSent || modoHistorico) && (
            <button className="btn-action-sm undo" title="Estornar envio" style={{ display: 'flex' }}
              onClick={e => { e.stopPropagation(); onEstornar(idx) }}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="9 14 4 9 9 4"/><path d="M20 20v-7a4 4 0 0 0-4-4H4"/>
              </svg>
            </button>
          )}

          {/* Copiar — oculto no histórico */}
          {!linha.isSent && !modoHistorico && (
            <button className="btn-action-sm copy" title="Copiar linha"
              onClick={e => { e.stopPropagation(); onCopiar(idx) }}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/>
                <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
              </svg>
            </button>
          )}

          {/* Excluir — visível sempre (pendente ou histórico) */}
          {(!linha.isSent || modoHistorico) && (
            <button className="btn-action-sm del" title="Excluir linha"
              onClick={e => { e.stopPropagation(); onExcluir(idx) }}>
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
})

export default TabelaRow
