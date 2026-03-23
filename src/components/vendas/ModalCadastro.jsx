import { useState } from 'react'

export default function ModalCadastro({ onSalvar, onFechar, showToast }) {
  const [tipo,      setTipo]      = useState('produto')
  const [valor,     setValor]     = useState('')
  const [whatsapp,  setWhatsapp]  = useState('')
  const [salvando,  setSalvando]  = useState(false)

  const isCliente = tipo === 'cliente'

  function limparNumero(v) { return v.replace(/\D/g, '') }

  async function handleSalvar() {
    if (!valor.trim()) { showToast('Preencha o nome.', 'error'); return }
    if (isCliente && !whatsapp.trim()) { showToast('Preencha o WhatsApp.', 'error'); return }
    setSalvando(true)
    try {
      await onSalvar(tipo, valor.trim(), whatsapp.trim())
      showToast('Cadastro realizado com sucesso!', 'success')
      setValor(''); setWhatsapp(''); setTipo('produto')
      onFechar()
    } catch (err) {
      const msg = err?.message?.includes('duplicate') ? 'Este item já existe.' : 'Erro ao salvar.'
      showToast(msg, 'error')
    } finally {
      setSalvando(false)
    }
  }

  return (
    <div className="modal-overlay">
      <div className="modal-card mini">
        <div className="modal-header"><h3>Novo Cadastro</h3></div>
        <div className="modal-body">
          <div className="modal-field">
            <label>Onde deseja cadastrar?</label>
            <select value={tipo} onChange={e => { setTipo(e.target.value); setValor(''); setWhatsapp('') }}
              style={{ padding: 12, border: '1px solid var(--border-light)', borderRadius: 8, fontSize: 15, background: 'var(--input-bg)', color: 'var(--input-text)', width: '100%' }}>
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
              <input
                type="text"
                value={whatsapp}
                onChange={e => setWhatsapp(limparNumero(e.target.value))}
                placeholder="Ex: 11999999999"
                style={{ padding: 12, border: '1px solid var(--border-light)', borderRadius: 8, fontSize: 15, background: 'var(--input-bg)', color: 'var(--input-text)', width: '100%' }}
              />
            </div>
          )}

          <div className="modal-field" style={{ marginTop: 15 }}>
            <label>{isCliente ? 'Instagram do Cliente' : 'Nome do item'}</label>
            <input
              type="text"
              value={valor}
              onChange={e => setValor(e.target.value)}
              placeholder="Digite aqui..."
              onKeyDown={e => e.key === 'Enter' && handleSalvar()}
              style={{ padding: 12, border: '1px solid var(--border-light)', borderRadius: 8, fontSize: 15, background: 'var(--input-bg)', color: 'var(--input-text)', width: '100%' }}
            />
          </div>
        </div>
        <div className="modal-footer">
          <button className="btn-cancel" onClick={onFechar} disabled={salvando}>Cancelar</button>
          <button className="btn-confirm" onClick={handleSalvar} disabled={salvando}>
            {salvando ? 'Salvando...' : 'Salvar no Banco'}
          </button>
        </div>
      </div>
    </div>
  )
}
