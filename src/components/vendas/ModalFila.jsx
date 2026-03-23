import { useState } from 'react'
import AutocompleteInput from '../ui/AutocompleteInput'

export default function ModalFila({ linha, idx, listas, onSalvar, onTrocarCliente, onFechar }) {
  const [f1, setF1] = useState(linha.fila1 || '')
  const [f2, setF2] = useState(linha.fila2 || '')
  const [f3, setF3] = useState(linha.fila3 || '')

  function trocar(numFila) {
    const val = numFila === 1 ? f1 : numFila === 2 ? f2 : f3
    if (!val.trim()) return
    onTrocarCliente(idx, val.trim())
    if (numFila === 1) setF1('')
    if (numFila === 2) setF2('')
    if (numFila === 3) setF3('')
  }

  const inputStyle = {
    width: '100%', height: 44, padding: '0 14px',
    border: '1px solid var(--border-light)', borderRadius: 8,
    background: 'var(--input-bg)', color: 'var(--input-text)',
  }

  function FilaField({ label, value, onChange, num }) {
    return (
      <div className="modal-field" style={{ marginBottom: 12 }}>
        <label>{label}</label>
        <div style={{ display: 'flex', gap: 8 }}>
          <AutocompleteInput
            value={value} onChange={onChange} list={listas.clientes}
            style={{ flex: 1 }}
            className="cell-input"
          />
          <button className="btn-acao btn-green" onClick={() => trocar(num)}
            style={{ minWidth: 44, padding: 0, flex: 'none' }} title="Passar para Cliente Principal">
            ⬆️
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="modal-overlay">
      <div className="modal-card mini">
        <div className="modal-header"><h3>Fila de Espera</h3></div>
        <div className="modal-body">
          <FilaField label="Fila 1" value={f1} onChange={setF1} num={1} />
          <FilaField label="Fila 2" value={f2} onChange={setF2} num={2} />
          <FilaField label="Fila 3" value={f3} onChange={setF3} num={3} />
        </div>
        <div className="modal-footer">
          <button className="btn-cancel" onClick={onFechar}>Fechar</button>
          <button className="btn-confirm" onClick={() => onSalvar(idx, f1, f2, f3)}>Salvar Fila</button>
        </div>
      </div>
    </div>
  )
}
