import { useState } from 'react'
import { usePortalToast } from './PortalToast'
import { encerrarSacolinha } from '../../services/portalService'

const OPCOES = [
  { value: 'Correio', label: '📮 Enviar por Correio / Transportadora' },
  { value: 'Retirada', label: '🏪 Vou retirar na loja' },
]

export default function ModalEncerramento({ instagram, onClose, onConfirm }) {
  const [opcao, setOpcao]   = useState('Correio')
  const [obs, setObs]       = useState('')
  const [saving, setSaving] = useState(false)
  const toast = usePortalToast()

  async function confirmar() {
    setSaving(true)
    try {
      await encerrarSacolinha(instagram, opcao, obs)
      toast('Sacolinha encerrada com sucesso! Entraremos em contato em breve.', 'success', 4000)
      onConfirm?.()
    } catch {
      toast('Erro ao encerrar. Tente novamente.', 'error')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="portal-modal-overlay" onClick={onClose}>
      <div className="portal-modal" onClick={e => e.stopPropagation()}>
        <div className="portal-modal-title">🛍 Encerrar Sacolinha</div>
        <div className="portal-modal-sub">
          Como deseja receber seus produtos?
        </div>

        <div className="portal-radio-group">
          {OPCOES.map(o => (
            <label
              key={o.value}
              className={`portal-radio-option${opcao === o.value ? ' selected' : ''}`}
              onClick={() => setOpcao(o.value)}
            >
              <input
                type="radio"
                name="opcaoEntrega"
                value={o.value}
                checked={opcao === o.value}
                onChange={() => setOpcao(o.value)}
              />
              {o.label}
            </label>
          ))}
        </div>

        <div className="portal-field">
          <label className="portal-label">Observações (opcional)</label>
          <textarea
            className="portal-textarea"
            rows={3}
            placeholder="Ex: endereço para entrega, horário de retirada..."
            value={obs}
            onChange={e => setObs(e.target.value)}
          />
        </div>

        <div style={{ display:'flex', gap:10, marginTop:4 }}>
          <button className="portal-btn portal-btn-gray" style={{ flex:1 }} onClick={onClose}>
            Cancelar
          </button>
          <button
            className="portal-btn portal-btn-green"
            style={{ flex:2 }}
            onClick={confirmar}
            disabled={saving}
          >
            {saving ? 'Enviando...' : '✓ Confirmar'}
          </button>
        </div>
      </div>
    </div>
  )
}
