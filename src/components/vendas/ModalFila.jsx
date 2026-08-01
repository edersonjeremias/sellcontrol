import { useState, useEffect } from 'react'
import AutocompleteInput from '../ui/AutocompleteInput'

export default function ModalFila({ linha, clientes, onSalvar, onFechar }) {
  const [filas, setFilas] = useState({ fila1: '', fila2: '', fila3: '' })

  useEffect(() => {
    if (!linha) return
    setFilas({ fila1: linha.fila1 || '', fila2: linha.fila2 || '', fila3: linha.fila3 || '' })
  }, [linha])

  if (!linha) return null

  function trocar(num) {
    const val = filas[`fila${num}`].trim()
    if (!val) return
    // Passa o cliente da fila para o campo principal via onSalvar com flag especial
    onSalvar?.({ ...filas, trocarCliente: val, numFila: num })
  }

  return (
    <div className="modal-overlay" style={{ background: 'transparent', backdropFilter: 'none' }}>
      <div className="modal-card mini" style={{ overflow: 'visible' }}>
        <div className="modal-header"><h3>Fila de Espera</h3></div>
        <div className="modal-body" style={{ overflow: 'visible' }}>
          {[1, 2, 3].map(n => (
            <div className="modal-field" key={n} style={{ marginBottom: 12 }}>
              <label>Fila {n}</label>
              <div style={{ display: 'flex', gap: 8 }}>
                <AutocompleteInput
                  value={filas[`fila${n}`]}
                  list={clientes}
                  onChange={v => setFilas(prev => ({ ...prev, [`fila${n}`]: v }))}
                  onSelect={v => setFilas(prev => ({ ...prev, [`fila${n}`]: v }))}
                  style={{
                    height: 36,
                    padding: '0 10px',
                    border: '1px solid var(--border-light)',
                    borderRadius: 6,
                    background: 'var(--input-bg)',
                    color: 'var(--text-body)',
                    width: '100%',
                    fontSize: 14
                  }}
                />
                <button className="btn-acao btn-green" onClick={() => trocar(n)}
                  style={{ minWidth: 44, padding: 0, flex: 'none' }} title="Passar para Cliente Principal">
                  ⬆️
                </button>
              </div>
            </div>
          ))}
        </div>
        <div className="modal-footer">
          <button className="btn-cancel"  onClick={onFechar}>Fechar</button>
          <button className="btn-confirm" onClick={() => onSalvar?.(filas)}>Salvar Fila</button>
        </div>
      </div>
    </div>
  )
}
