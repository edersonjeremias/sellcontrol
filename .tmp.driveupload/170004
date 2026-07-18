import AutocompleteInput from './AutocompleteInput'

const IconSend  = () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
const IconUndo  = () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 14 4 9 9 4"/><path d="M20 20v-7a4 4 0 0 0-4-4H4"/></svg>
const IconFila  = () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="8.5" cy="7" r="4"/><line x1="20" y1="8" x2="20" y2="14"/><line x1="23" y1="11" x2="17" y2="11"/></svg>
const IconCopy  = () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
const IconDel   = () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>

export default function LinhaVenda({
  linha, listas,
  onUpdate, onAbrirModal, onAbrirFila,
  onEnviar, onEstornar, onCopiar, onExcluir,
  onClienteChange, onNovaLinha,
}) {
  if (linha.isDeleted) return null

  const sent = linha.isSent
  const hasFila = !!(linha.fila1 || linha.fila2 || linha.fila3)

  function upd(campo, val) { onUpdate?.(campo, val) }

  function handlePreco(e) {
    upd('preco', e.target.value.replace(/[^\d,]/g, ''))
  }

  return (
    <tr className={sent ? 'linha-enviada' : ''}>
      {/* SACOLA */}
      <td className="col-sacola td-sacola" onClick={() => !sent && onAbrirModal?.()} title="Clique para editar">
        <input className="cell-input sacola" readOnly tabIndex={-1}
          value={linha.sacolinha ?? ''} onChange={() => {}} />
      </td>

      {/* PRODUTO */}
      <td>
        <AutocompleteInput value={linha.produto} list={listas.produtos}
          onChange={v => upd('produto', v)} onSelect={v => upd('produto', v)} />
      </td>

      {/* MODELO */}
      <td>
        <AutocompleteInput value={linha.modelo} list={listas.modelos}
          onChange={v => upd('modelo', v)} onSelect={v => upd('modelo', v)} />
      </td>

      {/* COR */}
      <td className="col-cor">
        <AutocompleteInput value={linha.cor} list={listas.cores}
          onChange={v => upd('cor', v)} onSelect={v => upd('cor', v)} />
      </td>

      {/* MARCA */}
      <td>
        <AutocompleteInput value={linha.marca} list={listas.marcas}
          onChange={v => upd('marca', v)} onSelect={v => upd('marca', v)} />
      </td>

      {/* TAMANHO */}
      <td className="col-tam">
        <input className="cell-input" value={linha.tamanho}
          onChange={e => upd('tamanho', e.target.value)} />
      </td>

      {/* PREÇO */}
      <td className="col-preco">
        <input className="cell-input price" value={linha.preco}
          onChange={handlePreco} />
      </td>

      {/* CÓDIGO */}
      <td className="col-cod">
        <input className="cell-input" value={linha.codigo}
          onChange={e => upd('codigo', e.target.value)} />
      </td>

      {/* CLIENTE */}
      <td className="col-cliente">
        <AutocompleteInput
          value={linha.cliente_nome}
          list={listas.clientes}
          onChange={v => upd('cliente_nome', v)}
          onSelect={v => onClienteChange?.(v)}
          onEnterKey={onNovaLinha}
        />
      </td>

      {/* AÇÕES */}
      <td className="col-acoes">
        <div className="acoes-wrapper">
          <button className={`btn-action-sm fila${hasFila ? ' has-fila' : ''}`}
            title="Fila de Espera" onClick={onAbrirFila}><IconFila /></button>
          <button className="btn-action-sm send"
            title="Enviar para o Banco" onClick={onEnviar}><IconSend /></button>
          <button className="btn-action-sm undo"
            title="Estornar Envio" onClick={onEstornar}><IconUndo /></button>
          <button className="btn-action-sm copy"
            title="Copiar Linha" onClick={onCopiar}><IconCopy /></button>
          <button className="btn-action-sm del"
            title="Excluir Linha" onClick={onExcluir}><IconDel /></button>
        </div>
      </td>
    </tr>
  )
}
