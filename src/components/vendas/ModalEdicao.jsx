import { useState, useEffect } from 'react'
import AutocompleteInput from './AutocompleteInput'

export default function ModalEdicao({ linha, listas, onConfirmar, onFechar, onBloqueio }) {
  const [campos, setCampos] = useState({
    sacola: '', produto: '', modelo: '', cor: '', marca: '',
    tamanho: '', preco: '', codigo: '', cliente_nome: '', liberado: false,
  })

  useEffect(() => {
    if (!linha) return
    setCampos({
      sacola:       linha.sacolinha ?? '',
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
  }, [linha])

  if (!linha) return null

  function set(campo, val) {
    setCampos(prev => ({ ...prev, [campo]: val }))
  }

  function handlePreco(val) {
    set('preco', val.replace(/[^\d,]/g, ''))
  }

  function handleClienteSelect(val) {
    const bloqueado = onBloqueio?.(val, campos.liberado)
    if (!bloqueado) set('cliente_nome', val)
  }

  function confirmar() {
    onConfirmar?.({ ...campos })
  }

  return (
    <div className="modal-overlay">
      <div className="modal-card">
        <div className="modal-header"><h3>Editar Venda</h3></div>
        <div className="modal-body">
          <div className="modal-grid">
            <div className="modal-field">
              <label>Sacola (Auto)</label>
              <input value={campos.sacola} readOnly tabIndex={-1}
                style={{ background: 'var(--input-bg)', color: 'var(--blue)', fontWeight: 'bold' }} />
            </div>
            <div className="modal-field">
              <label>Produto</label>
              <AutocompleteInput value={campos.produto} list={listas.produtos}
                onChange={v => set('produto', v)} onSelect={v => set('produto', v)} />
            </div>
            <div className="modal-field">
              <label>Modelo</label>
              <AutocompleteInput value={campos.modelo} list={listas.modelos}
                onChange={v => set('modelo', v)} onSelect={v => set('modelo', v)} />
            </div>
            <div className="modal-field">
              <label>Cor</label>
              <AutocompleteInput value={campos.cor} list={listas.cores}
                onChange={v => set('cor', v)} onSelect={v => set('cor', v)} />
            </div>
            <div className="modal-field">
              <label>Marca</label>
              <AutocompleteInput value={campos.marca} list={listas.marcas}
                onChange={v => set('marca', v)} onSelect={v => set('marca', v)} />
            </div>
            <div className="modal-field">
              <label>Tamanho</label>
              <input className="cell-input" value={campos.tamanho}
                onChange={e => set('tamanho', e.target.value)} />
            </div>
            <div className="modal-field">
              <label>Preço</label>
              <input className="cell-input price" value={campos.preco}
                onChange={e => handlePreco(e.target.value)} />
            </div>
            <div className="modal-field">
              <label>Cód.</label>
              <input className="cell-input" value={campos.codigo}
                onChange={e => set('codigo', e.target.value)} />
            </div>
            <div className="modal-field full">
              <label>Cliente</label>
              <AutocompleteInput value={campos.cliente_nome} list={listas.clientes}
                onChange={v => set('cliente_nome', v)}
                onSelect={handleClienteSelect} />
            </div>
          </div>
        </div>
        <div className="modal-footer">
          <button className="btn-cancel"  onClick={onFechar}>Cancelar</button>
          <button className="btn-confirm" onClick={confirmar}>Confirmar na Linha</button>
        </div>
      </div>
    </div>
  )
}
