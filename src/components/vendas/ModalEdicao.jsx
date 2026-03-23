import { useState } from 'react'
import AutocompleteInput from '../ui/AutocompleteInput'

export default function ModalEdicao({ linha, idx, listas, globalDB, onConfirmar, onFechar, setAlerta, setConfirmacao }) {
  const [campos, setCampos] = useState({
    produto:      linha.produto      || '',
    modelo:       linha.modelo       || '',
    cor:          linha.cor          || '',
    marca:        linha.marca        || '',
    tamanho:      linha.tamanho      || '',
    preco:        linha.preco        || '',
    codigo:       linha.codigo       || '',
    cliente_nome: linha.cliente_nome || '',
    liberado:     linha.liberado     || false,
  })

  function upd(field, val) {
    setCampos(prev => {
      const next = { ...prev, [field]: val }
      if (field === 'cliente_nome') next.liberado = false
      if (field === 'preco') next.preco = val.replace(/[^\d,]/g, '')
      return next
    })
  }

  function handleConfirmar() {
    const nome = campos.cliente_nome.trim().toLowerCase()
    if (nome && !campos.liberado && globalDB?.bloqueados?.[nome]) {
      const info = globalDB.bloqueados[nome]
      let msg = `O cliente <b style="color:#f28b82">${campos.cliente_nome}</b> está BLOQUEADO.<br><br>`
      if (info.manual) msg += `<b>Bloqueio Manual:</b> ${info.msgManual || 'Sem motivo especificado.'}<br><br>`
      if (info.dividas?.length) {
        msg += `<b>Pendências:</b><br>`
        info.dividas.forEach(d => { msg += `- Live <b>${d.data}</b> — R$ <b>${d.valor}</b><br>` })
        msg += '<br>'
      }
      msg += 'Deseja liberar mesmo assim?'
      setConfirmacao({
        titulo: '🚫 Cliente Bloqueado',
        mensagem: msg,
        onSim: () => {
          setConfirmacao(null)
          onConfirmar(idx, { ...campos, liberado: true })
        },
        onNao: () => {
          setConfirmacao(null)
          setCampos(prev => ({ ...prev, cliente_nome: '', liberado: false }))
        },
      })
      return
    }
    onConfirmar(idx, campos)
  }

  return (
    <div className="modal-overlay">
      <div className="modal-card">
        <div className="modal-header"><h3>Editar Venda</h3></div>
        <div className="modal-body">
          <div className="modal-grid">
            <div className="modal-field">
              <label>Sacola (Auto)</label>
              <input value={linha.sacolinha ?? ''} readOnly tabIndex={-1}
                style={{ background: 'var(--input-bg)', color: 'var(--blue)', fontWeight: 'bold' }} />
            </div>
            <div className="modal-field">
              <label>Produto</label>
              <AutocompleteInput className="cell-input" value={campos.produto}
                list={listas.produtos} onChange={v => upd('produto', v)} />
            </div>
            <div className="modal-field">
              <label>Modelo</label>
              <AutocompleteInput className="cell-input" value={campos.modelo}
                list={listas.modelos} onChange={v => upd('modelo', v)} />
            </div>
            <div className="modal-field">
              <label>Cor</label>
              <AutocompleteInput className="cell-input" value={campos.cor}
                list={listas.cores} onChange={v => upd('cor', v)} />
            </div>
            <div className="modal-field">
              <label>Marca</label>
              <AutocompleteInput className="cell-input" value={campos.marca}
                list={listas.marcas} onChange={v => upd('marca', v)} />
            </div>
            <div className="modal-field">
              <label>Tamanho</label>
              <input className="cell-input" value={campos.tamanho}
                onChange={e => upd('tamanho', e.target.value)} />
            </div>
            <div className="modal-field">
              <label>Preço</label>
              <input className="cell-input price" value={campos.preco}
                onChange={e => upd('preco', e.target.value)} />
            </div>
            <div className="modal-field">
              <label>Cód.</label>
              <input className="cell-input" value={campos.codigo}
                onChange={e => upd('codigo', e.target.value)} />
            </div>
            <div className="modal-field full">
              <label>Cliente (Instagram)</label>
              <AutocompleteInput className="cell-input" value={campos.cliente_nome}
                list={listas.clientes} onChange={v => upd('cliente_nome', v)} />
            </div>
          </div>
        </div>
        <div className="modal-footer">
          <button className="btn-cancel" onClick={onFechar}>Cancelar</button>
          <button className="btn-confirm" onClick={handleConfirmar}>Confirmar na Linha</button>
        </div>
      </div>
    </div>
  )
}
