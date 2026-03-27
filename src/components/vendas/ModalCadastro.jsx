import { useState } from 'react'

export default function ModalCadastro({ onSalvar, onFechar }) {
  const [tipo,    setTipo]    = useState('produto')
  const [valor,   setValor]   = useState('')
  const [celular, setCelular] = useState('')
  const [salvando, setSalvando] = useState(false)

  const isCliente = tipo === 'cliente'

  async function salvar() {
    if (!valor.trim()) return
    if (isCliente && !celular.trim()) return
    setSalvando(true)
    await onSalvar?.(tipo, valor, celular)
    setSalvando(false)
    setValor(''); setCelular('')
  }

  return (
    <div className="modal-overlay">
      <div className="modal-card mini">
        <div className="modal-header"><h3>Novo Cadastro</h3></div>
        <div className="modal-body">
          <div className="modal-field">
            <label>Onde deseja cadastrar?</label>
            <select value={tipo} onChange={e => setTipo(e.target.value)}
              style={{ padding: 12, border: '1px solid var(--border-light)', borderRadius: 8, fontSize: 15, background: 'var(--input-bg)', color: 'var(--input-text)' }}>
              <option value="produto">Produto</option>
              <option value="modelo">Modelo</option>
              <option value="cor">Cor</option>
              <option value="marca">Marca</option>
              <option value="cliente">Cliente</option>
            </select>
          </div>

          {isCliente && (
            <div className="modal-field" style={{ marginTop: 15 }}>
              <label>WhatsApp (apenas números)</label>
              <input className="cell-input" value={celular} placeholder="Apenas números..."
                onChange={e => setCelular(e.target.value.replace(/\D/g, ''))} />
            </div>
          )}

          <div className="modal-field" style={{ marginTop: 15 }}>
            <label>{isCliente ? 'Instagram (@usuario)' : 'Nome do item'}</label>
            <input className="cell-input" value={valor} placeholder="Digite..."
              onChange={e => setValor(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && salvar()} />
          </div>
        </div>
        <div className="modal-footer">
          <button className="btn-cancel"  onClick={onFechar} disabled={salvando}>Cancelar</button>
          <button className="btn-confirm" onClick={salvar}   disabled={salvando}>
            {salvando ? 'Salvando...' : 'Salvar no Banco'}
          </button>
        </div>
      </div>
    </div>
  )
}
