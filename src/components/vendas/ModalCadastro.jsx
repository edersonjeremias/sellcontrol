import { useState } from 'react'

// ✅ Função para capitalizar primeira letra
function capitalizar(texto) {
  if (!texto) return texto
  return texto.charAt(0).toUpperCase() + texto.slice(1)
}

export default function ModalCadastro({ onSalvar, onFechar }) {
  const [tipo,    setTipo]    = useState('cliente')
  const [valor,   setValor]   = useState('')
  const [celular, setCelular] = useState('')
  const [salvando, setSalvando] = useState(false)

  const isCliente = tipo === 'cliente'
  const deveCapitalizar = ['produto', 'modelo', 'cor', 'marca'].includes(tipo)

  async function salvar() {
    const valorLimpo = valor.trim()
    const celularLimpo = celular.trim()

    if (!valorLimpo) return
    if (isCliente && !celularLimpo) return

    setSalvando(true)
    try {
      await onSalvar?.(tipo, valorLimpo, celularLimpo)
      setValor(''); setCelular('')
    } finally {
      setSalvando(false)
    }
  }

  function handleValorChange(e) {
    let texto = e.target.value.trimStart() // Remove espaços do início
    if (deveCapitalizar && texto) {
      texto = capitalizar(texto)
    }
    setValor(texto)
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

          <div className="modal-field" style={{ marginTop: 15 }}>
            <label>{isCliente ? 'Instagram (@usuario)' : 'Nome do item'}</label>
            <input className="cell-input" value={valor} placeholder="Digite..."
              onChange={handleValorChange}
              onKeyDown={e => e.key === 'Enter' && salvar()} />
          </div>

          {isCliente && (
            <div className="modal-field" style={{ marginTop: 15 }}>
              <label>WhatsApp (apenas números)</label>
              <input className="cell-input" value={celular} placeholder="Apenas números..."
                onChange={e => setCelular(e.target.value.replace(/\D/g, '').trimStart())} />
            </div>
          )}
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
