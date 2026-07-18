// ── Modal de Alerta ────────────────────────────────────────────
export function ModalAlerta({ titulo, mensagem, onFechar }) {
  if (!mensagem) return null
  return (
    <div className="modal-overlay">
      <div className="modal-card mini">
        <div className="modal-header"><h3>{titulo || 'Aviso'}</h3></div>
        <div className="modal-body" dangerouslySetInnerHTML={{ __html: mensagem }} />
        <div className="modal-footer">
          <button className="btn-confirm" onClick={onFechar}>Entendi</button>
        </div>
      </div>
    </div>
  )
}

// ── Modal de Confirmação ───────────────────────────────────────
export function ModalConfirmacao({ titulo, mensagem, onSim, onNao }) {
  if (!mensagem) return null
  return (
    <div className="modal-overlay">
      <div className="modal-card mini">
        <div className="modal-header"><h3>{titulo || 'Atenção'}</h3></div>
        <div className="modal-body" dangerouslySetInnerHTML={{ __html: mensagem }} />
        <div className="modal-footer">
          <button className="btn-confirm" onClick={onSim}>Sim, Continuar</button>
          <button className="btn-cancel"  onClick={onNao}>Cancelar</button>
        </div>
      </div>
    </div>
  )
}
