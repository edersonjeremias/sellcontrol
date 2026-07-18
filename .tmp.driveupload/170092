import { useState } from 'react'
import { STATUS_PROD_OPTS, STATUS_ENTREGA_OPTS, PACOTE_OPTS } from '../../services/producaoService'

export default function DetalheModal({ row, onSave, onClose }) {
  const [local, setLocal] = useState({ ...row })
  const upd = (f, v) => setLocal((p) => ({ ...p, [f]: v }))

  const handleSave = () => { onSave(local); onClose() }

  const Field = ({ label, children }) => (
    <div style={{ marginBottom: 10 }}>
      <div style={{ fontSize: 10, color: '#abb1bd', textTransform: 'uppercase', letterSpacing: '.5px', marginBottom: 3 }}>{label}</div>
      {children}
    </div>
  )

  const inp = (field, opts = {}) => (
    <input
      value={local[field] || ''}
      onChange={(e) => upd(field, e.target.value)}
      style={{
        width: '100%', background: '#1c1f24', border: '1px solid #3c414b',
        color: '#f0f0f1', borderRadius: 5, padding: '7px 10px', fontSize: 13,
        ...opts.style,
      }}
    />
  )

  const sel = (field, opts) => (
    <select
      value={local[field] || ''}
      onChange={(e) => upd(field, e.target.value)}
      style={{
        width: '100%', background: '#1c1f24', border: '1px solid #3c414b',
        color: '#f0f0f1', borderRadius: 5, padding: '7px 10px', fontSize: 13,
      }}
    >
      <option value="">--</option>
      {opts.map((o) => <option key={o} value={o}>{o}</option>)}
    </select>
  )

  return (
    <div className="prod-modal-overlay" onClick={onClose}>
      <div className="prod-modal-card" onClick={(e) => e.stopPropagation()}
        style={{ maxWidth: 480, maxHeight: '92vh', overflowY: 'auto' }}>
        <div className="prod-modal-header">
          <span>✏️ {row.cliente_nome || 'Pedido'}</span>
          <button type="button" className="prod-modal-close" onClick={onClose}>✕</button>
        </div>

        <div style={{ fontSize: 12, color: '#abb1bd', marginBottom: 14 }}>
          Solicitado: <b style={{ color: '#f0f0f1' }}>{row.data_solicitado_fmt}</b>
          &nbsp;·&nbsp; Dias úteis: <b style={{ color: row.atrasado ? '#ff9800' : '#f0f0f1' }}>{row.dias_u}</b>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <Field label="Status Produção">{sel('status_prod', STATUS_PROD_OPTS)}</Field>
          <Field label="Pacote">{sel('pacote', PACOTE_OPTS)}</Field>
        </div>

        <Field label="Obs. Cliente">{inp('obs_cliente')}</Field>
        <Field label="Obs. Produção">{inp('obs_prod')}</Field>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <Field label="Peso">{inp('peso')}</Field>
          <Field label="Pedido Cód.">{inp('pedido_codigo')}</Field>
        </div>

        <Field label="Status Entrega">{sel('status_entrega', STATUS_ENTREGA_OPTS)}</Field>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <Field label="Frete (R$)">{inp('valor_frete')}</Field>
          <Field label="Dec. (R$)">{inp('valor_dec')}</Field>
        </div>

        <Field label="Msg Cobrança">{inp('msg_cobranca')}</Field>
        <Field label="Rastreio">{inp('rastreio')}</Field>

        <div className="prod-modal-footer" style={{ marginTop: 16 }}>
          <button type="button" className="prod-btn prod-btn-ghost" onClick={onClose}>Cancelar</button>
          <button type="button" className="prod-btn prod-btn-green" onClick={handleSave}>Salvar</button>
        </div>
      </div>
    </div>
  )
}
